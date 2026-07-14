import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const catalog = JSON.parse(await readFile(path.join(repoRoot, "templates", "agent-catalog.json"), "utf8"));
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
