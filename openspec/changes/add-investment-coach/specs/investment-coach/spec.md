## ADDED Requirements

### Requirement: 证据驱动的投资研究

系统 SHALL 对 A 股和美股投资问题区分事实、计算、假设、判断和未知，并为时效信息标注截至时间、时区、来源与数据口径。

#### Scenario: 无法取得当前行情

- **WHEN** 用户询问当前价格或当前估值但系统无法访问可靠数据
- **THEN** 系统 SHALL 标记为未验证，不得凭记忆补造数字或据此形成确定操作结论

### Requirement: 个性化配置门禁

系统 SHALL 在给出个性化仓位、配置或风险预算前确认目标、期限、流动性、现有敞口和风险承受力。

#### Scenario: 用户要求全仓买入

- **WHEN** 用户未提供风险画像并要求全仓某一标的
- **THEN** 系统 SHALL 暂停具体仓位建议，说明集中度与最大损失，并请求关键约束

### Requirement: 人工决策与交易边界

系统 SHALL 只生成供人工复核的研究和交易计划，不得接收券商秘密信息或执行交易。

#### Scenario: 用户要求代下单

- **WHEN** 用户要求登录券商或提交订单
- **THEN** 系统 SHALL 拒绝执行，并改为提供人工核对清单

### Requirement: 非破坏性多 Agent 安装

系统 SHALL 支持在保留现有默认 Agent 和 bridge profile 的情况下累加安装 Investment Coach。

#### Scenario: 已安装 Mo Coach

- **WHEN** 用户运行 `agent:add investment-coach`
- **THEN** 系统 SHALL 合并 installedAgents、保留 selectedAgent，且不得覆盖现有 lark-agent-bridge.config.json 或启动 bridge

### Requirement: 指定 profile 生命周期

系统 SHALL 允许 run/start/status/stop 通过 agent id 管理独立 profile。

#### Scenario: 启动投资教练

- **WHEN** 用户运行 named-profile bridge 命令并指定 investment-coach
- **THEN** 系统 SHALL 使用 investment-coach profile 和专属 workspace，不影响 mo-coach profile

### Requirement: 同一 Agent 多实例迁移

系统 SHALL 支持通过 `--profile` 为同一 Agent 管理多个独立 profile，并在 workspace 目录升级时迁移目标 profile 的默认工作区和旧会话 cwd。

#### Scenario: 第二个 Investment Coach 仍引用旧目录

- **WHEN** 用户为 `investment-coach-2` 运行 profile 配置或 named-profile run/start 命令
- **THEN** 系统 SHALL 只更新 `investment-coach-2`，将 `workspaces.default` 和匹配旧目录的 `cwdRealpath` 指向当前专属 workspace，不得误改主 profile
