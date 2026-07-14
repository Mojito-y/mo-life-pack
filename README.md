# Mo Life Pack

一个可以直接安装的「AI in daily life」工具包，通过 `lark-channel-bridge` 接入飞书 / Lark PersonalAgent，也可以通过 WeClaw 把现有 Investment Coach 接到微信。安装第一步会选择要启用的 agent。

当前内置：

- **Mo Coach / AI 健身教练**：根据目标、器械、训练时间和反馈生成计划，并通过飞书做打卡与复盘。
- **Industry DD Agent / 行业项目初筛 DD Agent**：面向 FA、投资人、行业研究或项目筛选；按行业自定义关键词条，把 BP、访谈记录和项目材料生成带证据的初筛 DD 卡。
- **Investment Coach / 投资教练**：面向 A 股与美股个人投资者，做个股研究、ETF/资产配置、持仓复盘和交易纪律；默认是毒舌支配型教练，不执行交易、不承诺收益。

## 新手一条命令安装

前置条件：本机需要有 Node.js 和 git。`lark-channel-bridge` 需要 Node.js 22 LTS 或更新版本；如果使用 Node.js 21.x，启动 bridge 时会因为依赖缺少 `node:util.styleText` 而失败。

不需要安装 pnpm，也不需要执行 `corepack enable`。安装和日常命令默认使用 Node.js 自带的 `npm`。

### macOS / Linux

复制下面这一行到终端执行即可：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```


这条命令会自动完成：

- 下载或更新本仓库到 `~/mo-life-pack`
- 安装项目依赖
- 第一步选择要安装的 agent，并展示中文说明
- 按选择引导设置 Mo Coach、Industry DD Agent 或 Investment Coach
- 安装对应 Codex skill
- 生成 `lark-agent-bridge.config.json`
- 安装项目依赖里的 `lark-channel-bridge`

安装完成后，进入目录启动飞书机器人向导：

```bash
cd ~/mo-life-pack
npm run bridge:run
```

`bridge:run` 是前台模式，适合第一次扫码绑定和调试。第一次运行会显示二维码。用飞书 / Lark 扫码后，按向导创建或绑定 PersonalAgent。profile 会根据所选 agent 自动生成，例如默认 Mo Coach 会使用：

```text
profile: mo-coach
agent: codex
workspace: ~/mo-life-pack
```

如果要静默安装 Industry DD Agent，可以指定：

```bash
MO_LIFE_PACK_AGENT=industry-dd-agent MO_LIFE_PACK_ASSUME_DEFAULTS=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

静默安装 Investment Coach：

```bash
MO_LIFE_PACK_AGENT=investment-coach MO_LIFE_PACK_ASSUME_DEFAULTS=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

确认飞书里能正常和 bot 收发消息后，可以按 `Ctrl-C` 停掉前台进程，再切到后台常驻：

```bash
npm run bridge:start
npm run bridge:status
```

## 常用命令

检查基础安装：

```bash
npm run doctor
```

检查 bridge 是否可用：

```bash
npm run bridge:doctor
```

首次前台启动和扫码绑定：

```bash
npm run bridge:run
```

确认能收发消息后，后台启动：

```bash
npm run bridge:start
```

查看后台状态：

```bash
npm run bridge:status
```

停止后台服务：

```bash
npm run bridge:stop
```

命令末尾可以加 agent id，管理指定 profile：

```bash
npm run bridge:run -- mo-coach
npm run bridge:start -- mo-coach
npm run bridge:status -- mo-coach
npm run bridge:stop -- mo-coach

