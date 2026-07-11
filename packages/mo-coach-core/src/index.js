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

export function normalizeCoachConfig(raw = {}) {
  return {
    coachName: raw.coachName || "Mo Coach",
    style: raw.style || "calm, concise, evidence-informed",
    goals: Array.isArray(raw.goals) && raw.goals.length ? raw.goals : ["general_fitness"],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    weeklySchedule: Array.isArray(raw.weeklySchedule) && raw.weeklySchedule.length ? raw.weeklySchedule : ["Mon", "Wed", "Fri"],
    sessionMinutes: Number(raw.sessionMinutes || 45),
    constraints: Array.isArray(raw.constraints) ? raw.constraints : []
  };
}

export function buildCoachPlan(rawConfig = {}) {
  const config = normalizeCoachConfig(rawConfig);
  const primaryGoal = config.goals[0] || "general_fitness";
  const profile = goalProfiles[primaryGoal] || goalProfiles.general_fitness;

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
    sessions: config.weeklySchedule.map((day, index) => ({
      day,
      emphasis: index % 2 === 0 ? "strength" : "accessory",
      durationMinutes: config.sessionMinutes
    }))
  };
}

