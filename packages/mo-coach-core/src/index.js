const goalProfiles = {
  fat_loss: {
    focus: "calorie burn with strength retention",
    defaultSplit: "full_body",
    conditioning: "moderate"
  },
  muscle_gain: {
    focus: "hypertrophy with progressive overload",
    defaultSplit: "upper_lower",
    conditioning: "light"
  },
  strength: {
    focus: "heavy compound lifts",
    defaultSplit: "push_pull_legs",
    conditioning: "minimal"
  },
  conditioning: {
    focus: "work capacity and engine building",
    defaultSplit: "mixed",
    conditioning: "high"
  },
  mobility: {
    focus: "joint range and control",
    defaultSplit: "mobility_flow",
    conditioning: "light"
  },
  recovery: {
    focus: "restoration and load management",
    defaultSplit: "recovery",
    conditioning: "minimal"
  },
  general_fitness: {
    focus: "balanced fitness across strength, capacity, and movement",
    defaultSplit: "full_body",
    conditioning: "moderate"
  }
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

function buildNutrition(config) {
  const carbCycling = normalizeCarbCycling(config.nutrition?.carbCycling, config.weeklySchedule);
  if (!carbCycling.enabled) {
    return {
      carbCycling,
      dailyRules: [
        "每餐优先保证蛋白质和蔬菜。",
        "训练日前后保留主食，避免为了减脂牺牲训练质量。",
        "根据体重趋势、饥饿感和训练表现每周微调。"
      ]
    };
  }

  return {
    carbCycling,
    dailyRules: [
      `蛋白质基准：约 ${carbCycling.proteinGPerKg} g/kg/天，优先稳定不随高低碳大幅波动。`,
      `饮水基准：约 ${carbCycling.waterMlPerKg} ml/kg/天，训练日和高碳日可上调。`,
      "高碳日优先绑定大肌群/高强度训练日；低碳日优先绑定休息、低强度有氧或恢复日。",
      "碳循环服务于执行和恢复，不追求极端断碳；若出现头晕、暴食冲动或训练明显掉线，先上调碳水或降低训练压力。"
    ],
    notes: carbCycling.notes
  };
}

export function normalizeCoachConfig(raw = {}) {
  const weeklySchedule = Array.isArray(raw.weeklySchedule) && raw.weeklySchedule.length ? raw.weeklySchedule : ["Mon", "Wed", "Fri"];
  return {
    coachName: raw.coachName || "Mo Coach",
    style: raw.style || "calm, concise, evidence-informed",
    goals: Array.isArray(raw.goals) && raw.goals.length ? raw.goals : ["general_fitness"],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    weeklySchedule,
    sessionMinutes: Number(raw.sessionMinutes || 45),
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    bodyWeightKg: raw.bodyWeightKg ? Number(raw.bodyWeightKg) : null,
    nutrition: {
      ...(raw.nutrition || {}),
      carbCycling: normalizeCarbCycling(raw.nutrition?.carbCycling, weeklySchedule)
    }
  };
}

export function buildCoachPlan(rawConfig = {}) {
  const config = normalizeCoachConfig(rawConfig);
  const primaryGoal = config.goals[0] || "general_fitness";
  const profile = goalProfiles[primaryGoal] || goalProfiles.general_fitness;

  const nutrition = buildNutrition(config);

  return {
    coachName: config.coachName,
    style: config.style,
    primaryGoal,
    focus: profile.focus,
    split: profile.defaultSplit,
    conditioning: profile.conditioning,
    weeklySchedule: config.weeklySchedule,
    sessionMinutes: config.sessionMinutes,
    equipment: config.equipment,
    constraints: config.constraints,
    bodyWeightKg: config.bodyWeightKg,
    nutrition,
    sessions: config.weeklySchedule.map((day, index) => ({
      day,
      emphasis: index % 2 === 0 ? "strength" : "accessory",
      durationMinutes: config.sessionMinutes,
      nutrition: carbDayGuidance(carbDayType(day, nutrition.carbCycling))
    }))
  };
}