npm run bridge:run -- investment-coach
npm run bridge:start -- investment-coach
npm run bridge:status -- investment-coach
npm run bridge:stop -- investment-coach
```

## 在现有安装中增加第二个 Agent

不要重新运行 `npm run setup`，因为 setup 表示重新选择默认 Agent。使用累加安装命令可以保留当前 `mo-coach` 和现有 bridge 配置：

```bash
npm run agent:add -- investment-coach
npm run bridge:run -- investment-coach
```

第二条命令会为 `investment-coach` 创建独立 profile，并显示二维码。请绑定另一个 PersonalAgent；不同 profile 不要复用同一个 App ID。

确认前台能连接后，按 `Ctrl-C` 停止。再启用该 profile 的专属规则并后台启动：

```bash
npm run agent:configure-profile -- investment-coach
npm run bridge:start -- investment-coach
npm run bridge:status -- investment-coach
```

`agent:configure-profile` 只修改指定 profile 的默认工作区和 Codex rules 开关，不启动服务，也不会输出或替换 App Secret。执行它时应保持该 profile 已停止。

## 同一个 Agent 运行多个实例

第二个 Investment Coach 使用独立 profile 名称，例如 `investment-coach-2`。首次绑定、配置和后续生命周期命令都同时指定 agent id 与 profile：

```bash
npm run bridge:run -- investment-coach --profile investment-coach-2
npm run agent:configure-profile -- investment-coach --profile investment-coach-2
npm run bridge:start -- investment-coach --profile investment-coach-2
npm run bridge:status -- investment-coach --profile investment-coach-2
npm run bridge:stop -- investment-coach --profile investment-coach-2
```

目录升级后如果旧实例提示 `工作目录不存在或不可访问`，先停止该实例，再运行对应的 `agent:configure-profile`。该命令会同时迁移 profile 默认工作区和旧会话的 `cwdRealpath`，然后再启动实例。前台 `bridge:run` 正在运行时请在原终端按 `Ctrl-C` 停止，不要直接改配置。

## 微信 ClawBot：复用 Investment Coach 与 Codex

微信通道使用 [WeClaw](https://github.com/fastclaw-ai/weclaw) `v0.7.1`，不需要新的模型 API Key，直接复用本机 Codex CLI 的登录态、默认模型以及 `agents/investment-coach/workspace/AGENTS.md` 人设。先安装并生成配置：

```bash
npm run wechat:install
npm run wechat:configure
npm run wechat:doctor
```

上述三条命令不会扫码、不会启动微信监听。首次绑定由用户手动执行：

```bash
npm run wechat:login
npm run wechat:run
```

`wechat:run` 是前台调试模式，按 `Ctrl-C` 退出。确认消息正常后再手动切到后台：

```bash
npm run wechat:start
npm run wechat:status
npm run wechat:stop
```

配置会合并写入 `~/.weclaw/config.json`，保留其中已有的其他 agent，并新增默认 agent `investment-coach`；微信里也可以用 `/invest` 或 `/coach` 切换回来。WeClaw 的 Codex app-server 原始实现会请求全磁盘写权限，本项目通过 `agents/investment-coach/bin/codex` 安全代理强制改为只读、固定工作目录、禁止 shell 网络，并保留同一微信会话内的多轮上下文。微信消息和附件一律按不可信输入处理；这个绑定只适合私人账号，不要暴露给陌生人或公开群聊。

## Mo Coach 能做什么

Mo Coach 支持：

- 改教练名字，比如「Mo Coach」「小莫教练」「减脂搭子」
- 自定义教练风格，比如温柔、严格、简洁、鼓励型、科学派
- 多种训练目标：减脂、增肌、力量、体能、灵活性、恢复、综合健康
- 按器械、时间、训练日程和身体限制生成训练计划
- 内置碳循环饮食策略：把高碳日绑定大肌群/高强度训练，把低碳日绑定休息或恢复日，并给出蛋白质、主食时机和饮水建议
- 在飞书里通过 PersonalAgent 做打卡、提醒、问答和周计划更新

## Industry DD Agent 能做什么

Industry DD Agent 支持：

- 按行业 profile 定义“看项目最重要的词条”
- 每个词条可配置别名、字段解释、证据要求、红旗项、建议追问和专家画像
- 将 BP、访谈记录、官网摘录或飞书消息整理成项目初筛 DD 卡
- 区分 `supported`、`unsupported`、`unknown`，避免把没有证据的内容写成确定结论
- 生成飞书短摘要和完整 Markdown 卡片

默认提供两个行业 profile：

- `medtech-bci`：医疗器械 / 脑机接口
- `ai-saas`：AI SaaS

本地试跑：

```bash
npm run dd:screen -- industry-dd.config.json ai-saas agents/industry-dd/examples/ai-saas-input.txt
```

校验行业 profile：

```bash
npm run dd:profile -- validate agents/industry-dd/profiles/ai-saas.json
```

新增行业 profile 时，可以复制 `agents/industry-dd/profiles/ai-saas.json`，修改 `id`、`name`、`terms`、`sections` 和 `expertProfiles`。每个词条至少需要：

- `name`：词条名称
- `description`：为什么要看这个词条
- `evidenceRequired`：判断该词条需要什么证据

Profile schema 可参考 `agents/industry-dd/templates/industry-profile.schema.json`。

## Investment Coach 能做什么

Investment Coach 支持：

- A 股与美股个股的商业模式、财务质量、估值情景、催化剂与反方论证
- ETF 的指数暴露、费率、跟踪、流动性、币种和持仓重叠比较
- 按目标、期限、流动性和风险承受力设计资产配置与再平衡规则
- 持仓收益归因、集中度、行业/地域/币种暴露和投资逻辑复盘
- 交易前决策卡、失效条件、冷静期和下一次复核日期

默认语气是毒舌支配型：会用短指令和一句尖锐点评拆穿追涨、偷懒与自欺，但只针对行为和逻辑，不攻击人格、智力、外貌、财富或处境。说“严肃模式”或“正常模式”可立即关闭毒舌，说“毒舌模式”或“教练模式”可恢复。遇到正在使用或准备使用杠杆、强平、重大亏损、生活资金压力、疑似非公开信息或法律税务问题时会自动切换严肃模式，风险解除前不能强行恢复毒舌。

关键数字必须带来源、时间、币种和口径；无法核验当前行情时会明确标记为未验证。教练不会登录券商、接收验证码或代替用户下单，疑似重大非公开信息会直接触发停止规则。

## 生成的配置

安装会生成这些本地文件：

```text
agent.config.json
coach.config.json
industry-dd.config.json
investment-coach.config.json
lark-agent-bridge.config.json
.env.local
```

`lark-agent-bridge.config.json` 默认内容会指向：

```text
bridge command: lark-channel-bridge
bridge package: lark-channel-bridge
profile: 所选 agent 的 profile，例如 mo-coach、industry-dd-agent 或 investment-coach
agent: codex
workspace: 当前安装目录
```

如果你的机器上 bridge 命令不在 PATH，可以在 `.env.local` 改：
默认情况下不需要改，安装器会使用本项目里的：

```text
./node_modules/.bin/lark-channel-bridge
```

如果你想改成自己的 bridge 命令，可以在 `.env.local` 写：

```text
LARK_CHANNEL_BRIDGE_COMMAND=/your/path/lark-channel-bridge
```

如果 bridge 报 `未找到本地 Codex CLI` 或 `agent-binary-not-executable`，macOS ChatGPT App 常见路径是：

```text
/Applications/ChatGPT.app/Contents/Resources/codex
```

安装向导会优先检测 PATH 里的 `codex`，再检测 ChatGPT/Codex App 内置路径；如果 `.env.local` 里已有不可执行的旧路径，会在下次 `bridge:doctor` 或 `bridge:run` 前自动修正。如果你的 Codex CLI 在别的位置，可以在 `.env.local` 写：

```text
LARK_CHANNEL_CODEX_BIN=/your/path/codex
```

## 安装卡住排查

### 安装卡住

如果一条命令长时间没有进展，通常卡在访问 GitHub，而不是 Mo Life Pack 本身。可以先单独运行：

```bash
git ls-remote https://github.com/Mojito-y/mo-life-pack.git HEAD
```

如果这条命令也卡住或报 `443`，请先切换网络 / 代理 / VPN 后重新执行安装命令。

安装脚本也会在 `git clone` 前做这项检查，并明确提示卡住的位置。

## 静默默认安装

如果你希望完全静默地使用默认配置：

```bash
MO_LIFE_PACK_ASSUME_DEFAULTS=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

