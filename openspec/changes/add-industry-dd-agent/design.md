## Context

Mo Life Pack 当前核心是 Mo Coach：通过 `lark-channel-bridge` 接入飞书 / Lark PersonalAgent，把日常生活场景里的请求交给 Codex skill 处理。新的 DD Agent 应沿用这种“可安装能力包 + 飞书机器人入口”的模式，但服务对象从健身教练切换为一级市场 FA、投资人、行业研究或项目筛选用户。

原始想法聚焦医疗器械和脑机接口，但用户反馈指出：不同行业都可以有自己的重要词条，产品不应限制在单一行业。医疗器械/BCI 应保留为默认示例 profile，而不是硬编码成唯一能力边界。

这个 change 的第一阶段不做完整交易 CRM，也不做投资人匹配。它先解决一个高频且可复用的问题：让用户定义“这个行业看项目时最重要的词条是什么”，再把项目早期材料转成一张有证据、有不确定性标注、有后续动作的初筛 DD 卡。

当前安装流程仍以 Mo Coach 为唯一默认 agent：`install.sh` 会直接提示“开始初始化 Mo Coach”，`setup` 命令也只生成 `coach.config.json` 和 Mo Coach 对应的 bridge prompt。新增行业 DD Agent 后，一键安装入口必须先变成“选择 agent”，否则用户复制 README 的安装命令后会被带到错误的初始化流程。

## Goals / Non-Goals

**Goals:**

- 新增一个独立于 Mo Coach 的行业可配置 DD Agent 能力包。
- 一键安装第一步提供 agent 选择，并用中文说明每个 agent 适合解决的问题、输入方式和安装后能做什么。
- 支持行业 profile：每个 profile 定义行业名称、关键词条、术语别名、字段说明、证据要求、红旗项、评分维度、专家画像和输出章节。
- 提供医疗器械/脑机接口 profile 作为默认示例，同时允许用户新增和编辑其他行业 profile。
- 支持低摩擦输入：飞书消息、粘贴文本、文件引用、链接和简短补充说明。
- 产出结构稳定的初筛 DD 卡，明确区分事实、推断、未知项和需要验证的事项。
- MVP 阶段优先使用本地文件存储行业 profile、项目材料和生成结果，避免过早引入数据库。

**Non-Goals:**

- 不提供投资建议、估值建议、法律建议、医学建议、监管结论或任何行业的最终专业结论。
- 本 change 不实现投资人匹配、CRM 跟进、专家网络图谱、竞品数据库等后续玩法。
- MVP 不依赖生产级数据库、向量数据库或付费市场数据源。
- 不默认抓取用户未主动提交的私有飞书内容。
- 不在本阶段支持一次安装多个 agent；先保证单选路径稳定，后续再扩展多选或插件市场式安装。

## Decisions

### Decision 1: 作为独立能力包实现

DD Agent 应作为新的 skill/package，而不是塞进 Mo Coach。这样可以复用现有 bridge、安装器和 skill 模式，同时保持健身教练与项目尽调工作流在角色、配置和安全边界上的独立性。

备选方案是直接在 Mo Coach 里增加命令。这个方案初期更快，但会混淆两个完全不同的 persona 和工作流。

### Decision 2: 引入 agent catalog 驱动安装选择

安装器应维护一个轻量 agent catalog，至少包含 agent id、中文名称、中文介绍、适用人群、默认配置模板、skill 路径和 bridge prompt。`install.sh` 仍负责下载仓库和安装依赖，进入 `npm run setup` 后第一步展示中文列表，由用户选择 `mo-coach` 或 `industry-dd-agent`。

静默安装时使用环境变量指定 agent，例如 `MO_LIFE_PACK_AGENT=mo-coach` 或 `MO_LIFE_PACK_AGENT=industry-dd-agent`；如果只设置 `MO_LIFE_PACK_ASSUME_DEFAULTS=1`，默认继续安装 Mo Coach，保证旧的一键安装行为不被破坏。

备选方案是提供两条不同 curl 安装命令。这样 README 会更分裂，也不利于后续继续增加生活/工作 agent。

### Decision 3: 用行业 profile 表达“重要词条”

行业判断逻辑不应写死在代码里。MVP 使用 JSON 或 Markdown front matter 定义行业 profile，建议结构包括：

- `id`：行业 profile 标识，例如 `medtech-bci`、`ai-saas`、`semiconductor`。
- `name`：中文名称。
- `description`：适用范围。
- `terms`：关键评估词条，每个词条包含名称、解释、别名、为什么重要、需要的证据、常见红旗、建议追问。
- `sections`：初筛卡输出章节。
- `scoring`：可选评分或分级方式。
- `expertProfiles`：建议访谈的专家类型。

