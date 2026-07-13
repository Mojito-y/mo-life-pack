## ADDED Requirements

### Requirement: 一键安装时选择 Agent
系统 SHALL 在交互式一键安装流程的第一步让用户选择要安装的 agent，并展示中文说明。

#### Scenario: 用户交互式安装
- **WHEN** 用户运行一键安装命令且未启用静默默认安装
- **THEN** 系统 SHALL 展示可安装 agent 列表，至少包含 Mo Coach 和行业 DD Agent 的中文名称、适用场景和能力简介

#### Scenario: 用户选择行业 DD Agent
- **WHEN** 用户在安装向导中选择行业 DD Agent
- **THEN** 系统 SHALL 生成 DD Agent 对应配置、安装对应 skill，并生成适合该 agent 的 bridge prompt

#### Scenario: 用户静默默认安装
- **WHEN** 用户设置 `MO_LIFE_PACK_ASSUME_DEFAULTS=1` 且未指定 agent
- **THEN** 系统 SHALL 默认安装 Mo Coach，以保持既有一键安装行为兼容

#### Scenario: 用户通过环境变量指定 agent
- **WHEN** 用户设置 `MO_LIFE_PACK_AGENT=industry-dd-agent`
- **THEN** 系统 SHALL 跳过交互选择并安装行业 DD Agent

### Requirement: 行业 Profile 配置
系统 SHALL 支持通过行业 profile 定义不同行业项目初筛时的重要词条和输出结构。

#### Scenario: 使用默认行业 profile
- **WHEN** 用户未提供自定义行业 profile
- **THEN** 系统 SHALL 至少提供一个医疗器械/脑机接口示例 profile，并允许用户基于该 profile 生成初筛卡

#### Scenario: 用户新增行业 profile
- **WHEN** 用户创建一个新的行业 profile
- **THEN** 系统 SHALL 允许用户定义行业名称、关键词条、术语别名、字段说明、证据要求、红旗项、建议追问、评分维度和输出章节

#### Scenario: 行业 profile 缺少必要字段
- **WHEN** 用户提交的行业 profile 缺少关键词条名称、字段说明或证据要求
- **THEN** 系统 SHALL 拒绝使用该 profile，并返回中文校验错误和修复建议

### Requirement: 项目材料接入
系统 SHALL 支持从飞书机器人消息、粘贴文本、上传文档和可访问链接中接收项目材料。

#### Scenario: 用户提交项目 BP 和访谈记录
- **WHEN** 用户向 DD Agent 发送 BP 文件和粘贴的访谈记录
- **THEN** 系统 SHALL 创建项目 intake 记录，包含来源名称、文本抽取状态和抽取失败信息

#### Scenario: 用户只提交不完整材料
- **WHEN** 用户只提交一段简短公司介绍
- **THEN** 系统 SHALL 仍然生成初筛结果，并将缺少证据的字段标记为 unknown，而不是编造信息

### Requirement: 按行业词条生成初筛 DD 卡
系统 SHALL 根据选定行业 profile 生成简洁、结构化的项目初筛 DD 卡。

#### Scenario: 生成完整初筛卡
- **WHEN** 项目 intake 处理完成且已选择行业 profile
- **THEN** 系统 SHALL 按 profile 定义的输出章节生成公司定位、行业关键词条判断、证据状态、关键风险、红旗项和建议下一步动作

#### Scenario: 区分事实与推断
- **WHEN** agent 根据有限材料推断某个行业词条的状态、风险或评分
- **THEN** 系统 SHALL 将该字段标注为推断，并包含信心程度或不确定性说明

#### Scenario: 行业词条无证据
- **WHEN** profile 中某个关键词条在项目材料里没有证据
- **THEN** 系统 SHALL 将该词条标记为 unknown 或 unsupported，并生成对应补充材料请求

### Requirement: 行业词条评估
系统 SHALL 使用行业 profile 中定义的词条、红旗项、证据要求和评分维度进行评估。

#### Scenario: 评估医疗器械/脑机接口 profile
- **WHEN** 用户选择医疗器械/脑机接口 profile
- **THEN** 系统 SHALL 按该 profile 评估注册路径假设、临床证据、产品形态、侵入式程度、支付路径、医院采用阻力等词条

#### Scenario: 评估用户自定义 profile
- **WHEN** 用户选择自定义行业 profile
- **THEN** 系统 SHALL 只按该 profile 定义的词条和输出章节生成行业判断，不得硬编码医疗器械/脑机接口字段

### Requirement: 输出必须带证据
系统 SHALL 为初筛卡中的关键事实和判断附上证据引用。

#### Scenario: 存在来源证据
- **WHEN** agent 陈述一个基于已提交材料的关键事实
- **THEN** 系统 SHALL 标注该事实来自哪个文档、消息或链接，并在可用时提供简短支持摘录

#### Scenario: 缺少来源证据
- **WHEN** agent 无法找到某个关键判断的材料依据
- **THEN** 系统 SHALL 将该判断标记为 unsupported，并列入后续验证事项

### Requirement: 后续尽调动作
系统 SHALL 将初筛中的缺口和风险转成用户可执行的后续动作。

#### Scenario: 发现缺失材料
- **WHEN** profile 要求的关键证据在项目材料中缺失
- **THEN** 系统 SHALL 列出可以发给公司的定向补充材料清单

#### Scenario: 建议专家验证
- **WHEN** 某项风险需要外部专家验证
- **THEN** 系统 SHALL 根据行业 profile 推荐需要访谈的专家画像和应询问的问题

### Requirement: 适配飞书工作流输出
系统 SHALL 以适合飞书项目初筛工作流的格式交付 DD 结果。

#### Scenario: 用户请求快速摘要
- **WHEN** 用户在飞书机器人中请求快速 review
- **THEN** 系统 SHALL 返回包含初步评分、Top 风险和下一步动作的简洁摘要

#### Scenario: 用户请求完整卡片
- **WHEN** 用户请求完整初筛 DD 卡
- **THEN** 系统 SHALL 提供结构化文档或 Markdown 产物，便于分享给 partner、deal team 或后续材料准备流程
