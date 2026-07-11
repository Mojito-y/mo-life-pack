import { readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "coach.config.json");
const configTemplatePath = path.join(repoRoot, "templates", "coach.config.example.json");
const envTemplatePath = path.join(repoRoot, "templates", "env.example");
const skillInstallScript = path.join(repoRoot, "scripts", "install-skill.js");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function setup() {
  const rl = readline.createInterface({ input, output });
  try {
    const template = await readJson(configTemplatePath);
    const coachName = (await rl.question(`Coach name [${template.coachName}]: `)).trim() || template.coachName;
    const style = (await rl.question(`Coach style [${template.style}]: `)).trim() || template.style;
    const goals = (await rl.question("Goals (comma-separated) [general_fitness]: ")).trim();
    const equipment = (await rl.question("Equipment (comma-separated) [bodyweight]: ")).trim();
    const sessionMinutes = (await rl.question(`Session minutes [${template.sessionMinutes}]: `)).trim();

    const config = {
      ...template,
      coachName,
      style,
      goals: goals ? goals.split(",").map((item) => item.trim()).filter(Boolean) : template.goals,
      equipment: equipment ? equipment.split(",").map((item) => item.trim()).filter(Boolean) : template.equipment,
      sessionMinutes: sessionMinutes ? Number(sessionMinutes) : template.sessionMinutes
    };

    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    const install = spawnSync(process.execPath, [skillInstallScript], {
      cwd: repoRoot,
      stdio: "inherit"
    });

    if (!(await exists(path.join(repoRoot, ".env.local")))) {
      const envTemplate = await readFile(envTemplatePath, "utf8");
      await writeFile(path.join(repoRoot, ".env.local"), envTemplate);
    }

    process.stdout.write(`Saved ${path.relative(repoRoot, configPath)}\n`);
    if (install.status !== 0) {
      process.stdout.write("Skill install needs attention. Run pnpm install:skill after checking permissions.\n");
    }
    process.stdout.write("Next: fill in Feishu variables in .env.local, then run pnpm doctor.\n");
    process.stdout.write(`Skill install script ready at ${path.relative(repoRoot, skillInstallScript)}\n`);
  } finally {
    rl.close();
  }
}

async function doctor() {
  const skillInstallTarget = path.join(process.env.HOME || "", ".codex", "skills", "mo-coach", "SKILL.md");
  const checks = [
    ["skill scaffold", await exists(path.join(repoRoot, "skills", "mo-coach", "SKILL.md"))],
    ["coach config template", await exists(configTemplatePath)],
    ["env template", await exists(envTemplatePath)],
    ["setup script", await exists(skillInstallScript)],
    ["installed skill", skillInstallTarget ? await exists(skillInstallTarget) : false]
  ];

  const failures = checks.filter(([, ok]) => !ok);
  for (const [label, ok] of checks) {
    process.stdout.write(`${ok ? "OK" : "MISS"} ${label}\n`);
  }

  if (failures.length) {
    process.exitCode = 1;
  }
}

const command = process.argv[2];

if (command === "setup") {
  await setup();
} else if (command === "doctor") {
  await doctor();
} else {
  process.stdout.write("Usage: node packages/setup-cli/src/index.js <setup|doctor>\n");
  process.exitCode = 1;
}