备选方案是为每个行业写一个独立 agent。这个方案短期看起来清晰，但会快速造成重复实现，也不利于用户自己维护行业知识。

### Decision 4: 使用分阶段流水线

实现分为五段：

1. Profile selection：选择或创建行业 profile。
2. Intake：收集文件、消息、链接和用户补充信息，生成项目记录。
3. Evidence extraction：围绕 profile 词条抽取关键事实、来源引用、不支持字段和不确定假设。
4. Industry assessment：按 profile 的词条、红旗和评分维度生成初筛判断。
5. Rendering：输出飞书短摘要和完整 Markdown 初筛卡。

备选方案是用一个大 prompt 从原始材料直接生成最终卡片。分阶段流水线更利于测试，也更容易展示证据来源，降低“看起来很确定但其实没证据”的风险。

### Decision 5: 专业判断一律按“初筛假设”处理

不同行业的专业词条可能涉及监管、技术、财务、供应链、商业化或合规判断。除非材料中存在直接证据，否则 agent 必须标注为假设，并附上信心程度、依据和验证动作。

备选方案是让每个行业 profile 直接给出确定结论。这样会显著增加误导风险，也不符合 FA 初筛阶段的使用边界。

### Decision 6: 同时输出短摘要和完整卡片

飞书机器人回复应足够短，便于 FA 或 partner 快速判断；完整卡片则使用 Markdown，方便复制到飞书文档、Base 记录或后续材料里。

备选方案是只生成文档。但这样会损失飞书 PersonalAgent 的即时对话优势。

### Decision 7: MVP 采用本地文件持久化

MVP 阶段将行业 profile、项目 intake 元数据和生成卡片存到本地 workspace。这样贴合当前仓库的轻量结构，也方便先验证工作流价值。

备选方案是立刻接数据库或飞书 Base。等后续扩展到多项目流水线、投资人反馈、CRM 状态时，再引入会更合理。

## Risks / Trade-offs

- [Risk] 用户自定义词条过宽或过窄，导致输出不稳定。 -> Mitigation: 提供 profile 模板、字段示例和 profile 校验，要求每个词条至少包含解释、证据要求和追问问题。
- [Risk] agent 可能根据有限材料过度判断专业结论。 -> Mitigation: 对所有专业判断强制输出不确定性、证据引用和验证任务。
- [Risk] 项目材料可能包含公司机密。 -> Mitigation: 本地存储路径明确，不做不必要外部同步，并在文档中提醒用户只提交有权处理的资料。
- [Risk] 不同行业术语跨度大，一个通用引擎可能不够细。 -> Mitigation: 将行业差异放进 profile，代码只提供通用 intake、证据、评估和渲染框架。
- [Risk] 飞书文件解析能力受 bridge 和文件格式影响。 -> Mitigation: 记录解析失败原因，并允许用户用粘贴文本补充同一个项目。
- [Risk] 短摘要可能隐藏 partner 判断需要的细节。 -> Mitigation: 始终提供完整卡片，包含证据、推断、红旗和后续问题。
- [Risk] 安装流程从单 agent 变成选择式后可能增加新手理解成本。 -> Mitigation: 第一屏使用中文短说明，默认选项清晰，并保留静默安装默认 Mo Coach 的兼容路径。

## Migration Plan

1. 新增 agent catalog，并将 Mo Coach 迁移为 catalog 中的默认选项。
2. 新增行业 DD Agent 能力，不修改 Mo Coach 现有行为。
3. 调整 setup 向导，使一键安装第一步选择 agent，并按选择生成对应配置。
4. 新增行业 profile 目录和 schema，先提供医疗器械/脑机接口示例 profile。
5. 实现显式 DD 命令、本地项目存储和 Markdown 卡片输出。
6. 增加测试，覆盖安装选择、profile 校验、词条抽取、未知项处理、证据标注和短摘要渲染。
7. 在 README 或独立 skill README 中补充安装、profile 自定义和使用说明。
8. 如需回滚，只移除新增 DD package/skill、agent catalog 入口和命令接线；Mo Coach 默认路径保留。

## Open Questions

- 行业 profile 第一版使用 JSON、YAML 还是 Markdown front matter 更方便用户维护？
- 第一版必须支持哪些文件类型：PDF、PPTX、DOCX、图片，还是先支持粘贴文本？
- 完整初筛卡应先生成本地 Markdown，还是直接创建飞书文档？
- FA 更偏好的评分方式是什么：pass/watch/reject、数字评分，还是按行业 profile 自定义？
- 项目材料生成卡片后应自动删除，还是保留用于后续迭代和追问？
- 安装向导第一版是否只支持单选 agent，还是允许一次安装多个 agent？
