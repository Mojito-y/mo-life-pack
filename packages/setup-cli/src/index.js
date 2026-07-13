import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "coach.config.json");
const bridgeConfigPath = path.join(repoRoot, "lark-agent-bridge.config.json");
const configTemplatePath = path.join(repoRoot, "templates", "coach.config.example.json");
const bridgeTemplatePath = path.join(repoRoot, "templates", "lark-agent-bridge.config.example.json");
const envTemplatePath = path.join(repoRoot, "templates", "env.example");
const skillInstallScript = path.join(repoRoot, "scripts", "install-skill.js");
const runnerCommand = "npm";
const macCodexAppBinary = "/Applications/Codex.app/Contents/Resources/codex";

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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function resolveRepoPath(value) {
  if (!value || path.isAbsolute(value)) {
    return value;
  }
  return path.join(repoRoot, value);
}

function maybeWindowsCommandShim(value) {
  if (process.platform !== "win32" || !value || /\.(cmd|exe|bat)$/i.test(value)) {
    return value;
  }

  if (path.isAbsolute(value) || value.startsWith(".") || value.includes("/") || value.includes("\\")) {
    return `${value}.cmd`;
  }

  return value;
}

function resolveBridgeCommand(value) {
  return maybeWindowsCommandShim(resolveRepoPath(value));
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
  if (process.env.LARK_CHANNEL_CODEX_BIN) {
    return process.env.LARK_CHANNEL_CODEX_BIN;
  }

  const pathCodex = spawnSync("codex", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000
  });
  if (pathCodex.status === 0) {
    return "";
  }

  if (await executableExists(macCodexAppBinary)) {
    return macCodexAppBinary;
  }

  return "";
}

