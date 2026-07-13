import { cp, mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "templates", "agent-catalog.json");
const agentConfigPath = path.join(repoRoot, "agent.config.json");
const targetRoot = path.join(os.homedir(), ".codex", "skills");

async function exists(targetPath) {
  try {
    await stat(targetPath);
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

async function resolveAgentId() {
  const argIndex = process.argv.indexOf("--agent");
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return process.argv[argIndex + 1];
  }

  if (process.env.MO_LIFE_PACK_AGENT) {
    return process.env.MO_LIFE_PACK_AGENT;
  }

  if (await exists(agentConfigPath)) {
    const config = await readJson(agentConfigPath);
    if (config.selectedAgent) {
      return config.selectedAgent;
    }
  }

  return "mo-coach";
}

async function main() {
  const catalog = await readJson(catalogPath);
  const agentId = await resolveAgentId();
  const agent = catalog.find((item) => item.id === agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}. Available agents: ${catalog.map((item) => item.id).join(", ")}`);
  }

  const source = resolveRepoPath(agent.skillPath);
  const target = path.join(targetRoot, agent.id);
  if (!(await exists(source))) {
    throw new Error(`Missing ${agent.skillPath}. Run setup after the skill scaffold exists.`);
  }

  await mkdir(targetRoot, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  process.stdout.write(`Installed ${agent.displayName} skill to ${target}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
