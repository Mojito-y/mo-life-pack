import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function assertFile(relativePath) {
  const info = await stat(path.join(repoRoot, relativePath));
  if (!info.isFile()) throw new Error(`${relativePath} 不是文件`);
}

const requiredFiles = [
  "skills/investment-coach/SKILL.md",
  "skills/investment-coach/agents/openai.yaml",
  "skills/investment-coach/references/evidence-and-freshness.md",
  "skills/investment-coach/references/output-templates.md",
  "skills/investment-coach/references/risk-boundaries.md",
  "skills/investment-coach/evals/evals.json",
  "agents/investment-coach/templates/investment-coach.config.example.json",
  "agents/investment-coach/workspace/AGENTS.md",
  "scripts/manage-agent-skills.js"
];
await Promise.all(requiredFiles.map(assertFile));

const catalog = JSON.parse(await read("templates/agent-catalog.json"));
const agent = catalog.find((item) => item.id === "investment-coach");
if (!agent || agent.bridgeProfile !== "investment-coach" || !agent.bridgeWorkspace) {
  throw new Error("agent catalog 缺少完整的 investment-coach profile 配置");
}

const dependencyIds = [
  "hithink-market-query",
  "announcement-search",
  "news-search",
  "report-search",
  "hithink-industry-query"
];
if (JSON.stringify(agent.skillDependencies?.skills?.map((item) => item.id)) !== JSON.stringify(dependencyIds)) {
  throw new Error("investment-coach 没有声明完整的问财数据 Skill");
}
if (agent.skillDependencies.cliCommand !== "iwencai-skillhub-cli"
  || !agent.skillDependencies.installerUrl.startsWith("https://www.iwencai.com/skillhub/")
  || agent.skillDependencies.tokenEnv !== "IWENCAI_API_KEY"
  || !agent.skillDependencies.tokenHelpUrl.includes("iwencai.com/skillhub")) {
  throw new Error("investment-coach 的 SkillHub 安装或 Token 指引不完整");
}

const config = JSON.parse(await read("agents/investment-coach/templates/investment-coach.config.example.json"));
if (!config.markets.includes("A_SHARE") || !config.markets.includes("US")) {
  throw new Error("投资教练必须同时覆盖 A 股和美股");
}
if (config.baseCurrency !== null || config.defaultHorizon !== null || config.riskProfile.maxDrawdownTolerancePct !== null || config.discipline.maxSinglePositionPct !== null) {
  throw new Error("未确认的个人风险参数必须保持 null，不能伪造默认值");
}
if (config.riskProfile.leverageAllowed !== false || config.dataPolicy.allowUnverifiedCurrentData !== false) {
  throw new Error("杠杆和未核验当前数据必须默认关闭");
}
if (config.discipline.coolingOffAppliesTo !== "NEW_OR_INCREASED_UNPLANNED_RISK_ONLY") {
  throw new Error("冷静期只能用于新建或增加非计划风险");
}
if (config.persona?.style !== "SHARP_TONGUED_DOMINANT" || config.persona?.intensity !== 3 || config.persona?.targetBehaviorNotIdentity !== true || config.persona?.seriousModeOnHighRisk !== true || config.persona?.seriousModeLockWhileRiskActive !== true) {
  throw new Error("投资教练必须启用毒舌、针对行为且可自动降级的支配型人设");
}
if (!config.persona.seriousModeCommands?.includes("严肃模式") || !config.persona.resumeModeCommands?.includes("毒舌模式")) {
  throw new Error("投资教练缺少显式的人设切换指令");
}

const skill = await read("skills/investment-coach/SKILL.md");
for (const requiredText of [
  "[事实]",
  "[假设]",
  "最强反方",
  "不登录券商",
  "重大非公开信息",
  "回测",
  "截至时间",
  "不应用于阻止减仓",
  "毒舌",
  "支配的是研究与交易纪律",
  "严肃模式",
  "不利用亏损后的脆弱情绪",
  "不能恢复",
  "不把持有、加仓、卖出包装成服从",
  "intensity",
  "allowSharpBarbs",
  ...dependencyIds.map((id) => `$${id}`)
]) {
  if (!skill.includes(requiredText)) throw new Error(`SKILL.md 缺少关键规则：${requiredText}`);
}

const evals = JSON.parse(await read("skills/investment-coach/evals/evals.json"));
if (!Array.isArray(evals.evals) || evals.evals.length < 10) {
  throw new Error("investment-coach 至少需要 10 个验收场景");
}
for (const item of evals.evals) {
  if (!Array.isArray(item.expectations) || item.expectations.length < 2) {
    throw new Error(`eval ${item.id} 缺少客观 expectations`);
  }
}
for (const requiredId of [5, 6, 7, 8, 9, 10, 11]) {
  if (!evals.evals.some((item) => item.id === requiredId)) throw new Error(`缺少关键验收场景：${requiredId}`);
}

