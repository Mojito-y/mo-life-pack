## Context

`lark-channel-bridge` 原生支持多 profile，但当前项目 wrapper 只管理 `lark-agent-bridge.config.json` 选中的一个 profile；再次运行 setup 会覆盖本地默认选择。catalog 的 `bridgePrompt` 也是安装元数据，并未进入 bridge 运行时 prompt。Codex profile 默认忽略 workspace rules，因此单纯新增 catalog 项不能可靠形成独立投资教练。

## Decisions

### 累加安装与默认 setup 分离

保留 setup 的“选择一个默认 Agent”语义，新增 `agent:add` 用于已有安装。它合并 `installedAgents`、保留 `selectedAgent`、安装目标 skill、创建缺失配置，但不触碰 `lark-agent-bridge.config.json`，也不启动 bridge。

### 通过 agent id 管理指定 profile

现有 `npm run bridge:*` 命令接受可选 agent id。无参数时保持旧行为；带 `investment-coach` 时，从 catalog 解析 profile 与独立 workspace。

### Skill 加专属 workspace rules

投资行为边界主要放在强触发的 `$investment-coach` skill。专属 workspace 的 `AGENTS.md` 负责让简短投资问题也稳定进入该 skill。扫码后由显式配置命令只将对应 profile 的 `codex.ignoreRules` 设为 false，并更新默认 workspace；写入采用原子替换且不打印 secret。

### 风险参数不设伪默认值

最大回撤、单一持仓上限、行业上限和再平衡带宽默认 `null`。涉及个性化配置时先收集目标、期限、流动性、已有敞口和风险承受力。

## Rollback

移除 investment catalog/skill/template、named-profile 参数和两个 agent 管理脚本即可；无参数 bridge 命令和现有 `mo-coach` profile 不受影响。已经创建的 bridge profile 由用户用 `profile remove` 单独归档。
