# Mo Life Pack

一个可以直接安装的「AI in daily life」工具包，通过 `lark-channel-bridge` 接入飞书 / Lark PersonalAgent。安装第一步会选择要启用的 agent。

当前内置：

- **Mo Coach / AI 健身教练**：根据目标、器械、训练时间和反馈生成计划，并通过飞书做打卡与复盘。
- **Industry DD Agent / 行业项目初筛 DD Agent**：面向 FA、投资人、行业研究或项目筛选；按行业自定义关键词条，把 BP、访谈记录和项目材料生成带证据的初筛 DD 卡。

## 新手一条命令安装

当前只支持 macOS / Linux，不支持 Windows 原生环境。

前置条件：本机需要有 Node.js 和 git。`lark-channel-bridge` 需要 Node.js 22 LTS 或更新版本；如果使用 Node.js 21.x，启动 bridge 时会因为依赖缺少 `node:util.styleText` 而失败。

不需要安装 pnpm，也不需要执行 `corepack enable`。安装和日常命令默认使用 Node.js 自带的 `npm`。

复制下面这一行到终端执行即可：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

这条命令会自动完成：

- 下载或更新本仓库到 `~/mo-life-pack`
- 安装项目依赖
- 第一步选择要安装的 agent，并展示中文说明
- 按选择引导设置 Mo Coach 或 Industry DD Agent
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

## 生成的配置

安装会生成这些本地文件：

```text
agent.config.json
coach.config.json
industry-dd.config.json
lark-agent-bridge.config.json
.env.local
```

`lark-agent-bridge.config.json` 默认内容会指向：

```text
bridge command: lark-channel-bridge
bridge package: lark-channel-bridge
profile: 所选 agent 的 profile，例如 mo-coach 或 industry-dd-agent
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
├── packages/setup-cli/                         # 初始化、检查、bridge 启动命令
├── packages/mo-coach-core/                     # 训练计划生成核心
├── packages/industry-dd-core/                  # 行业 DD profile、intake、评估和渲染核心
├── templates/lark-agent-bridge.config.example.json
└── templates/                                  # 配置模板
```
