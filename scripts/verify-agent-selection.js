import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const catalog = JSON.parse(await readFile(path.join(repoRoot, "templates", "agent-catalog.json"), "utf8"));
const setupCliPath = path.join(repoRoot, "packages", "setup-cli", "src", "index.js");
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
