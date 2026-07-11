import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const port = Number(process.env.PORT || 3000);
const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "coach.config.json");

async function readConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return null;
  }
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

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(`Mo Coach bot placeholder${config?.coachName ? ` for ${config.coachName}` : ""}\n`);
});

server.listen(port, () => {
  process.stdout.write(`Mo Coach bot placeholder listening on http://localhost:${port}\n`);
});

