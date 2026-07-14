import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import lockfile from "proper-lockfile";

const WECLAW_VERSION = "v0.7.1";
const WECLAW_MODULE = `github.com/fastclaw-ai/weclaw@${WECLAW_VERSION}`;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const workspace = path.join(repoRoot, "agents", "investment-coach", "workspace");
const proxyPath = path.join(repoRoot, "agents", "investment-coach", "bin", "codex");
const configPath = path.join(os.homedir(), ".weclaw", "config.json");
const accountsDir = path.join(os.homedir(), ".weclaw", "accounts");

async function isExecutable(candidate) {
  if (!candidate) return false;
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(name) {
  return (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, name));
}

async function findExecutable(name, explicitCandidates = []) {
  for (const candidate of [...new Set([...explicitCandidates, ...pathCandidates(name)])]) {
    if (await isExecutable(candidate)) return path.resolve(candidate);
  }
  return null;
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim()
  };
}

function smokeTestCodexProxy(agent) {
  const initialize = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { clientInfo: { name: "mo-life-pack-doctor", version: "0.1.0" } }
  });
  const initialized = JSON.stringify({ jsonrpc: "2.0", method: "initialized" });
  return new Promise((resolve) => {
    const child = spawn(proxyPath, ["app-server", "--listen", "stdio://"], {
      cwd: workspace,
      env: { ...process.env, ...agent.env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      child.stdin.end();
      child.kill("SIGTERM");
      resolve(result);
    };
    const timeout = setTimeout(() => {
      finish({ ok: false, output: `initialize timed out${stderrBuffer ? `: ${stderrBuffer.trim().slice(-500)}` : ""}` });
    }, 10_000);

    child.on("error", (error) => finish({ ok: false, output: error.message }));
    child.on("exit", (code, signal) => {
      if (!finished) finish({ ok: false, output: `proxy exited before initialize response (${signal || code})` });
    });
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      if (stderrBuffer.length > 8_192) stderrBuffer = stderrBuffer.slice(-8_192);
    });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      while (stdoutBuffer.includes("\n")) {
        const index = stdoutBuffer.indexOf("\n");
        const line = stdoutBuffer.slice(0, index).trim();
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          finish({ ok: false, output: `invalid app-server JSONL: ${error.message}` });
          return;
        }
        if (message.id !== 1) continue;
        if (message.error || !Object.hasOwn(message, "result")) {
          finish({ ok: false, output: "initialize response missing or invalid" });
          return;
        }
        child.stdin.write(`${initialized}\n`, () => {
          finish({ ok: true, output: "Codex app-server handshake passed" });
        });
        return;
      }
    });

    child.stdin.write(`${initialize}\n`);
  });
}

function runInherited(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(command)} exited with ${signal || code}`));
      }
    });
  });
}

async function goBinDirectory(goBinary) {
  const gobin = capture(goBinary, ["env", "GOBIN"]);
  if (gobin.ok && gobin.output) return gobin.output.split(/\r?\n/)[0];
  const gopath = capture(goBinary, ["env", "GOPATH"]);
  if (gopath.ok && gopath.output) return path.join(gopath.output.split(path.delimiter)[0], "bin");
  return path.join(os.homedir(), "go", "bin");
}

async function resolveWeclaw() {
  return findExecutable("weclaw", [
    process.env.WECLAW_BIN,
    path.join(os.homedir(), "go", "bin", "weclaw"),
    path.join(os.homedir(), ".local", "bin", "weclaw")
  ]);
}

async function resolveCodex() {
  const candidate = await findExecutable("codex", [
    process.env.MO_LIFE_PACK_CODEX_BIN,
    process.env.LARK_CHANNEL_CODEX_BIN,
    "/Applications/Codex.app/Contents/Resources/codex",
    "/Applications/ChatGPT.app/Contents/Resources/codex"
  ]);
  if (!candidate) return null;
  if (path.resolve(candidate) === path.resolve(proxyPath)) {
    throw new Error("检测到 Codex 路径指向微信安全代理，请把 MO_LIFE_PACK_CODEX_BIN 指向真实 Codex CLI");
  }
  return candidate;
}

async function readJsonIfExists(targetPath, fallback) {
  try {
    return JSON.parse(await readFile(targetPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`无法读取 ${targetPath}: ${error.message}`);
  }
}

async function writeJsonAtomically(targetPath, value) {
  const temporary = `${targetPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, targetPath);
  await chmod(targetPath, 0o600);
}

