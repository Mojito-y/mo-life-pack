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
const bridgeConfigPath = path.join(repoRoot, "lark-agent-bridge.config.json");
const dataWorkspace = agent.dataWorkspace
  ? resolveRepoPath(agent.dataWorkspace)
  : null;

function printSkillDependencyGuide() {
  if (!agent.skillDependencies?.skills?.length) return;
  process.stdout.write(`${agent.displayName} 还依赖 ${agent.skillDependencies.skills.length} 个数据 Skill。\n`);
  process.stdout.write(`检查状态：npm run agent:skills -- ${agent.id}\n`);
  process.stdout.write(`安装缺失项：npm run agent:skills -- ${agent.id} --install\n`);
}

for (const requiredPath of [path.join(skillSource, "SKILL.md"), configTemplate]) {
  if (!(await exists(requiredPath))) {
    throw new Error(`缺少文件：${path.relative(repoRoot, requiredPath)}`);
  }
}

if (dryRun) {
  process.stdout.write(`DRY RUN 将累加安装 ${agent.displayName}，不会切换或覆盖当前 bridge profile。\n`);
  process.stdout.write(`Skill: ${skillSource} -> ${skillTarget}\n`);
  process.stdout.write(`Config: ${configTemplate} -> ${configOutput}（已存在则保留）\n`);
  printSkillDependencyGuide();
  process.stdout.write(`下一步手动扫码：npm run bridge:run -- ${agent.id}\n`);
  process.exit(0);
}

const agentConfigExists = await exists(agentConfigPath);
const currentAgentConfig = agentConfigExists ? await readJson(agentConfigPath) : {};
let selectedAgent = currentAgentConfig.selectedAgent?.trim();
let selectedAgentMessage = "";

if (selectedAgent) {
  selectedAgentMessage = `默认 agent 保持不变：${selectedAgent}。`;
} else if (await exists(bridgeConfigPath)) {
  const bridgeConfig = await readJson(bridgeConfigPath);
  const bridgeProfile = bridgeConfig.profile?.trim();
  const inferredAgent = catalog.find((item) => (
    item.id === bridgeProfile || item.bridgeProfile === bridgeProfile
  ));
  if (!inferredAgent) {
    throw new Error(
      `无法从 lark-agent-bridge.config.json 的 profile=${bridgeProfile || "<empty>"} 推断默认 agent；请先修正 bridge profile 或补全 agent.config.json。`
    );
  }
  selectedAgent = inferredAgent.id;
  selectedAgentMessage = `已从 bridge profile ${bridgeProfile} 恢复默认 agent：${selectedAgent}。`;
} else if (agentConfigExists) {
  throw new Error("agent.config.json 缺少 selectedAgent；请先补全默认 agent，再执行累加安装。");
} else {
  selectedAgent = agent.id;
  selectedAgentMessage = `未找到已有默认 agent，已将 ${selectedAgent} 设为默认 agent。`;
}

await mkdir(path.dirname(skillTarget), { recursive: true });
await cp(skillSource, skillTarget, { recursive: true, force: true });

if (!(await exists(configOutput))) {
  await cp(configTemplate, configOutput);
}

if (dataWorkspace) {
  await mkdir(dataWorkspace, { recursive: true });
}

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

process.stdout.write(`已安装并登记新 agent：${agent.displayName}（${agent.id}）。\n`);
process.stdout.write(`${selectedAgentMessage}\n`);
process.stdout.write(`未启动 bridge，也未改写 lark-agent-bridge.config.json。\n`);
printSkillDependencyGuide();
process.stdout.write(`下一步手动扫码：npm run bridge:run -- ${agent.id}\n`);
