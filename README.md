# Mo Life Pack

一个可以直接 clone-and-run 的「AI in daily life」工具包。当前第一项能力是 **Mo Coach**：可改名、可换性格风格、可按目标和约束生成训练计划的 AI 健身教练。

## 新手一条命令安装

复制下面这一行到终端执行即可：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

这条命令会自动完成：

- 下载或更新本仓库到 `~/mo-life-pack`
- 准备 `pnpm`
- 安装项目依赖
- 引导你设置教练名称、风格、目标、器械和训练时长
- 把 `Mo Coach` 安装到本机 Codex skills 目录
- 生成 `.env.local`，后续用于连接飞书/Lark 应用

一路回车可以使用默认配置。

如果你希望完全静默地使用默认配置：

```bash
MO_LIFE_PACK_ASSUME_DEFAULTS=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

## 自定义安装目录

如果你不想安装到 `~/mo-life-pack`：

```bash
MO_LIFE_PACK_DIR="$HOME/Tools/mo-life-pack" bash -c "$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)"
```

## 安装后怎么检查

```bash
cd ~/mo-life-pack
pnpm run doctor
```

看到下面这些状态就是基础安装成功：

```text
OK skill scaffold
OK coach config template
OK env template
OK setup script
OK installed skill
```

## Mo Coach 能做什么

Mo Coach 支持：

- 改教练名字，比如「Mo Coach」「小莫教练」「减脂搭子」
- 自定义教练风格，比如温柔、严格、简洁、鼓励型、科学派
- 多种训练目标：减脂、增肌、力量、体能、灵活性、恢复、综合健康
- 按器械、时间、训练日程和身体限制生成计划
- 后续接入飞书/Lark，用机器人做打卡、提醒和周计划更新

## 开发者手动安装

如果你想自己 clone：

```bash
git clone https://github.com/Mojito-y/mo-life-pack.git
cd mo-life-pack
pnpm install
pnpm run setup
```

## 仓库结构

```text
mo-life-pack/
├── install.sh                  # 新手一条命令入口
├── skills/mo-coach/            # 可安装的 Codex skill
├── packages/setup-cli/         # 初始化和检查脚本
├── packages/mo-coach-core/     # 训练计划生成核心
├── apps/lark-bot/              # 飞书/Lark bot 起步服务
└── templates/                  # 配置模板
```

## 飞书/Lark 连接状态

当前仓库已经预留 `.env.local` 和 `apps/lark-bot`，但真实飞书应用仍需要你在飞书开放平台创建应用并填写：

```text
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_VERIFICATION_TOKEN=
FEISHU_ENCRYPT_KEY=
```

下一阶段会把飞书应用创建、事件订阅、机器人消息和交互卡片继续做成更完整的新手向流程。