async function configure() {
  const realCodex = await resolveCodex();
  if (!realCodex) {
    throw new Error("未找到真实 Codex CLI；请先安装 Codex，或设置 MO_LIFE_PACK_CODEX_BIN");
  }
  await access(path.join(workspace, "AGENTS.md"));
  await chmod(proxyPath, 0o755);
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(configPath), 0o700);

  const lockTarget = `${configPath}.lock`;
  await writeFile(lockTarget, "", { flag: "a", mode: 0o600 });
  await chmod(lockTarget, 0o600);
  const release = await lockfile.lock(lockTarget, {
    realpath: false,
    stale: 30_000,
    update: 10_000,
    retries: { retries: 10, minTimeout: 10, maxTimeout: 100 }
  });
  try {
    const current = await readJsonIfExists(configPath, {});
    const agents = current.agents && typeof current.agents === "object" && !Array.isArray(current.agents)
      ? current.agents
      : {};
    const next = {
      ...current,
      default_agent: "investment-coach",
      save_dir: path.join(repoRoot, ".mo-life-pack", "investment-coach", "wechat-attachments"),
      agents: {
        ...agents,
        "investment-coach": {
          type: "acp",
          command: proxyPath,
          args: ["app-server", "--listen", "stdio://"],
          aliases: ["invest", "coach"],
          cwd: workspace,
          env: {
            NODE_BINARY: process.execPath,
            MO_LIFE_PACK_CODEX_BIN: realCodex,
            MO_LIFE_PACK_INVESTMENT_WORKSPACE: workspace
          }
        }
      }
    };
    await writeJsonAtomically(configPath, next);
  } finally {
    await release();
  }

  process.stdout.write(`已配置微信 Investment Coach：${configPath}\n`);
  process.stdout.write("复用本机 Codex 登录态和默认模型；未扫码、未启动 WeClaw。\n");
}

async function install() {
  const goBinary = await findExecutable("go");
  if (!goBinary) throw new Error("未找到 Go；请先安装 Go 1.24 或更新版本");
  process.stdout.write(`正在安装 WeClaw ${WECLAW_VERSION}...\n`);
  await runInherited(goBinary, [
    "install",
    `-ldflags=-X=github.com/fastclaw-ai/weclaw/cmd.Version=${WECLAW_VERSION}`,
    WECLAW_MODULE
  ]);
  const binDir = await goBinDirectory(goBinary);
  const binary = await findExecutable("weclaw", [path.join(binDir, "weclaw")]);
  if (!binary) throw new Error(`安装完成但未找到 weclaw，可检查 ${binDir}`);
  const version = capture(binary, ["version"]);
  if (!version.ok || !version.output.includes(WECLAW_VERSION)) {
    throw new Error(`WeClaw 版本校验失败：${version.output || "无输出"}`);
  }
  process.stdout.write(`已安装 ${version.output}\n`);
  process.stdout.write(`binary: ${binary}\n`);
  process.stdout.write("未扫码、未启动 WeClaw。\n");
}

function validateAgentConfig(config) {
  const errors = [];
  const agent = config?.agents?.["investment-coach"];
  if (config?.default_agent !== "investment-coach") errors.push("default_agent 不是 investment-coach");
  if (!agent) return [...errors, "缺少 agents.investment-coach"];
  if (agent.type !== "acp") errors.push("investment-coach type 必须是 acp");
  if (path.resolve(agent.command || "/") !== path.resolve(proxyPath)) errors.push("investment-coach command 未指向只读代理");
  if (JSON.stringify(agent.args) !== JSON.stringify(["app-server", "--listen", "stdio://"])) errors.push("Codex app-server 参数不正确");
  if (path.resolve(agent.cwd || "/") !== path.resolve(workspace)) errors.push("Investment Coach workspace 不正确");
  if (!agent.env?.NODE_BINARY) errors.push("未配置固定 Node.js 路径");
  if (path.resolve(agent.env?.MO_LIFE_PACK_INVESTMENT_WORKSPACE || "/") !== path.resolve(workspace)) errors.push("安全代理未锁定 Investment Coach workspace");
  if (!agent.env?.MO_LIFE_PACK_CODEX_BIN) errors.push("未配置真实 Codex CLI 路径");
  return errors;
}

