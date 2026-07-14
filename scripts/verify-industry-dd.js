import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createProjectIntake,
  evaluateProject,
  loadProfile,
  normalizeIndustryConfig,
  renderMarkdownCard,
  renderSummary,
  validateProfile
} from "../packages/industry-dd-core/src/index.js";

const repoRoot = process.cwd();
const config = normalizeIndustryConfig(JSON.parse(await readFile(path.join(repoRoot, "agents", "industry-dd", "templates", "industry-dd.config.example.json"), "utf8")));
const medtechProfile = await loadProfile("medtech-bci", config, repoRoot);
const aiProfile = await loadProfile("ai-saas", config, repoRoot);

for (const profile of [medtechProfile, aiProfile]) {
  const validation = validateProfile(profile);
  if (!validation.ok) {
    console.error(validation.errors.join("\n"));
    process.exit(1);
  }
}

const emptyResult = evaluateProject(aiProfile, createProjectIntake({ text: "" }));
if (!emptyResult.termResults.every((item) => item.status === "unknown")) {
  console.error("空材料应全部标记为 unknown");
  process.exit(1);
}

const sampleText = await readFile(path.join(repoRoot, "agents", "industry-dd", "examples", "ai-saas-input.txt"), "utf8");
const aiResult = evaluateProject(aiProfile, createProjectIntake({ text: sampleText, sourceName: "ai-saas-input.txt" }));
const markdown = renderMarkdownCard(aiResult);
if (markdown.includes("注册路径") || markdown.includes("脑机接口")) {
  console.error("自定义 AI SaaS profile 不应输出医疗器械/脑机接口专属字段");
  process.exit(1);
}

const summary = renderSummary(aiResult);
if (!summary.includes("AI SaaS") || !markdown.includes("行业 Profile：AI SaaS")) {
  console.error("输出缺少行业 profile 信息");
  process.exit(1);
}

console.log("OK industry-dd core verification passed");
