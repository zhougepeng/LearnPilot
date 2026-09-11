---
description: "作业领域模型和保守的老师群消息解析器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-education-homework

[English](README.md) | 中文

这个领域包定义 `HomeworkImport`、`HomeworkTask` 和解析结果类型，并提供 `parseHomeworkMessage()`。解析器识别英语、语文、历史、数学、生物和地理，拆分独立任务，标记周六复习、家长协助、家长签字和缺失信息；带编号的数学作业逐行拆分，改错与给家长讲解等并列动作也会拆成独立任务，成绩说明等背景通知不会被当作任务；原文缺失的群消息内容不会被补全。

## 模型体验

### 应用领域解析器

#### 模型看到的内容

无。本领域库不注册模型工具、提示词段落，也不发起模型请求；`parseHomeworkMessage()` 只返回应用数据。

#### Token 影响

无。解析结果留在应用领域内，本包不会把它加入模型请求。

#### KV Cache 影响

## 已知限制与延期工作

- 解析器保持确定性，只覆盖第一批真实消息 fixture；模型辅助增强将在 Host 服务后续接入。
- 持久化、Remote API 传输、Moodle 映射、提醒、听写和辅导动作属于独立能力切片。

无。本包不组装模型上下文，也不改变提供方缓存键。

解析器不访问 React、Host、Moodle 或 RAGFlow，因此可以在服务端和测试中复用。真实消息 fixture 与行为测试位于 `tests/`。
