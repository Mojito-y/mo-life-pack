---
name: mo-coach
description: Generate personalized fitness coaching plans and coach-style outputs. Use when a user wants to rename the coach, define a coaching personality or tone, choose fitness goals such as fat loss, muscle gain, strength, conditioning, mobility, recovery, or general fitness, or build/update a plan from equipment, time, schedule, and constraints. Also use for Feishu/Lark coaching flows tied to Mo Coach.
---

# Mo Coach

## Core flow

1. Read the user's coach name, style, primary goal(s), available equipment, weekly schedule, session length, and constraints.
2. Normalize missing fields with the defaults in `coach.config.example.json` or the active config.
3. Build a plan that matches the primary goal first, then adapts volume, conditioning, and mobility to the available time and equipment.
4. Keep the voice aligned to the requested style.
5. Use `scripts/generate_plan.js` for a deterministic JSON plan when you need a reusable output shape.

## Goal handling

Pick one primary goal, then blend the rest lightly:

- `fat_loss`: strength retention plus conditioning
- `muscle_gain`: hypertrophy and progressive overload
- `strength`: heavy compounds and lower fatigue
- `conditioning`: work capacity and intervals
- `mobility`: joint range, control, and tissue prep
- `recovery`: deload, restoration, and sleep-friendly work
- `general_fitness`: balanced full-body development

## Output rules

- Keep plans realistic for the user's time budget.
- Prefer the smallest effective program over a fancy one.
- State warm-up, main work, accessory work, and recovery notes.
- Adjust exercise choice to the listed equipment.
- When the user mentions pain, injury, or medical limits, reduce load and point them to professional care as needed.

## References

- `references/coaching-model.md`: goal-to-plan mapping
- `references/safety-boundaries.md`: safety and escalation rules
- `references/lark-workflows.md`: Feishu/Lark handoff formats

## Bundled script

- `scripts/generate_plan.js`: deterministic plan generator for a config file or JSON input