async function doctor() {
  const errors = [];
  const warnings = [];
  const weclaw = await resolveWeclaw();
  if (!weclaw) {
    errors.push("未找到 WeClaw，请先运行 npm run wechat:install");
  } else {
    const version = capture(weclaw, ["version"]);
    if (!version.ok || !version.output.includes(WECLAW_VERSION)) {
      errors.push(`WeClaw 必须是 ${WECLAW_VERSION}，当前：${version.output || "未知"}`);
    } else {
      process.stdout.write(`✓ ${version.output}\n`);
    }
  }

  const codex = await resolveCodex();
  if (!codex) {
    errors.push("未找到真实 Codex CLI");
  } else {
    const version = capture(codex, ["--version"]);
    if (!version.ok) errors.push(`Codex CLI 不可用：${version.output}`);
    else process.stdout.write(`✓ ${version.output}\n`);
  }

  if (!(await isExecutable(proxyPath))) errors.push(`只读代理不可执行：${proxyPath}`);
  else {
    const selfTest = capture(proxyPath, ["--self-test"]);
    if (!selfTest.ok) errors.push(`只读代理自检失败：${selfTest.output}`);
    else process.stdout.write(`✓ ${selfTest.output}\n`);
  }

  try {
    await access(path.join(workspace, "AGENTS.md"));
    process.stdout.write(`✓ workspace ${workspace}\n`);
  } catch {
    errors.push(`Investment Coach workspace 不存在：${workspace}`);
  }

  const config = await readJsonIfExists(configPath, null);
  if (!config) errors.push(`WeClaw 配置不存在：${configPath}`);
  else {
    const configErrors = validateAgentConfig(config);
    errors.push(...configErrors);
    if (configErrors.length === 0) {
      const smokeTest = await smokeTestCodexProxy(config.agents["investment-coach"]);
      if (!smokeTest.ok) errors.push(`Codex app-server 握手失败：${smokeTest.output}`);
      else process.stdout.write(`✓ ${smokeTest.output}\n`);
    }
  }

  try {
    const accounts = (await readdir(accountsDir)).filter((name) => name.endsWith(".json") && !name.endsWith(".sync.json"));
    if (accounts.length === 0) warnings.push("尚未绑定微信账号，请手动运行 npm run wechat:login");
    else process.stdout.write(`✓ 已绑定 ${accounts.length} 个微信账号\n`);
  } catch (error) {
    if (error.code === "ENOENT") warnings.push("尚未绑定微信账号，请手动运行 npm run wechat:login");
    else errors.push(`无法检查微信账号：${error.message}`);
  }

  for (const warning of warnings) process.stdout.write(`⚠ ${warning}\n`);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`✗ ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("OK 微信 Investment Coach 配置检查通过；本命令未启动 WeClaw。\n");
}

async function runLifecycle(action) {
  const weclaw = await resolveWeclaw();
  if (!weclaw) throw new Error("未找到 WeClaw，请先运行 npm run wechat:install");
  if (["login", "run", "start"].includes(action)) {
    const config = await readJsonIfExists(configPath, null);
    const errors = validateAgentConfig(config);
    if (errors.length) throw new Error(`微信 Investment Coach 尚未正确配置：${errors.join("；")}`);
  }
  const argsByAction = {
    login: ["login"],
    run: ["start", "--foreground"],
    start: ["start"],
    status: ["status"],
    stop: ["stop"]
  };
  await runInherited(weclaw, argsByAction[action]);
}

const action = process.argv[2];
try {
  if (action === "install") await install();
  else if (action === "configure") await configure();
  else if (action === "doctor") await doctor();
  else if (["login", "run", "start", "status", "stop"].includes(action)) await runLifecycle(action);
  else {
    process.stderr.write("用法: node scripts/wechat-channel.js <install|configure|doctor|login|run|start|status|stop>\n");
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
