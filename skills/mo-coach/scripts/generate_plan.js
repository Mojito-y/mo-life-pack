#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

const goalProfiles = {
  fat_loss: { focus: "calorie burn with strength retention", split: "full_body", conditioning: "moderate" },
  muscle_gain: { focus: "hypertrophy with progressive overload", split: "upper_lower", conditioning: "light" },
  strength: { focus: "heavy compound lifts", split: "push_pull_legs", conditioning: "minimal" },
  conditioning: { focus: "work capacity and engine building", split: "mixed", conditioning: "high" },
  mobility: { focus: "joint range and control", split: "mobility_flow", conditioning: "light" },
  recovery: { focus: "restoration and load management", split: "recovery", conditioning: "minimal" },
  general_fitness: { focus: "balanced fitness across strength, capacity, and movement", split: "full_body", conditioning: "moderate" }
};

const defaultCarbCycling = {
  enabled: false,
  strategy: "training-day-carb-cycling",
  highCarbDays: [],
  mediumCarbDays: [],
  lowCarbDays: [],
  proteinGPerKg: 1.8,
  fatGPerKgLow: 0.8,
  fatGPerKgHigh: 0.6,
  waterMlPerKg: 35,
  notes: []
};

function normalizeCarbCycling(raw = {}, weeklySchedule = []) {
  const source = raw && typeof raw === "object" ? raw : {};
  const highCarbDays = Array.isArray(source.highCarbDays) && source.highCarbDays.length
    ? source.highCarbDays
    : weeklySchedule.slice(0, 2);
  const mediumCarbDays = Array.isArray(source.mediumCarbDays)
    ? source.mediumCarbDays
    : weeklySchedule.filter((day) => !highCarbDays.includes(day));
  return {
    ...defaultCarbCycling,
    ...source,
    enabled: Boolean(source.enabled),
    highCarbDays,
    mediumCarbDays,
    lowCarbDays: Array.isArray(source.lowCarbDays) ? source.lowCarbDays : [],
    proteinGPerKg: Number(source.proteinGPerKg || defaultCarbCycling.proteinGPerKg),
    fatGPerKgLow: Number(source.fatGPerKgLow || defaultCarbCycling.fatGPerKgLow),
    fatGPerKgHigh: Number(source.fatGPerKgHigh || defaultCarbCycling.fatGPerKgHigh),
    waterMlPerKg: Number(source.waterMlPerKg || defaultCarbCycling.waterMlPerKg),
    notes: Array.isArray(source.notes) ? source.notes : []
  };
}

function carbDayType(day, carbCycling) {
  if (!carbCycling.enabled) {
    return "standard";
  }
  if (carbCycling.highCarbDays.includes(day)) {
    return "high";
  }
  if (carbCycling.mediumCarbDays.includes(day)) {
    return "medium";
  }
  return "low";
}

function carbDayGuidance(dayType) {
  const guidance = {
    high: {
      label: "高碳日",
      timing: "把主要碳水放在训练前后，支持力量表现和恢复；脂肪相对收低。",
      plate: "主食 2-3 餐，优先米饭、土豆、燕麦、全麦面、香蕉等低负担碳水。"
    },
    medium: {
      label: "中碳日",
      timing: "维持训练质量和日常活动，主食集中在早餐、午餐或训练后。",
      plate: "主食 1-2 餐，蛋白质和蔬菜稳定，脂肪适中。"
    },
    low: {
      label: "低碳日",
      timing: "用于休息或低强度活动日，制造温和热量缺口；不要极端断碳。",
      plate: "以蛋白质、蔬菜、适量健康脂肪为主，保留少量水果或根茎类。"
    },
    standard: {
      label: "均衡日",
      timing: "按普通健康饮食安排，不做明显碳水波动。",
      plate: "每餐包含蛋白质、蔬菜和适量主食。"
    }
  };
  return guidance[dayType] || guidance.standard;
}

function normalize(config = {}) {
  const weeklySchedule = Array.isArray(config.weeklySchedule) && config.weeklySchedule.length ? config.weeklySchedule : ["Mon", "Wed", "Fri"];
  return {
    coachName: config.coachName || "Mo Coach",
    style: config.style || "calm, concise, evidence-informed",
    goals: Array.isArray(config.goals) && config.goals.length ? config.goals : ["general_fitness"],
    equipment: Array.isArray(config.equipment) ? config.equipment : [],
    weeklySchedule,
    sessionMinutes: Number(config.sessionMinutes || 45),
    constraints: Array.isArray(config.constraints) ? config.constraints : [],
    bodyWeightKg: config.bodyWeightKg ? Number(config.bodyWeightKg) : null,
    nutrition: {
      ...(config.nutrition || {}),
      carbCycling: normalizeCarbCycling(config.nutrition?.carbCycling, weeklySchedule)
    }
  };
}

function buildPlan(config) {
  const normalized = normalize(config);
  const primaryGoal = normalized.goals[0];
  const profile = goalProfiles[primaryGoal] || goalProfiles.general_fitness;

  const dailyRules = normalized.nutrition.carbCycling.enabled
    ? [
        `蛋白质基准：约 ${normalized.nutrition.carbCycling.proteinGPerKg} g/kg/天，优先稳定不随高低碳大幅波动。`,
        `饮水基准：约 ${normalized.nutrition.carbCycling.waterMlPerKg} ml/kg/天，训练日和高碳日可上调。`,
        "高碳日优先绑定大肌群/高强度训练日；低碳日优先绑定休息、低强度有氧或恢复日。",
        "碳循环服务于执行和恢复，不追求极端断碳。"
      ]
    : [
        "每餐优先保证蛋白质和蔬菜。",
        "训练日前后保留主食，避免为了减脂牺牲训练质量。",
        "根据体重趋势、饥饿感和训练表现每周微调。"
      ];

  return {
    coachName: normalized.coachName,
    style: normalized.style,
    primaryGoal,
    focus: profile.focus,
    split: profile.split,
    conditioning: profile.conditioning,
    weeklySchedule: normalized.weeklySchedule,
    sessionMinutes: normalized.sessionMinutes,
    equipment: normalized.equipment,
    constraints: normalized.constraints,
    bodyWeightKg: normalized.bodyWeightKg,
    nutrition: {
      carbCycling: normalized.nutrition.carbCycling,
      dailyRules,
      notes: normalized.nutrition.carbCycling.notes
    },
    sessions: normalized.weeklySchedule.map((day, index) => ({
      day,
      emphasis: index % 2 === 0 ? "strength" : "accessory",
      durationMinutes: normalized.sessionMinutes,
      nutrition: carbDayGuidance(carbDayType(day, normalized.nutrition.carbCycling))
    }))
  };
}

async function loadConfig() {
  const filePath = process.argv[2] || "coach.config.json";
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

try {
  const plan = buildPlan(await loadConfig());
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
