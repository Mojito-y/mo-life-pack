import { readFile } from "node:fs/promises";
import process from "node:process";
import { buildCoachPlan } from "./index.js";

const configPath = process.argv[2] || "coach.config.json";

try {
  const raw = JSON.parse(await readFile(configPath, "utf8"));
  const plan = buildCoachPlan(raw);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

