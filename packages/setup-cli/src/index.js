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
  const template = await readJson(configTemplatePath);
  const useDefaults = process.env.MO_LIFE_PACK_ASSUME_DEFAULTS === "1";
  let config;

  if (useDefaults) {
    process.stdout.write("使用默认配置初始化 Mo Coach。\n");
    config = template;
  } else {
    const rl = readline.createInterface({ input, output });
    try {
      process.stdout.write("开始设置 Mo Coach。看不懂的问题直接回车即可使用默认值。\n\n");
      const coachName = (await rl.question(`教练名称 [${template.coachName}]: `)).trim() || template.coachName;
      const style = (await rl.question(`教练风格 [${template.style}]: `)).trim() || template.style;
      const goals = (await rl.question("训练目标，多个用英文逗号分隔 [general_fitness]: ")).trim();
      const equipment = (await rl.question("可用器械，多个用英文逗号分隔 [bodyweight]: ")).trim();
      const sessionMinutes = (await rl.question(`每次训练分钟数 [${template.sessionMinutes}]: `)).trim();

      config = {
        ...template,
        coachName,
        style,
        goals: goals ? goals.split(",").map((item) => item.trim()).filter(Boolean) : template.goals,
        equipment: equipment ? equipment.split(",").map((item) => item.trim()).filter(Boolean) : template.equipment,
        sessionMinutes: sessionMinutes ? Number(sessionMinutes) : template.sessionMinutes
      };
    } finally {
      rl.close();
    }
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  const install = spawnSync(process.execPath, [skillInstallScript], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (!(await exists(path.join(repoRoot, ".env.local")))) {
    const envTemplate = await readFile(envTemplatePath, "utf8");
    await writeFile(path.join(repoRoot, ".env.local"), envTemplate);
  }

  process.stdout.write(`已保存 ${path.relative(repoRoot, configPath)}\n`);
  if (install.status !== 0) {
    process.stdout.write("Skill 安装可能需要处理权限。检查后可运行 pnpm install:skill。\n");
  }
  process.stdout.write("下一步：如需接入飞书，请填写 .env.local，然后运行 pnpm run doctor 检查状态。\n");
  process.stdout.write(`Skill 安装脚本位置：${path.relative(repoRoot, skillInstallScript)}\n`);
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
  process.stdout.write("用法：node packages/setup-cli/src/index.js <setup|doctor>\n");
  process.exitCode = 1;
}
