#!/usr/bin/env node

import { readFile, writeFile, access, mkdir, rename } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const supportedPlatforms = new Set(["darwin", "linux"]);
if (!supportedPlatforms.has(process.platform)) {
  process.stderr.write(`当前系统 ${process.platform} 暂不支持；当前仅支持 macOS/Linux。\n`);
  process.exit(1);
}

const repoRoot = process.cwd();
const agentConfigPath = path.join(repoRoot, "agent.config.json");
const bridgeConfigPath = path.join(repoRoot, "lark-agent-bridge.config.json");
const agentRulesPath = path.join(repoRoot, "AGENTS.md");
const agentCatalogPath = path.join(repoRoot, "templates", "agent-catalog.json");
const agentConfigTemplatePath = path.join(repoRoot, "templates", "agent.config.example.json");
const bridgeTemplatePath = path.join(repoRoot, "templates", "lark-agent-bridge.config.example.json");
const envTemplatePath = path.join(repoRoot, "templates", "env.example");
const skillInstallScript = path.join(repoRoot, "scripts", "install-skill.js");
const runnerCommand = "npm";
const macCodexAppBinaryCandidates = [
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/Codex.app/Contents/Resources/codex"
];
const macCodexAppBinary = macCodexAppBinaryCandidates[0];
const minimumBridgeNodeMajor = 22;
const agentRulesStart = "<!-- mo-life-pack-agent-rules:start -->";
const agentRulesEnd = "<!-- mo-life-pack-agent-rules:end -->";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function executableExists(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function codexBinaryUsable(value) {
  if (!value) {
    return false;
  }

  if (path.isAbsolute(value) || value.includes("/")) {
    return executableExists(value);
  }

  const check = spawnSync(value, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000
  });
  return check.status === 0;
}

function findCommandPath(command) {
  const result = spawnSync("which", [command], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000
  });
  if (result.status !== 0) {
    return "";
  }

  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || "";
}

