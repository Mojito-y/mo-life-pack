import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const requiredProfileFields = ["id", "name", "description", "terms", "sections"];
export const requiredTermFields = ["name", "description", "evidenceRequired"];

export function normalizeIndustryConfig(raw = {}) {
  return {
    agentName: raw.agentName || "Industry DD Agent",
    defaultProfile: raw.defaultProfile || "medtech-bci",
    profilesDir: raw.profilesDir || "agents/industry-dd/profiles",
    workspaceDir: raw.workspaceDir || ".mo-life-pack/industry-dd",
    summaryMode: raw.summaryMode || "concise",
    scoreScale: Array.isArray(raw.scoreScale) && raw.scoreScale.length ? raw.scoreScale : ["pass", "watch", "reject"],
    dataRetention: raw.dataRetention || "local"
  };
}

export function validateProfile(profile = {}) {
  const errors = [];
  for (const field of requiredProfileFields) {
    if (!profile[field] || (Array.isArray(profile[field]) && profile[field].length === 0)) {
      errors.push(`缺少必填字段：${field}`);
    }
  }

  if (profile.terms && !Array.isArray(profile.terms)) {
    errors.push("字段 terms 必须是数组");
  }

  if (Array.isArray(profile.terms)) {
    profile.terms.forEach((term, index) => {
      for (const field of requiredTermFields) {
        if (!term[field]) {
          errors.push(`第 ${index + 1} 个词条缺少必填字段：${field}`);
        }
      }
    });
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export async function loadProfile(profileId, config = {}, cwd = process.cwd()) {
  const normalized = normalizeIndustryConfig(config);
  const profilePath = path.join(cwd, normalized.profilesDir, `${profileId}.json`);
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const validation = validateProfile(profile);
  if (!validation.ok) {
    throw new Error(`行业 profile 校验失败：\n${validation.errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return profile;
}

export async function saveProfile(profile, config = {}, cwd = process.cwd()) {
  const validation = validateProfile(profile);
  if (!validation.ok) {
    throw new Error(`行业 profile 校验失败：\n${validation.errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const normalized = normalizeIndustryConfig(config);
  const profilesDir = path.join(cwd, normalized.profilesDir);
  await mkdir(profilesDir, { recursive: true });
  const profilePath = path.join(profilesDir, `${profile.id}.json`);
  await writeFile(profilePath, JSON.stringify(profile, null, 2) + "\n");
  return profilePath;
}

export function createProjectIntake({ text = "", files = [], links = [], sourceName = "manual-input" } = {}) {
  const safeText = String(text || "").trim();
  return {
    createdAt: new Date().toISOString(),
    sources: [
      safeText
        ? {
            type: "text",
            name: sourceName,
            status: "extracted",
            characters: safeText.length
          }
        : null,
      ...files.map((file) => ({
        type: "file",
        name: typeof file === "string" ? file : file.name,
        status: "pending-extraction",
        note: "MVP 先记录文件引用；如解析失败，可用粘贴文本补充。"
      })),
      ...links.map((link) => ({
        type: "link",
        name: link,
        status: "pending-fetch"
      }))
    ].filter(Boolean),
    text: safeText,
    extractionIssues: safeText ? [] : ["未提供可分析文本，所有行业词条都会标记为 unknown。"]
  };
}

function termAliases(term) {
  return [term.name, ...(Array.isArray(term.aliases) ? term.aliases : [])].filter(Boolean);
}

function findEvidence(text, aliases) {
  const lower = text.toLowerCase();
  for (const alias of aliases) {
    const needle = String(alias).toLowerCase();
    const index = lower.indexOf(needle);
    if (index !== -1) {
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + needle.length + 80);
      return {
        alias,
        excerpt: text.slice(start, end).replace(/\s+/g, " ").trim()
      };
    }
  }
  return null;
}

function estimateScore(termResults) {
  const supported = termResults.filter((item) => item.status === "supported").length;
  const unsupported = termResults.filter((item) => item.status !== "supported").length;
  if (supported >= unsupported + 2) {
    return "watch";
  }
  if (supported > 0) {
    return "watch";
  }
  return "reject";
}

export function evaluateProject(profile, intake) {
  const validation = validateProfile(profile);
  if (!validation.ok) {
    throw new Error(`行业 profile 校验失败：\n${validation.errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const text = intake.text || "";
  const termResults = profile.terms.map((term) => {
    const evidence = findEvidence(text, termAliases(term));
    if (!text) {
      return {
        term: term.name,
        status: "unknown",
        confidence: "low",
        evidence: [],
        inference: "材料不足，无法判断该词条。",
        evidenceRequired: term.evidenceRequired,
        followUpQuestions: term.followUpQuestions || []
      };
    }

    if (!evidence) {
      return {
        term: term.name,
        status: "unsupported",
        confidence: "low",
        evidence: [],
        inference: "材料中未找到该词条的明确证据。",
        evidenceRequired: term.evidenceRequired,
        followUpQuestions: term.followUpQuestions || []
      };
    }

    return {
      term: term.name,
      status: "supported",
      confidence: "medium",
      evidence: [{
        source: intake.sources[0]?.name || "submitted-material",
        alias: evidence.alias,
        excerpt: evidence.excerpt
      }],
      inference: "已在材料中找到相关表述，仍需人工确认上下文和真实性。",
      evidenceRequired: term.evidenceRequired,
      redFlags: term.redFlags || [],
      followUpQuestions: term.followUpQuestions || []
    };
  });

  const missingEvidence = termResults
    .filter((item) => item.status !== "supported")
    .map((item) => ({
      term: item.term,
      request: `请补充「${item.term}」相关证据：${item.evidenceRequired}`
    }));

  const expertQuestions = (profile.expertProfiles || []).map((expert) => ({
    profile: expert.name,
    questions: expert.questions || []
  }));

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      description: profile.description
    },
    generatedAt: new Date().toISOString(),
    score: estimateScore(termResults),
    termResults,
    missingEvidence,
    expertQuestions,
    extractionIssues: intake.extractionIssues || []
  };
}

export function renderSummary(result) {
  const topRisks = result.termResults
    .filter((item) => item.status !== "supported")
    .slice(0, 3)
    .map((item) => `- ${item.term}: ${item.inference}`)
    .join("\n") || "- 暂未发现缺证词条";
  const nextActions = result.missingEvidence
    .slice(0, 3)
    .map((item) => `- ${item.request}`)
    .join("\n") || "- 可进入人工复核和专家访谈";

  return [
    `初筛 Profile：${result.profile.name}`,
    `初步评分：${result.score}`,
    "",
    "Top 风险/缺口：",
    topRisks,
    "",
    "下一步：",
    nextActions
  ].join("\n");
}

export function renderMarkdownCard(result) {
  const terms = result.termResults.map((item) => {
    const evidence = item.evidence.length
      ? item.evidence.map((entry) => `  - 来源：${entry.source}；命中：${entry.alias}；摘录：${entry.excerpt}`).join("\n")
      : "  - 无直接证据";
    const questions = item.followUpQuestions?.length
      ? item.followUpQuestions.map((question) => `  - ${question}`).join("\n")
      : "  - 暂无";
    return [
      `### ${item.term}`,
      `- 状态：${item.status}`,
      `- 信心：${item.confidence}`,
      `- 判断：${item.inference}`,
      `- 证据要求：${item.evidenceRequired}`,
      "- 证据：",
      evidence,
      "- 建议追问：",
      questions
    ].join("\n");
  }).join("\n\n");

  const expertQuestions = result.expertQuestions.length
    ? result.expertQuestions.map((expert) => {
        const questions = expert.questions.map((question) => `  - ${question}`).join("\n") || "  - 暂无";
        return `- ${expert.profile}\n${questions}`;
      }).join("\n")
    : "- 暂无";

  return [
    `# 项目初筛 DD 卡`,
    "",
    `- 行业 Profile：${result.profile.name}（${result.profile.id}）`,
    `- 初步评分：${result.score}`,
    `- 生成时间：${result.generatedAt}`,
    "",
    "## 词条评估",
    "",
    terms,
    "",
    "## 缺失材料",
    "",
    result.missingEvidence.length
      ? result.missingEvidence.map((item) => `- ${item.request}`).join("\n")
      : "- 暂无明显缺失材料",
    "",
    "## 专家访谈建议",
    "",
    expertQuestions,
    "",
    "## 边界说明",
    "",
    "本卡片用于项目初筛和后续尽调准备，不构成投资、法律、医学、监管或其他专业结论。"
  ].join("\n");
}
