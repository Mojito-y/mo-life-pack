import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const catalog = JSON.parse(await readFile(path.join(repoRoot, "templates", "agent-catalog.json"), "utf8"));
const setupCliPath = path.join(repoRoot, "packages", "setup-cli", "src", "index.js");
const addAgentScriptPath = path.join(repoRoot, "scripts", "add-agent.js");
const setupCli = await readFile(setupCliPath, "utf8");
const ids = catalog.map((agent) => agent.id);
const requiredIds = ["mo-coach", "industry-dd-agent", "investment-coach"];
const missing = requiredIds.filter((id) => !ids.includes(id));

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(value, null, 2) + "\n");
}

async function createAgentAddFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mo-life-pack-agent-add-"));
  const home = path.join(root, "home");
  const fixtureCatalog = catalog.filter((agent) => ["mo-coach", "investment-coach"].includes(agent.id));

  await writeJson(path.join(root, "templates", "agent-catalog.json"), fixtureCatalog);
  for (const agent of fixtureCatalog) {
    for (const sourcePath of [
      agent.configTemplate,
      path.join(agent.skillPath, "SKILL.md"),
      agent.rulesTemplate,
      ...(agent.bridgeWorkspace ? [path.join(agent.bridgeWorkspace, "AGENTS.md")] : [])
    ]) {
      const targetPath = path.join(root, sourcePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(path.join(repoRoot, sourcePath), targetPath);
    }
  }

  for (const sourcePath of [
    "templates/agent.config.example.json",
    "templates/env.example",
    "templates/lark-agent-bridge.config.example.json"
  ]) {
    const targetPath = path.join(root, sourcePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(path.join(repoRoot, sourcePath), targetPath);
  }
  const industrySchemaTarget = path.join(root, "agents", "industry-dd", "templates", "industry-profile.schema.json");
  await mkdir(path.dirname(industrySchemaTarget), { recursive: true });
  await cp(
    path.join(repoRoot, "agents", "industry-dd", "templates", "industry-profile.schema.json"),
    industrySchemaTarget
  );

  await mkdir(path.join(root, "scripts"), { recursive: true });
  await writeFile(path.join(root, "scripts", "install-skill.js"), "");
  await writeFile(path.join(root, ".env.local"), "");
  await mkdir(path.join(home, ".codex", "skills", "mo-coach"), { recursive: true });
  await writeFile(path.join(home, ".codex", "skills", "mo-coach", "SKILL.md"), "fixture\n");
  return { root, home };
}

function runAgentAdd(fixture, agentId = "investment-coach") {
  const result = spawnSync(process.execPath, [addAgentScriptPath, agentId], {
    cwd: fixture.root,
    env: { ...process.env, HOME: fixture.home },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`agent:add 失败：${result.stderr || result.stdout}`);
  }
  return result;
}

async function verifyAgentAddBehavior() {
  const fixtures = [];
  try {
    const inferred = await createAgentAddFixture();
    fixtures.push(inferred.root);
    await writeJson(path.join(inferred.root, "lark-agent-bridge.config.json"), { profile: "mo-coach" });
    const inferredResult = runAgentAdd(inferred);
    const inferredConfig = JSON.parse(await readFile(path.join(inferred.root, "agent.config.json"), "utf8"));
    if (inferredConfig.selectedAgent !== "mo-coach"
      || JSON.stringify(inferredConfig.installedAgents) !== JSON.stringify(["mo-coach", "investment-coach"])) {
      throw new Error(`bridge profile 推断结果错误：${JSON.stringify(inferredConfig)}`);
    }
    if (!inferredResult.stdout.includes("已从 bridge profile mo-coach 恢复默认 agent：mo-coach。")) {
      throw new Error("agent:add 没有说明默认 agent 来自已有 bridge profile");
    }

    const doctor = spawnSync(process.execPath, [setupCliPath, "doctor"], {
      cwd: inferred.root,
      env: { ...process.env, HOME: inferred.home },
      encoding: "utf8"
    });
    if (doctor.status !== 0
      || !doctor.stdout.includes("OK installed skill mo-coach")
      || !doctor.stdout.includes("OK installed skill investment-coach")) {
      throw new Error(`doctor 没有识别两个 installed skill：${doctor.stdout}${doctor.stderr}`);
    }

    const preserved = await createAgentAddFixture();
    fixtures.push(preserved.root);
    await writeJson(path.join(preserved.root, "agent.config.json"), {
      selectedAgent: "mo-coach",
      installedAgents: ["mo-coach"]
    });
    await writeJson(path.join(preserved.root, "lark-agent-bridge.config.json"), { profile: "investment-coach" });
    const preservedResult = runAgentAdd(preserved);
    const preservedConfig = JSON.parse(await readFile(path.join(preserved.root, "agent.config.json"), "utf8"));
    if (preservedConfig.selectedAgent !== "mo-coach"
      || JSON.stringify(preservedConfig.installedAgents) !== JSON.stringify(["mo-coach", "investment-coach"])) {
      throw new Error(`已有 selectedAgent 未被保留：${JSON.stringify(preservedConfig)}`);
    }
    if (!preservedResult.stdout.includes("默认 agent 保持不变：mo-coach。")) {
      throw new Error("agent:add 没有说明已有默认 agent 保持不变");
    }

    const fresh = await createAgentAddFixture();
    fixtures.push(fresh.root);
    const freshResult = runAgentAdd(fresh);
    const freshConfig = JSON.parse(await readFile(path.join(fresh.root, "agent.config.json"), "utf8"));
    if (freshConfig.selectedAgent !== "investment-coach"
      || JSON.stringify(freshConfig.installedAgents) !== JSON.stringify(["investment-coach"])) {
      throw new Error(`全新安装默认 agent 错误：${JSON.stringify(freshConfig)}`);
    }
    if (!freshResult.stdout.includes("未找到已有默认 agent，已将 investment-coach 设为默认 agent。")) {
      throw new Error("agent:add 没有说明全新安装时设置了默认 agent");
    }
  } finally {
    await Promise.all(fixtures.map((fixture) => rm(fixture, { recursive: true, force: true })));
  }
}

if (missing.length) {
  console.error(`缺少 agent catalog 项：${missing.join(", ")}`);
  process.exit(1);
}

for (const requiredText of [
  'const supportedPlatforms = new Set(["darwin", "linux"]);',
  "当前仅支持 macOS/Linux。",
  'const runnerCommand = "npm";',
  'spawnSync("which", [command]'
]) {
  if (!setupCli.includes(requiredText)) {
    console.error(`setup CLI 缺少平台约束：${requiredText}`);
    process.exit(1);
  }
}

for (const forbiddenText of [".cmd", '"where"', "maybeWindowsCommandShim", 'process.platform === "win32"', "USERPROFILE"]) {
  if (setupCli.includes(forbiddenText)) {
    console.error(`setup CLI 仍包含 Windows 兼容逻辑：${forbiddenText}`);
    process.exit(1);
  }
}

const unsupportedPlatform = spawnSync(process.execPath, [
  "--input-type=module",
  "--eval",
  `Object.defineProperty(process, "platform", { value: "win32" }); await import(${JSON.stringify(pathToFileURL(setupCliPath).href)});`
], {
  cwd: repoRoot,
  encoding: "utf8"
});
if (unsupportedPlatform.status !== 1 || !unsupportedPlatform.stderr.includes("当前仅支持 macOS/Linux。")) {
  console.error("setup CLI 在不支持的平台上没有中文提示并退出");
  process.exit(1);
}

await verifyAgentAddBehavior();

for (const agent of catalog) {
  for (const field of ["id", "displayName", "description", "audience", "configTemplate", "configOutput", "skillPath", "rulesTemplate", "bridgeProfile", "bridgePrompt"]) {
    if (!agent[field]) {
      console.error(`${agent.id || "unknown"} 缺少字段：${field}`);
      process.exit(1);
    }
  }

  for (const requiredPath of [
    agent.configTemplate,
    path.join(agent.skillPath, "SKILL.md"),
    agent.rulesTemplate,
    ...(agent.bridgeWorkspace ? [path.join(agent.bridgeWorkspace, "AGENTS.md")] : [])
  ]) {
    if (!(await exists(path.join(repoRoot, requiredPath)))) {
      console.error(`${agent.id} 缺少文件：${requiredPath}`);
      process.exit(1);
    }
  }
}

const requested = process.env.MO_LIFE_PACK_AGENT || "mo-coach";
if (!ids.includes(requested)) {
  console.error(`MO_LIFE_PACK_AGENT=${requested} 不在可选列表中：${ids.join(", ")}`);
  process.exit(1);
}

console.log(`OK agent catalog 可用；MO_LIFE_PACK_AGENT=${requested}`);