async function findCodexBinaryPath() {
  const pathCodex = findCommandPath("codex");
  if (pathCodex && await executableExists(pathCodex)) {
    return pathCodex;
  }

  if (process.platform === "darwin") {
    for (const candidate of macCodexAppBinaryCandidates) {
      if (await executableExists(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function currentNodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

function ensureBridgeNodeRuntime() {
  const major = currentNodeMajor();
  if (major >= minimumBridgeNodeMajor) {
    return true;
  }

  process.stdout.write(`当前 Node.js 版本是 ${process.version}，低于 lark-channel-bridge 需要的 Node.js ${minimumBridgeNodeMajor}+。\n`);
  process.stdout.write("请先安装或切换到 Node.js 22 LTS 或更新版本，然后重新运行当前命令。\n");
  process.stdout.write("macOS 常见做法：nvm install 22 && nvm use 22\n");
  process.stdout.write("请安装 Node.js LTS：https://nodejs.org/\n");
  process.exitCode = 1;
  return false;
}

async function loadAgentCatalog() {
  const catalog = await readJson(agentCatalogPath);
  return catalog.map((agent) => ({
    ...agent,
    configTemplatePath: resolveRepoPath(agent.configTemplate),
    configOutputPath: resolveRepoPath(agent.configOutput),
    skillSourcePath: resolveRepoPath(agent.skillPath)
  }));
}

function findAgent(catalog, id) {
  return catalog.find((agent) => agent.id === id);
}

function formatAgentList(catalog) {
  return catalog.map((agent, index) => {
    return `${index + 1}. ${agent.displayName}（${agent.id}）\n   ${agent.description}\n   适合：${agent.audience}`;
  }).join("\n\n");
}

async function chooseAgent(rl, catalog, { useDefaults }) {
  const requested = process.env.MO_LIFE_PACK_AGENT?.trim();
  const defaultAgentId = "mo-coach";

  if (requested) {
    const selected = findAgent(catalog, requested);
    if (!selected) {
      throw new Error(`未知 agent：${requested}。可选：${catalog.map((agent) => agent.id).join(", ")}`);
    }
    return selected;
  }

  if (useDefaults) {
    return findAgent(catalog, defaultAgentId);
  }

  process.stdout.write("请选择要安装的 Agent：\n\n");
  process.stdout.write(`${formatAgentList(catalog)}\n\n`);
  const answer = (await rl.question(`请输入序号或 agent id [${defaultAgentId}]: `)).trim();
  if (!answer) {
    return findAgent(catalog, defaultAgentId);
  }

  const numeric = Number(answer);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= catalog.length) {
    return catalog[numeric - 1];
  }

  const selected = findAgent(catalog, answer);
  if (!selected) {
    throw new Error(`未知 agent：${answer}。请重新运行 setup，并从列表中选择。`);
  }
  return selected;
}

function renderBridgePrompt(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function renderAgentRules(template, selectedAgent, config) {
  return renderBridgePrompt(template, {
    agentId: selectedAgent.id,
    agentName: config.agentName || selectedAgent.name,
    coachName: config.coachName || selectedAgent.name,
    defaultProfile: config.defaultProfile || "medtech-bci"
  });
}

function upsertGeneratedAgentRules(current, generated) {
  const start = current.indexOf(agentRulesStart);
  const end = current.indexOf(agentRulesEnd);
  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + agentRulesEnd.length;
    return `${current.slice(0, start)}${generated}${current.slice(afterEnd).replace(/^\n+/, "\n")}`;
  }

  return `${generated}\n${current.replace(/^\n+/, "")}`;
}

async function ensureAgentRules(selectedAgent, config) {
  if (!selectedAgent.rulesTemplate) {
    return false;
  }

  const template = await readFile(resolveRepoPath(selectedAgent.rulesTemplate), "utf8");
  const body = renderAgentRules(template, selectedAgent, config).trim();
  const generated = `${agentRulesStart}\n${body}\n${agentRulesEnd}\n`;
  const current = await exists(agentRulesPath) ? await readFile(agentRulesPath, "utf8") : "";
  await writeFile(agentRulesPath, current ? upsertGeneratedAgentRules(current, generated) : generated);
  return true;
}

function resolveRepoPath(value) {
  if (!value || path.isAbsolute(value)) {
    return value;
  }
  return path.join(repoRoot, value);
}

function resolveBridgeCommand(value) {
  return resolveRepoPath(value);
}

function bridgeCommandFromTemplate(template) {
  return resolveBridgeCommand(template.bridgeCommand);
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    values[key] = value;
  }
  return values;
}

async function loadEnvLocal() {
  const envLocalPath = path.join(repoRoot, ".env.local");
  if (!(await exists(envLocalPath))) {
    return {};
  }

  const values = parseEnv(await readFile(envLocalPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  return values;
}

async function detectCodexBinaryPath() {
  if (await codexBinaryUsable(process.env.LARK_CHANNEL_CODEX_BIN)) {
    return process.env.LARK_CHANNEL_CODEX_BIN;
  }

  if (process.env.LARK_CHANNEL_CODEX_BIN) {
    delete process.env.LARK_CHANNEL_CODEX_BIN;
  }

  return findCodexBinaryPath();
}

async function getCodexCliStatus() {
  if (process.env.LARK_CHANNEL_CODEX_BIN) {
    const ok = await codexBinaryUsable(process.env.LARK_CHANNEL_CODEX_BIN);
    return {
      ok,
      label: process.env.LARK_CHANNEL_CODEX_BIN,
      source: "LARK_CHANNEL_CODEX_BIN"
    };
  }

  const pathCodex = findCommandPath("codex");
  if (pathCodex && await executableExists(pathCodex)) {
    return { ok: true, label: pathCodex, source: "PATH" };
  }

  if (process.platform === "darwin") {
    for (const candidate of macCodexAppBinaryCandidates) {
      if (await executableExists(candidate)) {
        return { ok: true, label: candidate, source: "macOS app bundle" };
      }
    }
  }

  return { ok: false, label: "codex", source: "PATH" };
}

function upsertBlankEnvValue(text, key, value) {
  const lines = text.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) {
      return line;
    }

    found = true;
    const currentValue = line.slice(key.length + 1).trim();
    return currentValue ? line : `${key}=${value}`;
  });

  if (!found) {
    if (next.length && next[next.length - 1] !== "") {
      next.push("");
    }
    next.push(`${key}=${value}`);
  }

  return next.join("\n").replace(/\n*$/, "\n");
}

function upsertEnvValue(text, key, value) {
  const lines = text.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) {
      return line;
    }

    found = true;
    return `${key}=${value}`;
  });

  if (!found) {
    if (next.length && next[next.length - 1] !== "") {
      next.push("");
    }
    next.push(`${key}=${value}`);
  }

  return next.join("\n").replace(/\n*$/, "\n");
}