指定默认安装的 agent：

```bash
MO_LIFE_PACK_AGENT=industry-dd-agent MO_LIFE_PACK_ASSUME_DEFAULTS=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

将 `industry-dd-agent` 换成 `investment-coach` 即可静默选择投资教练。

## 自定义安装目录

如果你不想安装到 `~/mo-life-pack`：

```bash
MO_LIFE_PACK_DIR="$HOME/Tools/mo-life-pack" bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

## 开发者手动安装

```bash
git clone https://github.com/Mojito-y/mo-life-pack.git
cd mo-life-pack
npm install
npm run setup
npm run bridge:run
```

## 仓库结构

```text
mo-life-pack/
├── install.sh                                  # 新手一条命令入口
├── agents/industry-dd/                         # Industry DD Agent 的 profile、示例和配置模板
├── skills/mo-coach/                            # Codex skill
├── skills/industry-dd-agent/                   # 行业项目初筛 DD skill
├── skills/investment-coach/                    # A 股/美股投资教练 skill
├── agents/investment-coach/workspace/          # 投资教练 profile 专属规则
├── packages/setup-cli/                         # 初始化、检查、bridge 启动命令
├── packages/mo-coach-core/                     # 训练计划生成核心
├── packages/industry-dd-core/                  # 行业 DD profile、intake、评估和渲染核心
├── templates/lark-agent-bridge.config.example.json
├── agents/investment-coach/templates/          # 投资教练配置模板
└── templates/                                  # 通用配置模板
```