const workspaceRules = await read("agents/investment-coach/workspace/AGENTS.md");
for (const requiredText of ["sharp-tongued", "Target excuses", "正常模式", "毒舌模式", "high-risk condition remains"]) {
  if (!workspaceRules.includes(requiredText)) throw new Error(`Investment Coach workspace rules 缺少人设规则：${requiredText}`);
}

const setupCli = await read("packages/setup-cli/src/index.js");
if (setupCli.includes("ensureLarkChannelProfileUsesRules(bridgeConfig)")) {
  throw new Error("named bridge 命令不能把 ignoreRules 固定应用到默认 bridge profile");
}
for (const requiredText of [
  "parseBridgeTargetArgs",
  "requestedProfile || requestedAgent.bridgeProfile",
  "ensureLarkChannelProfileUsesRules(targetProfile, targetWorkspace, legacyWorkspaces)",
  "cwdRealpath",
  "legacyBridgeWorkspaces"
]) {
  if (!setupCli.includes(requiredText)) throw new Error(`named bridge 多实例迁移缺少：${requiredText}`);
}

const configureProfile = await read("scripts/configure-agent-profile.js");
for (const requiredText of ["profileOverride", "sessions.json.catalog.json", "cwdRealpath", "legacyBridgeWorkspaces"]) {
  if (!configureProfile.includes(requiredText)) throw new Error(`profile 配置迁移缺少：${requiredText}`);
}

const addAgent = await read("scripts/add-agent.js");
for (const requiredText of ["printSkillDependencyGuide", "npm run agent:skills -- ${agent.id} --install"]) {
  if (!addAgent.includes(requiredText)) throw new Error(`agent:add 缺少数据 Skill 安装引导：${requiredText}`);
}

const freshness = await read("skills/investment-coach/references/evidence-and-freshness.md");
for (const requiredText of ["盘前/盘后", "GAAP/non-GAAP", "摊薄股本", "截至日期"]) {
  if (!freshness.includes(requiredText)) throw new Error(`新鲜度协议缺少口径：${requiredText}`);
}

const envTemplate = await read("templates/env.example");
for (const requiredText of ["IWENCAI_BASE_URL=https://openapi.iwencai.com", "IWENCAI_API_KEY="]) {
  if (!envTemplate.includes(requiredText)) throw new Error(`env 模板缺少问财配置：${requiredText}`);
}

const managerPath = path.join(repoRoot, "scripts", "manage-agent-skills.js");
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "mo-life-pack-investment-skills-"));
const fakeCli = path.join(fixtureRoot, "iwencai-skillhub-cli");
const fakeCodexHome = path.join(fixtureRoot, "codex-home");
try {
  await mkdir(path.join(fixtureRoot, "templates"), { recursive: true });
  await writeFile(path.join(fixtureRoot, "templates", "agent-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

  const missing = spawnSync(process.execPath, [managerPath, "investment-coach", "--check"], {
    cwd: fixtureRoot,
    env: { ...process.env, HOME: fixtureRoot, CODEX_HOME: fakeCodexHome, IWENCAI_SKILLHUB_CLI: "", IWENCAI_API_KEY: "", PATH: "/usr/bin:/bin" },
    encoding: "utf8"
  });
  if (missing.status !== 1
    || !missing.stdout.includes(agent.skillDependencies.installerUrl)
    || !missing.stdout.includes(agent.skillDependencies.tokenHelpUrl)
    || !missing.stdout.includes("npm run agent:skills -- investment-coach --install")) {
    throw new Error(`问财 Skill 缺失引导不完整：${missing.stdout}${missing.stderr}`);
  }

  await writeFile(fakeCli, [
    "#!/bin/sh",
    "set -eu",
    "test \"$1\" = \"--dir\"",
    "test \"$3\" = \"install\"",
    "target=\"$2/$4\"",
    "mkdir -p \"$target\"",
    "printf '%s\\n' '---' \"name: $4\" 'description: fixture' '---' > \"$target/SKILL.md\""
  ].join("\n") + "\n", { mode: 0o755 });
  await chmod(fakeCli, 0o755);

  const installed = spawnSync(process.execPath, [managerPath, "investment-coach", "--install"], {
    cwd: fixtureRoot,
    env: { ...process.env, HOME: fixtureRoot, CODEX_HOME: fakeCodexHome, IWENCAI_SKILLHUB_CLI: fakeCli, IWENCAI_API_KEY: "fixture-token" },
    encoding: "utf8"
  });
  if (installed.status !== 0) throw new Error(`问财 Skill 安装失败：${installed.stdout}${installed.stderr}`);
  for (const id of dependencyIds) await assertFile(path.relative(repoRoot, path.join(fakeCodexHome, "skills", id, "SKILL.md")));
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log("OK investment-coach static verification passed");
