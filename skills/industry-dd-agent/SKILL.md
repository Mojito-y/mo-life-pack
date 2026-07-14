---
name: industry-dd-agent
description: 用于一级市场 FA、投资人、行业研究或项目筛选场景。根据用户选择或自定义的行业 profile，把 BP、访谈记录、官网摘录、论文专利线索和飞书消息整理成带证据的项目初筛 DD 卡。
---

# Industry DD Agent

当用户在飞书或 Codex 中提到项目初筛、DD、FA、投资项目、行业词条、BP review、尽调卡片、红旗项、补充材料清单时，使用本 skill。

## 触发方式

- 用户可以发送 `/dd`、`/dd review`、`项目初筛`、`帮我看这个项目` 等表达来触发。
- 如果用户指定行业 profile，例如 `profile=ai-saas` 或 `用 AI SaaS 模板看一下`，优先使用该 profile。
- 如果用户没有指定 profile，使用 `industry-dd.config.json` 中的 `defaultProfile`，默认是 `medtech-bci`。
- 如果用户想新增行业模板，引导他定义关键词条、证据要求、红旗项和追问问题。

## 工作流

1. 确认行业 profile。
2. 收集用户提交的文字、文件名、链接和补充说明。
3. 围绕 profile 中的词条抽取证据。
4. 对每个词条输出状态：`supported`、`unsupported` 或 `unknown`。
5. 生成飞书短摘要：初步评分、Top 风险、下一步动作。
6. 生成完整 DD 卡：行业 profile、词条证据、推断、不确定项、缺失材料和专家访谈建议。

## 输出边界

- 所有专业判断都必须表达为初筛假设，不能写成最终投资、法律、医学、监管或财务结论。
- 材料里没有证据的字段必须标记为 `unknown` 或 `unsupported`，不能编造。
- 自定义行业 profile 只按用户定义的词条输出，不要硬编码医疗器械/脑机接口字段。
- 如果资料不足，优先输出补充材料清单和追问问题。

## 本地能力

可使用项目内核心包：

```bash
npm run dd:screen -- industry-dd.config.json ai-saas agents/industry-dd/examples/ai-saas-input.txt
```

该命令会按指定 profile 生成短摘要，并在本地工作区生成 Markdown 初筛卡。