async function ensureCodexBinaryHint() {
  const codexPath = await detectCodexBinaryPath();
  if (!codexPath) {
    return "";
  }

  process.env.LARK_CHANNEL_CODEX_BIN = codexPath;
  const envLocalPath = path.join(repoRoot, ".env.local");
  if (await exists(envLocalPath)) {
    const current = await readFile(envLocalPath, "utf8");
    const values = parseEnv(current);
    if (!await codexBinaryUsable(values.LARK_CHANNEL_CODEX_BIN)) {
      await writeFile(envLocalPath, upsertEnvValue(current, "LARK_CHANNEL_CODEX_BIN", codexPath));
    }
  }

  return codexPath;
}

async function ensureEnvLocal() {
  const envLocalPath = path.join(repoRoot, ".env.local");
  const envTemplate = await readFile(envTemplatePath, "utf8");

  if (!(await exists(envLocalPath))) {
    await writeFile(envLocalPath, envTemplate);
    await ensureCodexBinaryHint();
    return;
  }

  const current = await readFile(envLocalPath, "utf8");
  const currentValues = parseEnv(current);
  const templateValues = parseEnv(envTemplate);
  const missingLines = Object.keys(templateValues)
    .filter((key) => !(key in currentValues))
    .map((key) => `${key}=${templateValues[key]}`);

  if (missingLines.length) {
    const suffix = `${current.endsWith("\n") ? "" : "\n"}\n# Mo Life Pack bridge settings\n${missingLines.join("\n")}\n`;
    await writeFile(envLocalPath, current + suffix);
  }
  await ensureCodexBinaryHint();
}

