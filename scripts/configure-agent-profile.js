import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import lockfile from "proper-lockfile";

const repoRoot = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const agentId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

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
  console.error("用法：npm run agent:configure-profile -- <agent-id> [--dry-run]");
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

const profileName = agent.bridgeProfile;
const workspace = path.resolve(repoRoot, agent.bridgeWorkspace);

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

if (dryRun) {
  buildNextConfig(await readJson(configPath));
  process.stdout.write(`DRY RUN profile=${profileName}\n`);
  process.stdout.write(`workspaces.default=${workspace}\n`);
  process.stdout.write("codex.ignoreRules=false\n");
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
try {
  const nextConfig = buildNextConfig(await readJson(configPath));
  const tempPath = `${configPath}.tmp-${process.pid}`;
  await writeFile(tempPath, JSON.stringify(nextConfig, null, 2) + "\n", { mode: 0o600 });
  await rename(tempPath, configPath);
} finally {
  await release();
}

process.stdout.write(`已配置 ${profileName} 的独立工作区和专属 Agent rules。\n`);
process.stdout.write("未启动 bridge，未输出或替换任何 App Secret。\n");
