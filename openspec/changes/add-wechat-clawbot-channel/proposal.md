# Change: Add a WeChat ClawBot channel for Investment Coach

## Why

Investment Coach currently runs through Lark only. The user needs the same Codex-backed persona and workspace in WeChat without duplicating the agent or introducing a separate model API key.

## What Changes

- Pin and install WeClaw `v0.7.1` as the WeChat transport.
- Merge an `investment-coach` ACP agent into `~/.weclaw/config.json` while preserving existing agents.
- Reuse the existing Investment Coach workspace, `AGENTS.md`, Codex login, and default model.
- Put a fail-closed proxy between WeClaw and `codex app-server` to replace WeClaw's full-access sandbox requests with read-only policy.
- Add explicit install, configure, doctor, login, foreground, background, status, and stop commands.

## Non-goals

- No changes to Mo Coach.
- No brokerage connection or trade execution.
- No automatic QR login or automatic bot startup during setup.
- No public-group or untrusted multi-user deployment.