async function setup() {
  const catalog = await loadAgentCatalog();
  const bridgeTemplate = await readJson(bridgeTemplatePath);
  const useDefaults = process.env.MO_LIFE_PACK_ASSUME_DEFAULTS === "1";
  let bridgeConfig = bridgeTemplate;
  let selectedAgent;
  let configPathToWrite;
  let config;

  if (useDefaults) {
    selectedAgent = await chooseAgent(null, catalog, { useDefaults });
    process.stdout.write(`使用默认配置初始化 ${selectedAgent.displayName} 和飞书机器人 Agent Bridge。\n`);
  } else {
    const rl = readline.createInterface({ input, output });
    try {
      process.stdout.write("开始设置 Mo Life Pack。看不懂的问题直接回车即可使用默认值。\n\n");
      selectedAgent = await chooseAgent(rl, catalog, { useDefaults });

      const template = await readJson(selectedAgent.configTemplatePath);
      if (selectedAgent.id === "mo-coach") {
        const coachName = (await rl.question(`教练名称 [${template.coachName}]: `)).trim() || template.coachName;
        const style = (await rl.question(`教练风格 [${template.style}]: `)).trim() || template.style;
        const goals = (await rl.question("训练目标，多个用英文逗号分隔 [general_fitness]: ")).trim();
        const equipment = (await rl.question("可用器械，多个用英文逗号分隔 [bodyweight]: ")).trim();
        const sessionMinutes = (await rl.question(`每次训练分钟数 [${template.sessionMinutes}]: `)).trim();
        config = {
          ...template,
          coachName,
          style,
          goals: goals ? goals.split(",").map((item) => item.trim()).filter(Boolean) : template.goals,
          equipment: equipment ? equipment.split(",").map((item) => item.trim()).filter(Boolean) : template.equipment,
          sessionMinutes: sessionMinutes ? Number(sessionMinutes) : template.sessionMinutes
        };
      } else if (selectedAgent.id === "industry-dd-agent") {
        const agentName = (await rl.question(`Agent 名称 [${template.agentName}]: `)).trim() || template.agentName;
        const defaultProfile = (await rl.question(`默认行业 profile [${template.defaultProfile}]: `)).trim() || template.defaultProfile;
        const workspaceDir = (await rl.question(`项目工作区目录 [${template.workspaceDir}]: `)).trim() || template.workspaceDir;
        config = {
          ...template,
          agentName,
          defaultProfile,
          workspaceDir
        };
      } else if (selectedAgent.id === "investment-coach") {
        const agentName = (await rl.question(`教练名称 [${template.agentName}]: `)).trim() || template.agentName;
        const markets = (await rl.question(`覆盖市场，多个用英文逗号分隔 [${template.markets.join(",")}]: `)).trim();
        const primaryMarket = (await rl.question(`主要市场 [${template.primaryMarket}]: `)).trim() || template.primaryMarket;
        const baseCurrency = (await rl.question(`基础币种，留空表示稍后确认 [${template.baseCurrency || "未设置"}]: `)).trim() || template.baseCurrency;
        const defaultHorizon = (await rl.question(`默认投资期限，留空表示稍后确认 [${template.defaultHorizon || "未设置"}]: `)).trim() || template.defaultHorizon;
        const workspaceDir = (await rl.question(`研究与复盘目录 [${template.workspaceDir}]: `)).trim() || template.workspaceDir;
        config = {
          ...template,
          agentName,
          markets: markets ? markets.split(",").map((item) => item.trim()).filter(Boolean) : template.markets,
          primaryMarket,
          baseCurrency,
          defaultHorizon,
          workspaceDir
        };
      } else {
        throw new Error(`未实现 ${selectedAgent.id} 的交互式配置流程。`);
      }

      const connectBridge = (await rl.question("是否接入 lark-channel-bridge 飞书机器人？[Y/n]: ")).trim().toLowerCase();
      const defaultBridgeCommand = bridgeCommandFromTemplate(bridgeTemplate);
      const bridgeCommand = connectBridge === "n"
        ? defaultBridgeCommand
        : (await rl.question(`Bridge 命令 [${defaultBridgeCommand}]: `)).trim() || defaultBridgeCommand;
      const bridgeInstallCommand = connectBridge === "n"
        ? bridgeTemplate.installCommand
        : (await rl.question(`Bridge 安装命令 [${bridgeTemplate.installCommand}]: `)).trim() || bridgeTemplate.installCommand;

      bridgeConfig = {
        ...bridgeTemplate,
        enabled: connectBridge !== "n",
        bridgeCommand,
        workspace: repoRoot,
        installCommand: bridgeInstallCommand
      };
    } finally {
      rl.close();
    }
  }

  if (!config) {
    config = await readJson(selectedAgent.configTemplatePath);
  }

  configPathToWrite = selectedAgent.configOutputPath;
  const agentConfig = {
    selectedAgent: selectedAgent.id,
    installedAgents: [selectedAgent.id]
  };
  const promptValues = {
    coachName: config.coachName || "Mo Coach",
    agentName: config.agentName || selectedAgent.name
  };
  const bridgeWorkspace = selectedAgent.bridgeWorkspace || ".";
  const bridgeWorkspacePath = resolveRepoPath(bridgeWorkspace);

  bridgeConfig = {
    ...bridgeConfig,
    profile: selectedAgent.bridgeProfile,
    bridgeCommand: bridgeConfig.bridgeCommand || bridgeCommandFromTemplate(bridgeTemplate),
    workspace: bridgeWorkspacePath,
    firstRunArgs: ["run", "--profile", selectedAgent.bridgeProfile, "--agent", bridgeTemplate.agent || "codex", "--workspace", bridgeWorkspacePath],
    serviceArgs: ["start", "--profile", selectedAgent.bridgeProfile, "--agent", bridgeTemplate.agent || "codex", "--workspace", bridgeWorkspacePath],
    statusArgs: ["status", "--profile", selectedAgent.bridgeProfile],
    stopArgs: ["stop", "--profile", selectedAgent.bridgeProfile],
    agentPrompt: renderBridgePrompt(selectedAgent.bridgePrompt, promptValues)
  };

  await writeFile(agentConfigPath, JSON.stringify(agentConfig, null, 2) + "\n");
  await writeFile(configPathToWrite, JSON.stringify(config, null, 2) + "\n");
  await writeFile(bridgeConfigPath, JSON.stringify(bridgeConfig, null, 2) + "\n");
  const rulesWritten = await ensureAgentRules(selectedAgent, config);
  if (selectedAgent.dataWorkspace) {
    await mkdir(resolveRepoPath(selectedAgent.dataWorkspace), { recursive: true });
  }
  const install = spawnSync(process.execPath, [skillInstallScript, "--agent", selectedAgent.id], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  await ensureEnvLocal();

  process.stdout.write(`已保存 ${path.relative(repoRoot, agentConfigPath)}\n`);
  process.stdout.write(`已保存 ${path.relative(repoRoot, configPathToWrite)}\n`);
  process.stdout.write(`已保存 ${path.relative(repoRoot, bridgeConfigPath)}\n`);
  if (rulesWritten) {
    process.stdout.write(`已保存 ${path.relative(repoRoot, agentRulesPath)}（${selectedAgent.displayName} 运行说明）\n`);
  }
  if (install.status !== 0) {
    process.stdout.write(`Skill 安装可能需要处理权限。检查后可运行 ${runnerCommand} run install:skill。\n`);
  }
  process.stdout.write(`下一步：运行 ${runnerCommand} run bridge:run，扫码绑定飞书 PersonalAgent。\n`);
  if (selectedAgent.bridgeWorkspace) {
    process.stdout.write(`确认能收发消息后，按 Ctrl-C 停掉前台进程，运行 ${runnerCommand} run agent:configure-profile -- ${selectedAgent.id} 启用专属规则。\n`);
    process.stdout.write(`然后运行 ${runnerCommand} run bridge:start -- ${selectedAgent.id} 后台常驻。\n`);
  } else {
    process.stdout.write(`确认能收发消息后，按 Ctrl-C 停掉前台进程，再运行 ${runnerCommand} run bridge:start 后台常驻。\n`);
  }
  process.stdout.write(`Skill 安装脚本位置：${path.relative(repoRoot, skillInstallScript)}\n`);
}

async function doctor() {
  await loadEnvLocal();
  const codexCli = await getCodexCliStatus();
  const catalog = await loadAgentCatalog();
  const agentConfig = await exists(agentConfigPath) ? await readJson(agentConfigPath) : { selectedAgent: "mo-coach" };
  const selectedAgent = agentConfig.selectedAgent || "mo-coach";
  const installedAgents = [...new Set(agentConfig.installedAgents?.length ? agentConfig.installedAgents : [selectedAgent])];
  const agentScaffoldChecks = (await Promise.all(catalog.map(async (agent) => [
    [`${agent.id} config template`, await exists(agent.configTemplatePath)],
    [`${agent.id} skill scaffold`, await exists(path.join(agent.skillSourcePath, "SKILL.md"))],
    ...(agent.bridgeWorkspace ? [
      [`${agent.id} bridge workspace`, await exists(resolveRepoPath(agent.bridgeWorkspace))],
      [`${agent.id} workspace rules`, await exists(path.join(resolveRepoPath(agent.bridgeWorkspace), "AGENTS.md"))]
    ] : [])
  ]))).flat();
  const installedSkillChecks = await Promise.all(installedAgents.map(async (agentId) => [
    `installed skill ${agentId}`,
    await exists(path.join(os.homedir(), ".codex", "skills", agentId, "SKILL.md"))
  ]));
  const checks = [
    ["agent catalog", await exists(agentCatalogPath)],
    ["agent config template", await exists(agentConfigTemplatePath)],
    ["industry profile schema", await exists(path.join(repoRoot, "templates", "industry-profile.schema.json"))],
    ...agentScaffoldChecks,
    ["env template", await exists(envTemplatePath)],
    ["env local", await exists(path.join(repoRoot, ".env.local"))],
    ["setup script", await exists(skillInstallScript)],
    ["lark agent bridge template", await exists(bridgeTemplatePath)],
    ["lark agent bridge config", await exists(bridgeConfigPath)],
    ...installedSkillChecks
  ];

  const failures = checks.filter(([, ok]) => !ok);
  for (const [label, ok] of checks) {
    process.stdout.write(`${ok ? "OK" : "MISS"} ${label}\n`);
  }
  if (codexCli.ok) {
    process.stdout.write(`OK Codex CLI (${codexCli.source}): ${codexCli.label}\n`);
  } else {
    process.stdout.write(`WARN Codex CLI 未找到。macOS ChatGPT App 常见路径：${macCodexAppBinary}\n`);
    process.stdout.write("如果 Codex CLI 在其他位置，请在 .env.local 设置 LARK_CHANNEL_CODEX_BIN。\n");
  }

  if (failures.length) {
    process.exitCode = 1;
  }
}

async function bridgeDoctor() {
  await loadEnvLocal();
  const detectedCodexPath = await ensureCodexBinaryHint();
  const codexCli = await getCodexCliStatus();
  const bridgeConfigExists = await exists(bridgeConfigPath);
  if (!bridgeConfigExists) {
    process.stdout.write("MISS lark-agent-bridge.config.json\n");
    process.stdout.write(`请先运行 ${runnerCommand} run setup 生成 bridge 配置。\n`);
    process.exitCode = 1;
    return;
  }

  const bridgeConfig = await readJson(bridgeConfigPath);
  if (!ensureBridgeNodeRuntime()) {
    return;
  }
  const bridgeCommand = process.env.LARK_CHANNEL_BRIDGE_COMMAND
    || resolveBridgeCommand(bridgeConfig.bridgeCommand);
  const result = spawnSync(bridgeCommand, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  process.stdout.write(`OK bridge config (${bridgeConfig.enabled ? "enabled" : "disabled"})\n`);
  if (detectedCodexPath) {
    process.stdout.write(`OK Codex CLI: ${detectedCodexPath}\n`);
  } else if (codexCli.ok) {
    process.stdout.write(`OK Codex CLI (${codexCli.source}): ${codexCli.label}\n`);
  } else {
    process.stdout.write(`WARN Codex CLI 未找到。可在 .env.local 设置 LARK_CHANNEL_CODEX_BIN=${macCodexAppBinary}\n`);
  }
  if (result.status === 0) {
    process.stdout.write(`OK bridge command: ${bridgeCommand}\n`);
  } else if (result.error) {
    process.stdout.write(`MISS bridge command: ${bridgeCommand}\n`);
    const installCommand = normalizeBridgeInstallCommand(process.env.LARK_CHANNEL_BRIDGE_INSTALL_COMMAND || bridgeConfig.installCommand);
    if (installCommand) {
      process.stdout.write(`建议先执行 bridge 安装命令：${installCommand}\n`);
    }
    process.stdout.write("请先安装 lark-channel-bridge，或在 .env.local 里设置 LARK_CHANNEL_BRIDGE_COMMAND。\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`FAIL bridge command: ${bridgeCommand}\n`);
    if (result.stderr) {
      process.stdout.write(result.stderr);
    }
    process.stdout.write("bridge 已安装但当前 Node/运行环境无法启动。建议升级到当前 Node.js LTS 后重试。\n");
    process.exitCode = 1;
  }
}

function materializeBridgeArgs(args) {
  return args.map((arg) => arg === "." ? repoRoot : arg);
}

function parseBridgeTargetArgs(args) {
  let agentId = "";
  let profile = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      const value = args[index + 1]?.trim();
      if (!value || value.startsWith("--")) {
        throw new Error("--profile 需要一个 profile 名称。");
      }
      profile = value;
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

  if (profile && !agentId) {
    throw new Error("使用 --profile 时必须先指定 agent id。");
  }
  if (profile && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error(`profile 名称不合法：${profile}`);
  }

  return { agentId, profile };
}

function normalizeBridgeInstallCommand(command) {
  if (!command) {
    return command;
  }

  if (/^\s*pnpm\s+install\s*$/.test(command)) {
    return `${runnerCommand} install`;
  }

  return command;
}

function larkChannelConfigFile() {
  const home = process.env.HOME || os.homedir();
  return home ? path.join(home, ".lark-channel", "config.json") : "";
}

function larkChannelSessionCatalogFile(profile) {
  const configFile = larkChannelConfigFile();
  if (!configFile || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile || "")) {
    return "";
  }
  return path.join(path.dirname(configFile), "profiles", profile, "sessions.json.catalog.json");
}

async function migrateLarkChannelSessionCatalog(profile, workspace, legacyWorkspaces) {
  const filePath = larkChannelSessionCatalogFile(profile);
  if (!filePath || !workspace || !legacyWorkspaces.length || !(await exists(filePath))) {
    return 0;
  }

  let catalog;
  try {
    catalog = await readJson(filePath);
  } catch {
    return 0;
  }
  if (!Array.isArray(catalog)) {
    return 0;
  }

  const legacyPaths = new Set(legacyWorkspaces.map((value) => path.resolve(value)));
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

  if (migrated) {
    const tempPath = `${filePath}.tmp-${process.pid}`;
    await writeFile(tempPath, JSON.stringify(nextCatalog, null, 2) + "\n", { mode: 0o600 });
    await rename(tempPath, filePath);
  }
  return migrated;
}

async function ensureLarkChannelProfileUsesRules(profile, workspace = "", legacyWorkspaces = []) {
  const filePath = larkChannelConfigFile();
  if (!profile || !filePath || !(await exists(filePath))) {
    return false;
  }

  let config;
  try {
    config = await readJson(filePath);
  } catch {
    return false;
  }

  const profileConfig = config.profiles?.[profile];
  if (!profileConfig || profileConfig.agentKind !== "codex") {
    return false;
  }

  const nextConfig = {
    ...config,
    profiles: {
      ...config.profiles,
      [profile]: {
        ...profileConfig,
        ...(workspace ? {
          workspaces: {
            ...(profileConfig.workspaces || {}),
            default: workspace
          }
        } : {}),
        codex: {
          ...(profileConfig.codex || {}),
          inheritCodexHome: true,
          ignoreUserConfig: false,
          ignoreRules: false,
          ...(process.env.LARK_CHANNEL_CODEX_BIN ? { binaryPath: process.env.LARK_CHANNEL_CODEX_BIN } : {})
        }
      }
    }
  };

  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, JSON.stringify(nextConfig, null, 2) + "\n", { mode: 0o600 });
  await rename(tempPath, filePath);
  await migrateLarkChannelSessionCatalog(profile, workspace, legacyWorkspaces);
  return true;
}

async function loadBridgeConfig() {
  await loadEnvLocal();
  await ensureCodexBinaryHint();
  if (!(await exists(bridgeConfigPath))) {
    throw new Error(`缺少 lark-agent-bridge.config.json，请先运行 ${runnerCommand} run setup。`);
  }
  return readJson(bridgeConfigPath);
}

async function bridgeInstall() {
  const bridgeConfig = await loadBridgeConfig();
  if (!ensureBridgeNodeRuntime()) {
    return;
  }
  const bridgeCommand = process.env.LARK_CHANNEL_BRIDGE_COMMAND
    || resolveBridgeCommand(bridgeConfig.bridgeCommand);
  if (path.isAbsolute(bridgeCommand) && await exists(bridgeCommand)) {
    process.stdout.write(`OK bridge 已安装：${bridgeCommand}\n`);
    return;
  }

  const check = spawnSync(bridgeCommand, ["--version"], { cwd: repoRoot, encoding: "utf8" });
  if (check.status === 0) {
    process.stdout.write(`OK bridge 已安装：${bridgeCommand}\n`);
    return;
  }

  const installCommand = normalizeBridgeInstallCommand(process.env.LARK_CHANNEL_BRIDGE_INSTALL_COMMAND || bridgeConfig.installCommand);
  if (!installCommand) {
    process.stdout.write("MISS bridge install command\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`正在安装 lark-channel-bridge：${installCommand}\n`);
  const result = spawnSync(installCommand, {
    cwd: repoRoot,
    shell: true,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

async function runBridgeCommand(kind) {
  const bridgeConfig = await loadBridgeConfig();
  if (!ensureBridgeNodeRuntime()) {
    return;
  }
  const bridgeCommand = process.env.LARK_CHANNEL_BRIDGE_COMMAND
    || resolveBridgeCommand(bridgeConfig.bridgeCommand);
  const { agentId: requestedAgentId, profile: requestedProfile } = parseBridgeTargetArgs(process.argv.slice(3));
  let requestedAgent;
  let targetProfile = bridgeConfig.profile;
  let targetWorkspace = "";
  let legacyWorkspaces = [];
  let argsByKind;
  if (requestedAgentId) {
    const catalog = await loadAgentCatalog();
    requestedAgent = catalog.find((agent) => agent.id === requestedAgentId || agent.bridgeProfile === requestedAgentId);
    if (!requestedAgent) {
      throw new Error(`未知 agent/profile：${requestedAgentId}。可选：${catalog.map((agent) => agent.id).join(", ")}`);
    }
    const profile = requestedProfile || requestedAgent.bridgeProfile;
    const workspace = resolveRepoPath(requestedAgent.bridgeWorkspace || ".");
    targetProfile = profile;
    targetWorkspace = workspace;
    legacyWorkspaces = (requestedAgent.legacyBridgeWorkspaces || []).map(resolveRepoPath);
    argsByKind = {
      run: ["run", "--profile", profile, "--agent", bridgeConfig.agent || "codex", "--workspace", workspace],
      start: ["start", "--profile", profile, "--agent", bridgeConfig.agent || "codex", "--workspace", workspace],
      status: ["status", "--profile", profile],
      stop: ["stop", "--profile", profile]
    };
  } else {
    argsByKind = {
      run: bridgeConfig.firstRunArgs,
      start: bridgeConfig.serviceArgs,
      status: bridgeConfig.statusArgs,
      stop: bridgeConfig.stopArgs || ["stop", "--profile", bridgeConfig.profile || "mo-coach"]
    };
  }
  if (kind === "run" || kind === "start") {
    await ensureLarkChannelProfileUsesRules(targetProfile, targetWorkspace, legacyWorkspaces);
  }
  const args = materializeBridgeArgs(argsByKind[kind] || bridgeConfig.firstRunArgs);
  const result = spawnSync(bridgeCommand, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });
  const profileArgSuffix = requestedAgentId
    ? ` -- ${requestedAgentId}${requestedProfile ? ` --profile ${requestedProfile}` : ""}`
    : "";
  if (kind === "run") {
    if (requestedAgent?.bridgeWorkspace) {
      process.stdout.write(`\n确认 bot 可用并停止前台进程后，先运行 ${runnerCommand} run agent:configure-profile -- ${requestedAgent.id}${requestedProfile ? ` --profile ${requestedProfile}` : ""} 启用专属规则。\n`);
      process.stdout.write(`再运行 ${runnerCommand} run bridge:start${profileArgSuffix} 后台常驻，并用 ${runnerCommand} run bridge:status${profileArgSuffix} 查看状态。\n`);
    } else {
      process.stdout.write(`\nbridge:run 是前台绑定/调试模式；确认 bot 可用后，可以运行 ${runnerCommand} run bridge:start${profileArgSuffix} 后台常驻，再用 ${runnerCommand} run bridge:status${profileArgSuffix} 查看状态。\n`);
    }
  } else if (kind === "start" && (result.status ?? 1) === 0) {
    process.stdout.write(`\n后台服务已启动。可以运行 ${runnerCommand} run bridge:status${profileArgSuffix} 查看状态。\n`);
  }
  process.exitCode = result.status ?? 1;
}

const command = process.argv[2];

if (command === "setup") {
  await setup();
} else if (command === "doctor") {
  await doctor();
} else if (command === "bridge-install") {
  await bridgeInstall();
} else if (command === "bridge-doctor") {
  await bridgeDoctor();
} else if (command === "bridge-run") {
  await runBridgeCommand("run");
} else if (command === "bridge-start") {
  await runBridgeCommand("start");
} else if (command === "bridge-status") {
  await runBridgeCommand("status");
} else if (command === "bridge-stop") {
  await runBridgeCommand("stop");
} else {
  process.stdout.write("用法：node packages/setup-cli/src/index.js <setup|doctor|bridge-install|bridge-doctor|bridge-run|bridge-start|bridge-status|bridge-stop>\n");
  process.exitCode = 1;
}
