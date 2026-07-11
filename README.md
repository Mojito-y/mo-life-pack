# Mo Life Pack

一个可以直接安装的「AI in daily life」工具包。当前第一项能力是 **Mo Coach**：通过 `lark-channel-bridge` 接入飞书 / Lark PersonalAgent 的 AI 健身教练。

> 说明：你提到的 `zarazhangrui/lark-coding-agent-bridge` 仓库，实际发布包名和命令是 `lark-channel-bridge`。本仓库按这个真实命令接入。

## 新手一条命令安装

前置条件：本机需要有 Node.js 和 git。建议使用当前 Node.js LTS（Node 22 或更新版本），这样 `lark-channel-bridge` 可以正常运行。

不需要安装 pnpm，也不需要执行 `corepack enable`。安装和日常命令默认使用 Node.js 自带的 `npm`。

复制下面这一行到终端执行即可：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

这条命令会自动完成：

- 下载或更新本仓库到 `~/mo-life-pack`
- 安装项目依赖
- 引导设置 Mo Coach 的名字、风格、目标、器械和训练时长
- 安装 Mo Coach Codex skill
- 生成 `lark-agent-bridge.config.json`
- 安装项目依赖里的 `lark-channel-bridge`

安装完成后，进入目录启动飞书机器人向导：

```bash
cd ~/mo-life-pack
npm run bridge:run
```

第一次运行会显示二维码。用飞书 / Lark 扫码后，按向导创建或绑定 PersonalAgent。这个 profile 会使用：

```text
profile: mo-coach
agent: codex
workspace: ~/mo-life-pack
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

## Mo Coach 能做什么

Mo Coach 支持：

- 改教练名字，比如「Mo Coach」「小莫教练」「减脂搭子」
- 自定义教练风格，比如温柔、严格、简洁、鼓励型、科学派
- 多种训练目标：减脂、增肌、力量、体能、灵活性、恢复、综合健康
- 按器械、时间、训练日程和身体限制生成训练计划
- 在飞书里通过 PersonalAgent 做打卡、提醒、问答和周计划更新

## 生成的配置

安装会生成这些本地文件：

```text
coach.config.json
lark-agent-bridge.config.json
.env.local
```

`lark-agent-bridge.config.json` 默认内容会指向：

```text
bridge command: lark-channel-bridge
bridge package: lark-channel-bridge
profile: mo-coach
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

## 静默默认安装

如果你希望完全静默地使用默认配置：

```bash
MO_LIFE_PACK_ASSUME_DEFAULTS=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
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
├── skills/mo-coach/                            # Codex skill
├── packages/setup-cli/                         # 初始化、检查、bridge 启动命令
├── packages/mo-coach-core/                     # 训练计划生成核心
├── templates/lark-agent-bridge.config.example.json
└── templates/                                  # 配置模板
```
