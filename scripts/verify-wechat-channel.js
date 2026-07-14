import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

for (const relativePath of [
  "agents/investment-coach/bin/codex",
  "agents/investment-coach/bin/codex-readonly-proxy.mjs",
  "agents/investment-coach/templates/weclaw.config.example.json",
  "agents/investment-coach/workspace/AGENTS.md",
  "scripts/wechat-channel.js"
]) {
  const info = await stat(path.join(repoRoot, relativePath));
  if (!info.isFile()) throw new Error(`${relativePath} 不是文件`);
}

const template = JSON.parse(await read("agents/investment-coach/templates/weclaw.config.example.json"));
const agent = template.agents?.["investment-coach"];
if (template.default_agent !== "investment-coach" || agent?.type !== "acp") {
  throw new Error("WeClaw 模板没有把 Investment Coach 配成默认 ACP agent");
}
if (JSON.stringify(agent.args) !== JSON.stringify(["app-server", "--listen", "stdio://"])) {
  throw new Error("WeClaw 模板没有使用 Codex app-server");
}
if (!agent.aliases?.includes("invest") || !agent.aliases?.includes("coach")) {
  throw new Error("WeClaw 模板缺少 Investment Coach 切换别名");
}
if (!agent.env?.NODE_BINARY || !agent.env?.MO_LIFE_PACK_CODEX_BIN || !agent.env?.MO_LIFE_PACK_INVESTMENT_WORKSPACE) {
  throw new Error("WeClaw 模板缺少固定 Node、真实 Codex 或 workspace 路径");
}

const proxyPath = path.join(repoRoot, "agents", "investment-coach", "bin", "codex");
const selfTest = spawnSync(proxyPath, ["--self-test"], { encoding: "utf8" });
if (selfTest.status !== 0 || !selfTest.stdout.includes("read-only proxy self-test passed")) {
  throw new Error(`Codex 只读代理自检失败：${selfTest.stderr || selfTest.stdout}`);
}

const proxy = await read("agents/investment-coach/bin/codex-readonly-proxy.mjs");
for (const requiredText of [
  'params.sandbox = "read-only"',
  'type: "readOnly"',
  'networkAccess: false',
  'params.approvalPolicy = "never"',
  'params.ephemeral = true',
  'delete params.permissions',
  'ALLOWED_METHODS'
]) {
  if (!proxy.includes(requiredText)) throw new Error(`只读代理缺少安全规则：${requiredText}`);
}

const rules = await read("agents/investment-coach/workspace/AGENTS.md");
for (const requiredText of ["untrusted input", "Never read or disclose files outside this workspace", "Never execute shell commands", "keep the WeChat channel read-only"]) {
  if (!rules.includes(requiredText)) throw new Error(`微信 workspace rules 缺少：${requiredText}`);
}

const packageJson = JSON.parse(await read("package.json"));
for (const command of ["install", "configure", "doctor", "login", "run", "start", "status", "stop"]) {
  if (!packageJson.scripts?.[`wechat:${command}`]) throw new Error(`缺少 npm script: wechat:${command}`);
}

const channelScript = await read("scripts/wechat-channel.js");
for (const requiredText of ["v0.7.1", "proper-lockfile", "writeJsonAtomically", "smokeTestCodexProxy", "Codex app-server handshake passed", "未扫码、未启动 WeClaw"]) {
  if (!channelScript.includes(requiredText)) throw new Error(`微信配置脚本缺少：${requiredText}`);
}

console.log("OK wechat channel static verification passed");
