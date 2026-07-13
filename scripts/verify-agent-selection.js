import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const catalog = JSON.parse(await readFile(path.join(repoRoot, "templates", "agent-catalog.json"), "utf8"));
const ids = catalog.map((agent) => agent.id);
const requiredIds = ["mo-coach", "industry-dd-agent"];
const missing = requiredIds.filter((id) => !ids.includes(id));

if (missing.length) {
  console.error(`缺少 agent catalog 项：${missing.join(", ")}`);
  process.exit(1);
}

for (const agent of catalog) {
  for (const field of ["id", "displayName", "description", "audience", "configTemplate", "configOutput", "skillPath", "bridgeProfile", "bridgePrompt"]) {
    if (!agent[field]) {
      console.error(`${agent.id || "unknown"} 缺少字段：${field}`);
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
