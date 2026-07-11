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

function normalize(config = {}) {
  return {
    coachName: config.coachName || "Mo Coach",
    style: config.style || "calm, concise, evidence-informed",
    goals: Array.isArray(config.goals) && config.goals.length ? config.goals : ["general_fitness"],
    equipment: Array.isArray(config.equipment) ? config.equipment : [],
    weeklySchedule: Array.isArray(config.weeklySchedule) && config.weeklySchedule.length ? config.weeklySchedule : ["Mon", "Wed", "Fri"],
    sessionMinutes: Number(config.sessionMinutes || 45),
    constraints: Array.isArray(config.constraints) ? config.constraints : []
  };
}

function buildPlan(config) {
  const normalized = normalize(config);
  const primaryGoal = normalized.goals[0];
  const profile = goalProfiles[primaryGoal] || goalProfiles.general_fitness;

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
    sessions: normalized.weeklySchedule.map((day, index) => ({
      day,
      emphasis: index % 2 === 0 ? "strength" : "accessory",
      durationMinutes: normalized.sessionMinutes
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

