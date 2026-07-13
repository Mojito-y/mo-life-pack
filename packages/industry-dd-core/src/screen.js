import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createProjectIntake,
  evaluateProject,
  loadProfile,
  normalizeIndustryConfig,
  renderMarkdownCard,
  renderSummary
} from "./index.js";

const configPath = process.argv[2] || "industry-dd.config.json";
const profileArg = process.argv[3];
const inputPath = process.argv[4];

try {
  const config = normalizeIndustryConfig(JSON.parse(await readFile(configPath, "utf8")));
  const profile = await loadProfile(profileArg || config.defaultProfile, config);
  const text = inputPath ? await readFile(inputPath, "utf8") : "";
  const intake = createProjectIntake({ text, sourceName: inputPath || "stdin-placeholder" });
  const result = evaluateProject(profile, intake);
  const outputDir = path.join(process.cwd(), config.workspaceDir);
  await mkdir(outputDir, { recursive: true });
  const cardPath = path.join(outputDir, `dd-card-${Date.now()}.md`);
  await writeFile(cardPath, renderMarkdownCard(result));
  process.stdout.write(`${renderSummary(result)}\n\n完整卡片：${cardPath}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
