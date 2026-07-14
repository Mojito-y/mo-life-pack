## ADDED Requirements

### Requirement: Reuse the existing Investment Coach

The WeChat channel SHALL use the existing Investment Coach workspace rules and the local Codex CLI login and default model.

#### Scenario: Configure the channel

- **WHEN** the user runs `npm run wechat:configure`
- **THEN** `~/.weclaw/config.json` contains an `investment-coach` ACP agent whose cwd is the existing Investment Coach workspace
- **AND** existing WeClaw agents remain present
- **AND** no login or bridge process is started

### Requirement: Enforce read-only Codex access

All WeClaw Codex app-server requests SHALL pass through the project safety proxy.

#### Scenario: WeClaw requests full access

- **WHEN** WeClaw sends full-access sandbox values on thread or turn creation
- **THEN** the proxy replaces them with read-only values
- **AND** fixes the cwd to the Investment Coach workspace
- **AND** rejects unknown client methods

### Requirement: Keep lifecycle user-controlled

QR login and bot start SHALL require explicit lifecycle commands.

#### Scenario: Install and diagnose

- **WHEN** the user runs install, configure, or doctor
- **THEN** the command does not scan a QR code
- **AND** does not start or stop a WeChat listener

### Requirement: Detect version and configuration drift

The doctor command SHALL verify the pinned WeClaw version, real Codex executable, proxy self-test, workspace, configuration, and account presence without exposing credentials.
