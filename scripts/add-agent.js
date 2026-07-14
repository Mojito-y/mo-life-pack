import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

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

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

const catalogPath = path.join(repoRoot, "templates", "agent-catalog.json");
const catalog = await readJson(catalogPath);

if (!agentId) {
  console.error(`用法：npm run agent:add -- <agent-id> [--dry-run]\n可选：${catalog.map((agent) => agent.id).join(", ")}`);
  process.exit(1);
}

const agent = catalog.find((item) => item.id === agentId);
if (!agent) {
  console.error(`未知 agent：${agentId}。可选：${catalog.map((item) => item.id).join(", ")}`);
  process.exit(1);
}

const skillSource = resolveRepoPath(agent.skillPath);
const skillTarget = path.join(os.homedir(), ".codex", "skills", agent.id);
const configTemplate = resolveRepoPath(agent.configTemplate);
const configOutput = resolveRepoPath(agent.configOutput);
const agentConfigPath = path.join(repoRoot, "agent.config.json");
const dataWorkspace = agent.dataWorkspace
  ? resolveRepoPath(agent.dataWorkspace)
  : null;

for (const requiredPath of [path.join(skillSource, "SKILL.md"), configTemplate]) {
  if (!(await exists(requiredPath))) {
    throw new Error(`缺少文件：${path.relative(repoRoot, requiredPath)}`);
  }
}

if (dryRun) {
  process.stdout.write(`DRY RUN 将累加安装 ${agent.displayName}，不会切换或覆盖当前 bridge profile。\n`);
  process.stdout.write(`Skill: ${skillSource} -> ${skillTarget}\n`);
  process.stdout.write(`Config: ${configTemplate} -> ${configOutput}（已存在则保留）\n`);
  process.stdout.write(`下一步手动扫码：npm run bridge:run -- ${agent.id}\n`);
  process.exit(0);
}

await mkdir(path.dirname(skillTarget), { recursive: true });
await cp(skillSource, skillTarget, { recursive: true, force: true });

if (!(await exists(configOutput))) {
  await cp(configTemplate, configOutput);
}

if (dataWorkspace) {
  await mkdir(dataWorkspace, { recursive: true });
}

const currentAgentConfig = await exists(agentConfigPath)
  ? await readJson(agentConfigPath)
  : {};
const selectedAgent = currentAgentConfig.selectedAgent || agent.id;
const installedAgents = [...new Set([
  selectedAgent,
  ...(currentAgentConfig.installedAgents || []),
  agent.id
])];
await writeFile(agentConfigPath, JSON.stringify({
  ...currentAgentConfig,
  selectedAgent,
  installedAgents
}, null, 2) + "\n");

process.stdout.write(`已累加安装 ${agent.displayName}，当前 selectedAgent 保持为 ${selectedAgent}。\n`);
process.stdout.write(`未启动 bridge，也未改写 lark-agent-bridge.config.json。\n`);
process.stdout.write(`下一步手动扫码：npm run bridge:run -- ${agent.id}\n`);
