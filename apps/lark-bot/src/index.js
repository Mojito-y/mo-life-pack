import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createProjectIntake,
  evaluateProject,
  loadProfile,
  normalizeIndustryConfig,
  renderSummary
} from "../../../packages/industry-dd-core/src/index.js";

const port = Number(process.env.PORT || 3000);
const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "coach.config.json");
const industryConfigPath = path.join(repoRoot, "industry-dd.config.json");

async function readConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return null;
  }
}

async function readIndustryConfig() {
  try {
    return normalizeIndustryConfig(JSON.parse(await readFile(industryConfigPath, "utf8")));
  } catch {
    return normalizeIndustryConfig();
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const config = await readConfig();

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/config") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ config }));
    return;
  }

  if (req.url?.startsWith("/dd")) {
    const industryConfig = await readIndustryConfig();
    const url = new URL(req.url, `http://localhost:${port}`);
    const profileId = url.searchParams.get("profile") || industryConfig.defaultProfile;
    const text = req.method === "POST"
      ? await readBody(req)
      : url.searchParams.get("text") || "";
    try {
      const profile = await loadProfile(profileId, industryConfig, repoRoot);
      const intake = createProjectIntake({ text, sourceName: "lark-bot-placeholder" });
      const result = evaluateProject(profile, intake);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`${renderSummary(result)}\n`);
    } catch (error) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end(`${error.message}\n`);
    }
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(`Mo Life Pack bot placeholder${config?.coachName ? ` for ${config.coachName}` : ""}\n`);
});

server.listen(port, () => {
  process.stdout.write(`Mo Coach bot placeholder listening on http://localhost:${port}\n`);
});
