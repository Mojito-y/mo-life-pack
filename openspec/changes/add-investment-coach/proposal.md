## Why

现有 Mo Coach 与 Industry DD Agent 都不能覆盖个人二级市场投资中的连续决策：个股研究、ETF 配置、持仓复盘和交易纪律需要共享同一套数据新鲜度、证据和风险预算规则。用户还需要在保留 `mo-coach` 的同时绑定另一个 PersonalAgent，因此不能复用会覆盖默认配置的单选 setup 路径。

## What Changes

- 新增独立的 `investment-coach` skill、配置模板和专属 workspace。
- 覆盖 A 股与美股个股、ETF/资产配置、组合复盘和交易纪律。
- 强制区分事实、计算、假设、判断和未知，并对当前数据设置本轮验证门禁。
- 新增非破坏性的 `agent:add`，累加安装 skill/config 而不覆盖现有 profile。
- bridge run/start/status/stop 支持通过 agent id 指定 profile。
- 新增 profile 配置步骤，使投资教练专属 workspace rules 真正对 Codex 生效。

## Non-Goals

- 不实现券商登录、交易 API、自动下单或收益承诺。
- 不内置实时行情源，也不在缺少数据时伪造当前价格。
- 不预设个人仓位上限、最大回撤或再平衡带宽。
