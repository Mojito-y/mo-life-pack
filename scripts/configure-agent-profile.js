import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import lockfile from "proper-lockfile";

const repoRoot = process.cwd();
const dryRun = process.argv.includes("--dry-run");

function parseArguments(args) {
  let agentId = "";
  let profileOverride = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      continue;
    }
    if (arg === "--profile") {
      const value = args[index + 1]?.trim();
      if (!value || value.startsWith("--")) {
        throw new Error("--profile 需要一个 profile 名称。");
      }
      profileOverride = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`未知参数：${arg}`);
    }
    if (agentId) {
      throw new Error(`多余参数：${arg}`);
    }
    agentId = arg.trim();
  }
  if (profileOverride && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profileOverride)) {
    throw new Error(`profile 名称不合法：${profileOverride}`);
  }
  return { agentId, profileOverride };
}

const { agentId, profileOverride } = parseArguments(process.argv.slice(2));

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, "utf8"));
}

if (!agentId) {
  console.error("用法：npm run agent:configure-profile -- <agent-id> [--profile <profile-name>] [--dry-run]");
  process.exit(1);
}

const catalog = await readJson(path.join(repoRoot, "templates", "agent-catalog.json"));
const agent = catalog.find((item) => item.id === agentId);
if (!agent) {
  throw new Error(`未知 agent：${agentId}`);
}
if (!agent.bridgeWorkspace) {
  throw new Error(`${agentId} 未配置独立 bridgeWorkspace，无需执行此命令。`);
}

const larkChannelHome = process.env.LARK_CHANNEL_HOME || path.join(os.homedir(), ".lark-channel");
const configPath = path.join(larkChannelHome, "config.json");
if (!(await exists(configPath))) {
  throw new Error(`找不到 ${configPath}，请先完成 profile 扫码绑定。`);
}

const profileName = profileOverride || agent.bridgeProfile;
const workspace = path.resolve(repoRoot, agent.bridgeWorkspace);
const legacyWorkspaces = (agent.legacyBridgeWorkspaces || []).map((value) => path.resolve(repoRoot, value));
const sessionCatalogPath = path.join(larkChannelHome, "profiles", profileName, "sessions.json.catalog.json");

if (!(await exists(workspace))) {
  throw new Error(`工作目录不存在：${workspace}`);
}

function buildNextConfig(rootConfig) {
  const profile = rootConfig.profiles?.[profileName];
  if (!profile) {
    throw new Error(`profile ${profileName} 不存在，请先运行 npm run bridge:run -- ${agent.id} 完成扫码。`);
  }
  if (profile.agentKind !== "codex") {
    throw new Error(`profile ${profileName} 不是 Codex profile，拒绝修改。`);
  }

  return {
    ...rootConfig,
    profiles: {
      ...rootConfig.profiles,
      [profileName]: {
        ...profile,
        workspaces: {
          ...profile.workspaces,
          default: workspace
        },
        codex: {
          ...profile.codex,
          ignoreRules: false
        }
      }
    }
  };
}

function buildNextSessionCatalog(catalog) {
  if (!Array.isArray(catalog) || !legacyWorkspaces.length) {
    return { catalog, migrated: 0 };
  }
  const legacyPaths = new Set(legacyWorkspaces);
  let migrated = 0;
  const nextCatalog = catalog.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    let changed = false;
    const nextEntry = { ...entry };
    for (const field of ["cwdRealpath", "cwd"]) {
      if (typeof entry[field] === "string" && legacyPaths.has(path.resolve(entry[field]))) {
        nextEntry[field] = workspace;
        changed = true;
      }
    }
    if (changed) {
      migrated += 1;
    }
    return nextEntry;
  });
  return { catalog: nextCatalog, migrated };
}

async function writeJsonAtomically(targetPath, value) {
  const tempPath = `${targetPath}.tmp-${process.pid}`;
  await writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tempPath, targetPath);
}

if (dryRun) {
  buildNextConfig(await readJson(configPath));
  const sessionMigration = await exists(sessionCatalogPath)
    ? buildNextSessionCatalog(await readJson(sessionCatalogPath)).migrated
    : 0;
  process.stdout.write(`DRY RUN profile=${profileName}\n`);
  process.stdout.write(`workspaces.default=${workspace}\n`);
  process.stdout.write("codex.ignoreRules=false\n");
  process.stdout.write(`session cwd migrations=${sessionMigration}\n`);
  process.exit(0);
}

const lockTarget = `${configPath}.lock`;
await mkdir(path.dirname(lockTarget), { recursive: true });
await writeFile(lockTarget, "", { flag: "a", mode: 0o600 });
await chmod(lockTarget, 0o600).catch(() => {});
const release = await lockfile.lock(lockTarget, {
  realpath: false,
  stale: 30_000,
  update: 10_000,
  retries: {
    retries: 10,
    minTimeout: 10,
    maxTimeout: 100
  }
});
let migratedSessions = 0;
try {
  const nextConfig = buildNextConfig(await readJson(configPath));
  await writeJsonAtomically(configPath, nextConfig);
  if (await exists(sessionCatalogPath)) {
    const migration = buildNextSessionCatalog(await readJson(sessionCatalogPath));
    migratedSessions = migration.migrated;
    if (migratedSessions) {
      await writeJsonAtomically(sessionCatalogPath, migration.catalog);
    }
  }
} finally {
  await release();
}

process.stdout.write(`已配置 ${profileName} 的独立工作区和专属 Agent rules。\n`);
process.stdout.write(`已迁移 ${migratedSessions} 条旧 workspace 会话记录。\n`);
process.stdout.write("未启动 bridge，未输出或替换任何 App Secret。\n");
