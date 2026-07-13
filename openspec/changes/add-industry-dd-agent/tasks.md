## 1. 能力包与安装入口

- [x] 1.1 新增 agent catalog，包含 Mo Coach 和行业 DD Agent 的 id、中文名称、中文说明、配置模板、skill 路径和 bridge prompt
- [x] 1.2 调整 `npm run setup`，在交互式安装第一步展示 agent 选择列表和中文介绍
- [x] 1.3 支持 `MO_LIFE_PACK_AGENT` 指定静默安装目标，并在未指定时保持 `MO_LIFE_PACK_ASSUME_DEFAULTS=1` 默认安装 Mo Coach
- [x] 1.4 新增行业 DD Agent 的 skill/package 目录，保持与现有 Mo Coach 能力解耦
- [x] 1.5 为飞书机器人增加显式 DD 命令或触发入口，支持创建新项目 intake
- [x] 1.6 增加本地项目工作区目录，用于保存 intake 元数据、抽取文本和生成卡片

## 2. 行业 Profile

- [x] 2.1 定义行业 profile schema，覆盖行业名称、关键词条、术语别名、字段说明、证据要求、红旗项、建议追问、评分维度和输出章节
- [x] 2.2 实现行业 profile 加载与校验，缺少必要字段时返回中文错误
- [x] 2.3 提供医疗器械/脑机接口默认示例 profile，但确保核心逻辑不硬编码该行业字段
- [x] 2.4 增加用户自定义 profile 的创建或编辑入口

## 3. 材料接入与证据抽取

- [x] 3.1 实现粘贴文本和飞书消息文本的 intake 解析
- [x] 3.2 实现上传文件或文件引用的占位处理，记录文件名、来源和解析状态
- [x] 3.3 围绕选定行业 profile 的词条实现证据抽取结构，区分事实、推断、unknown 和 unsupported 字段
- [x] 3.4 在抽取失败或材料不足时生成可读的缺口说明

## 4. 行业词条评估逻辑

- [x] 4.1 实现按 profile 词条生成初筛结论、红旗项和信心程度的逻辑
- [x] 4.2 实现按 profile 证据要求生成补充材料清单
- [x] 4.3 实现按 profile 专家画像生成专家访谈建议和追问问题
- [x] 4.4 验证自定义行业 profile 不会输出医疗器械/脑机接口专属字段

## 5. 输出与飞书体验

- [x] 5.1 实现飞书短摘要输出，包含初步评分、Top 风险和下一步动作
- [x] 5.2 实现完整 Markdown 初筛 DD 卡渲染
- [x] 5.3 在完整卡片中展示行业 profile 名称、词条证据引用、不确定性说明和 unsupported 项
- [x] 5.4 补充 README 或 skill README，说明安装选择、行业 profile 自定义方式、输入示例和边界声明

## 6. 验证

- [x] 6.1 增加安装向导测试或脚本样例，验证交互式选择和 `MO_LIFE_PACK_AGENT` 静默选择
- [x] 6.2 增加 profile 校验测试，验证缺少必要词条字段时会失败
- [x] 6.3 增加单元测试或脚本样例，验证不完整材料不会触发编造字段
- [x] 6.4 增加样例项目输入，覆盖医疗器械/脑机接口默认 profile 和至少一个自定义行业 profile
- [x] 6.5 验证 OpenSpec 状态为 apply-ready
