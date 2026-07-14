## Context

WeClaw supports Codex app-server and retains a Codex thread per WeChat conversation. In `v0.7.1`, however, it sends `sandbox: "danger-full-access"` on `thread/start` and `{ "type": "dangerFullAccess" }` on every `turn/start`. Using it directly would give chat-originated prompts unrestricted local write access. Its CLI mode can be sandboxed but loses multi-turn context because each message starts a new `codex exec` process.

## Decisions

### Keep ACP and interpose a protocol guard

The configured command is an executable named `codex`, so WeClaw selects its Codex app-server protocol. That executable launches the real Codex CLI and rewrites client JSON-RPC before forwarding it. Only `initialize`, `initialized`, `thread/start`, and `turn/start` are accepted.

### Force a fixed read-only boundary

The proxy forces the existing Investment Coach workspace as `cwd` and `runtimeWorkspaceRoots`, removes named permissions, disables environments, sets approvals to `never`, and replaces all sandbox requests with read-only policy and no shell network. Threads are ephemeral so WeChat conversations do not appear as durable Codex tasks.

### Preserve existing WeClaw configuration

Configuration uses a lock plus atomic rename. Existing top-level settings and agents are preserved; only `default_agent`, `save_dir`, and `agents.investment-coach` are updated. No credentials are printed.

### Separate setup from user-controlled lifecycle

Install, configure, and doctor never log in or start the bridge. QR login and foreground/background lifecycle commands remain explicit user actions.

## Risks

- WeClaw is a third-party transport and has no sender allowlist in the pinned release. Documentation therefore limits this setup to a private account and treats all messages and attachments as untrusted.
- Read-only Codex still consumes model quota and can access public research tools. Workspace rules prohibit reading or disclosing other local data.
- Upgrading WeClaw may change its app-server methods. The proxy fails closed on unknown methods, and the pinned version plus doctor check prevents silent drift.

## Rollback

Stop WeClaw, remove `agents.investment-coach` from `~/.weclaw/config.json`, and delete the channel scripts, proxy, template, and package commands. Lark profiles and Mo Coach remain unchanged.