async function getCodexCliStatus() {
  if (process.env.LARK_CHANNEL_CODEX_BIN) {
    return {
      ok: await executableExists(process.env.LARK_CHANNEL_CODEX_BIN),
      label: process.env.LARK_CHANNEL_CODEX_BIN,
      source: "LARK_CHANNEL_CODEX_BIN"
    };
  }

  const pathCodex = spawnSync("codex", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000
  });
  if (pathCodex.status === 0) {
    return { ok: true, label: "codex", source: "PATH" };
  }

  if (await executableExists(macCodexAppBinary)) {
    return { ok: true, label: macCodexAppBinary, source: "macOS Codex App" };
  }

  return { ok: false, label: macCodexAppBinary, source: "macOS Codex App" };
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
    if (!values.LARK_CHANNEL_CODEX_BIN) {
      await writeFile(envLocalPath, upsertBlankEnvValue(current, "LARK_CHANNEL_CODEX_BIN", codexPath));
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
  const template = await readJson(configTemplatePath);
  const bridgeTemplate = await readJson(bridgeTemplatePath);
  const useDefaults = process.env.MO_LIFE_PACK_ASSUME_DEFAULTS === "1";
  let config;
  let bridgeConfig = bridgeTemplate;

  if (useDefaults) {
    process.stdout.write("使用默认配置初始化 Mo Coach 和飞书机器人 Agent Bridge。\n");
    config = template;
    bridgeConfig = {
      ...bridgeTemplate,
      bridgeCommand: bridgeCommandFromTemplate(bridgeTemplate),
      workspace: repoRoot
    };
  } else {
    const rl = readline.createInterface({ input, output });
    try {
      process.stdout.write("开始设置 Mo Coach。看不懂的问题直接回车即可使用默认值。\n\n");
      const coachName = (await rl.question(`教练名称 [${template.coachName}]: `)).trim() || template.coachName;
      const style = (await rl.question(`教练风格 [${template.style}]: `)).trim() || template.style;
      const goals = (await rl.question("训练目标，多个用英文逗号分隔 [general_fitness]: ")).trim();
      const equipment = (await rl.question("可用器械，多个用英文逗号分隔 [bodyweight]: ")).trim();
      const sessionMinutes = (await rl.question(`每次训练分钟数 [${template.sessionMinutes}]: `)).trim();
      const connectBridge = (await rl.question("是否接入 lark-channel-bridge 飞书机器人？[Y/n]: ")).trim().toLowerCase();
      const defaultBridgeCommand = bridgeCommandFromTemplate(bridgeTemplate);
      const bridgeCommand = connectBridge === "n"
        ? defaultBridgeCommand
        : (await rl.question(`Bridge 命令 [${defaultBridgeCommand}]: `)).trim() || defaultBridgeCommand;
      const bridgeInstallCommand = connectBridge === "n"
        ? bridgeTemplate.installCommand
        : (await rl.question(`Bridge 安装命令 [${bridgeTemplate.installCommand}]: `)).trim() || bridgeTemplate.installCommand;

      config = {
        ...template,
        coachName,
        style,
        goals: goals ? goals.split(",").map((item) => item.trim()).filter(Boolean) : template.goals,
        equipment: equipment ? equipment.split(",").map((item) => item.trim()).filter(Boolean) : template.equipment,
        sessionMinutes: sessionMinutes ? Number(sessionMinutes) : template.sessionMinutes
      };
      bridgeConfig = {
        ...bridgeTemplate,
        enabled: connectBridge !== "n",
        bridgeCommand,
        workspace: repoRoot,
        installCommand: bridgeInstallCommand,
        agentPrompt: `Use $mo-coach as ${coachName} to answer fitness check-ins and update training plans.`
      };
    } finally {
      rl.close();
    }
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  await writeFile(bridgeConfigPath, JSON.stringify(bridgeConfig, null, 2) + "\n");
  const install = spawnSync(process.execPath, [skillInstallScript], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  await ensureEnvLocal();

  process.stdout.write(`已保存 ${path.relative(repoRoot, configPath)}\n`);
  process.stdout.write(`已保存 ${path.relative(repoRoot, bridgeConfigPath)}\n`);
  if (install.status !== 0) {
    process.stdout.write(`Skill 安装可能需要处理权限。检查后可运行 ${runnerCommand} run install:skill。\n`);
  }
  process.stdout.write(`下一步：运行 ${runnerCommand} run bridge:run，扫码绑定飞书 PersonalAgent。\n`);
  process.stdout.write(`确认能收发消息后，按 Ctrl-C 停掉前台进程，再运行 ${runnerCommand} run bridge:start 后台常驻。\n`);
  process.stdout.write(`Skill 安装脚本位置：${path.relative(repoRoot, skillInstallScript)}\n`);
}

async function doctor() {
  await loadEnvLocal();
  const codexCli = await getCodexCliStatus();
  const skillInstallTarget = path.join(process.env.HOME || "", ".codex", "skills", "mo-coach", "SKILL.md");
  const checks = [
    ["skill scaffold", await exists(path.join(repoRoot, "skills", "mo-coach", "SKILL.md"))],
    ["coach config template", await exists(configTemplatePath)],
    ["env template", await exists(envTemplatePath)],
    ["env local", await exists(path.join(repoRoot, ".env.local"))],
    ["setup script", await exists(skillInstallScript)],
    ["lark agent bridge template", await exists(bridgeTemplatePath)],
    ["lark agent bridge config", await exists(bridgeConfigPath)],
    ["installed skill", skillInstallTarget ? await exists(skillInstallTarget) : false]
  ];

  const failures = checks.filter(([, ok]) => !ok);
  for (const [label, ok] of checks) {
    process.stdout.write(`${ok ? "OK" : "MISS"} ${label}\n`);
  }
  if (codexCli.ok) {
    process.stdout.write(`OK Codex CLI (${codexCli.source}): ${codexCli.label}\n`);
  } else {
    process.stdout.write(`WARN Codex CLI 未找到。macOS Codex App 常见路径：${macCodexAppBinary}\n`);
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
  const bridgeCommand = process.env.LARK_CHANNEL_BRIDGE_COMMAND
    ? maybeWindowsCommandShim(process.env.LARK_CHANNEL_BRIDGE_COMMAND)
    : resolveBridgeCommand(bridgeConfig.bridgeCommand);
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

function normalizeBridgeInstallCommand(command) {
  if (!command) {
    return command;
  }

  if (/^\s*pnpm\s+install\s*$/.test(command)) {
    return `${runnerCommand} install`;
  }

  return command;
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
  const bridgeCommand = process.env.LARK_CHANNEL_BRIDGE_COMMAND
    ? maybeWindowsCommandShim(process.env.LARK_CHANNEL_BRIDGE_COMMAND)
    : resolveBridgeCommand(bridgeConfig.bridgeCommand);
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
  const bridgeCommand = process.env.LARK_CHANNEL_BRIDGE_COMMAND
    ? maybeWindowsCommandShim(process.env.LARK_CHANNEL_BRIDGE_COMMAND)
    : resolveBridgeCommand(bridgeConfig.bridgeCommand);
  const argsByKind = {
    run: bridgeConfig.firstRunArgs,
    start: bridgeConfig.serviceArgs,
    status: bridgeConfig.statusArgs,
    stop: bridgeConfig.stopArgs || ["stop", "--profile", bridgeConfig.profile || "mo-coach"]
  };
  const args = materializeBridgeArgs(argsByKind[kind] || bridgeConfig.firstRunArgs);
  const result = spawnSync(bridgeCommand, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (kind === "run") {
    process.stdout.write(`\nbridge:run 是前台绑定/调试模式；确认 bot 可用后，可以运行 ${runnerCommand} run bridge:start 后台常驻，再用 ${runnerCommand} run bridge:status 查看状态。\n`);
  } else if (kind === "start" && (result.status ?? 1) === 0) {
    process.stdout.write(`\n后台服务已启动。可以运行 ${runnerCommand} run bridge:status 查看状态。\n`);
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
