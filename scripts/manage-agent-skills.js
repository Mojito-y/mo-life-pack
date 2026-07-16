#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

function parseArguments(args) {
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const agentId = positional[0];
  const install = args.includes("--install");
  const check = args.includes("--check");
  const unknown = args.filter((arg) => arg.startsWith("--") && !["--install", "--check"].includes(arg));
  if (positional.length !== 1 || unknown.length) {
    throw new Error("用法：npm run agent:skills -- <agent-id> [--install] [--check]");
  }
  return { agentId, install, check };
}

async function exists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function executable(filePath) {
  if (!filePath) return false;
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCli(command) {
  const candidates = [
    process.env.IWENCAI_SKILLHUB_CLI,
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, command)),
    path.join(os.homedir(), ".local", "bin", command)
  ];
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    if (await executable(candidate)) return path.resolve(candidate);
  }
  return "";
}

function skillsRoot() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills");
}

async function inspectSkills(agent) {
  const root = skillsRoot();
  const skills = await Promise.all(agent.skillDependencies.skills.map(async (skill) => ({
    ...skill,
    installed: await exists(path.join(root, skill.id, "SKILL.md"))
  })));
  return { root, skills };
}

function printGuide(agent, inspection, cli) {
  const dependencies = agent.skillDependencies;
  process.stdout.write(`${agent.displayName} 数据 Skill：\n`);
  for (const skill of inspection.skills) {
    process.stdout.write(`${skill.installed ? "OK" : "MISS"} ${skill.id}：${skill.purpose}\n`);
  }
  process.stdout.write(`${cli ? "OK" : "MISS"} ${dependencies.cliCommand}${cli ? `: ${cli}` : ""}\n`);

  if (!cli) {
    process.stdout.write("\n先安装同花顺问财 SkillHub CLI：\n");
    process.stdout.write(`bash -c "$(curl -fsSL ${dependencies.installerUrl})"\n`);
  }
  if (inspection.skills.some((skill) => !skill.installed)) {
    process.stdout.write(`\n安装缺失 Skill：npm run agent:skills -- ${agent.id} --install\n`);
  }

  const tokenEnv = dependencies.tokenEnv;
  if (process.env[tokenEnv]) {
    process.stdout.write(`OK ${tokenEnv} 已配置（不输出值）\n`);
  } else {
    process.stdout.write(`\nToken 获取：打开 ${dependencies.tokenHelpUrl}，进入任一上述 Skill 详情，查看「安装方式」→「Agent 用户」。\n`);
    process.stdout.write(`按页面提示把 ${tokenEnv} 写入 shell profile，然后重新打开终端。\n`);
  }
}

async function installMissing(agent, inspection, cli) {
  if (!cli) throw new Error("缺少 iwencai-skillhub-cli，请先执行上面的官方安装命令。");

  // SkillHub CLI 会优先识别 OpenClaw；失败 shim 让 --dir 仍指向 Codex skills。
  const shimDir = await mkdtemp(path.join(os.tmpdir(), "mo-life-pack-skillhub-"));
  const shim = path.join(shimDir, "openclaw");
  await writeFile(shim, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await chmod(shim, 0o755);
  try {
    for (const skill of inspection.skills.filter((item) => !item.installed)) {
      process.stdout.write(`正在安装 ${skill.id}...\n`);
      const result = spawnSync(cli, ["--dir", inspection.root, "install", skill.id], {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH || ""}` },
        stdio: "inherit"
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${skill.id} 安装失败。`);
    }
  } finally {
    await rm(shimDir, { recursive: true, force: true });
  }
}

async function main() {
  const { agentId, install, check } = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(await readFile(path.join(repoRoot, "templates", "agent-catalog.json"), "utf8"));
  const agent = catalog.find((item) => item.id === agentId);
  if (!agent) throw new Error(`未知 agent：${agentId}`);
  if (!agent.skillDependencies?.skills?.length) {
    process.stdout.write(`${agent.displayName} 没有额外 Skill 依赖。\n`);
    return;
  }

  const cli = await resolveCli(agent.skillDependencies.cliCommand);
  let inspection = await inspectSkills(agent);
  printGuide(agent, inspection, cli);

  if (install && inspection.skills.some((skill) => !skill.installed)) {
    await installMissing(agent, inspection, cli);
    inspection = await inspectSkills(agent);
    process.stdout.write("\n安装结果：\n");
    printGuide(agent, inspection, cli);
  } else if (install) {
    process.stdout.write("\n5 个数据 Skill 已安装，无需重复安装。\n");
  }

  if (install && inspection.skills.some((skill) => !skill.installed)) process.exitCode = 1;
  if (check && (!cli || inspection.skills.some((skill) => !skill.installed) || !process.env[agent.skillDependencies.tokenEnv])) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
