import { readFile } from "node:fs/promises";
import process from "node:process";
import { saveProfile, validateProfile } from "./index.js";

function usage() {
  return [
    "用法：",
    "  node packages/industry-dd-core/src/profile.js validate <profile.json>",
    "  node packages/industry-dd-core/src/profile.js create <profile.json>",
    "",
    "说明：create 会校验并复制 profile 到 industry-dd.config.json 指定的 profilesDir。"
  ].join("\n");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const command = process.argv[2];
const profilePath = process.argv[3];

try {
  if (!command || !profilePath || !["validate", "create"].includes(command)) {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = 1;
  } else {
    const profile = await readJson(profilePath);
    const validation = validateProfile(profile);
    if (!validation.ok) {
      process.stdout.write(`行业 profile 校验失败：\n${validation.errors.map((error) => `- ${error}`).join("\n")}\n`);
      process.exitCode = 1;
    } else if (command === "validate") {
      process.stdout.write(`OK 行业 profile 可用：${profile.name}（${profile.id}）\n`);
    } else {
      const config = await readJson("industry-dd.config.json").catch(() => ({}));
      const savedPath = await saveProfile(profile, config);
      process.stdout.write(`已保存行业 profile：${savedPath}\n`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
