---
description: "Homework domain types and a conservative parser for teacher-group messages."
kind: "package-reference"
---

# @deepseek-ai/dsh-education-homework

English | [中文](README.zh.md)

This package owns the first education-domain slice: typed homework imports and a conservative parser for teacher-group messages. It is independent of React, Moodle, RAGFlow, and the DSH conversation runtime so those integrations can consume one stable result.

The parser treats uncertain or explicitly deferred content as `missingInformation` instead of guessing. It recognizes parent participation separately from the narrower signature requirement, splits numbered math assignments line by line, separates correction from parent explanation when both actions appear in one sentence, and removes score notices from actionable task titles. It preserves the source line on every task for confirmation UI and later audit trails.

## Model Experience

### Application-domain parser

#### What the model sees

Nothing. This application-domain library is not registered as a model-facing tool, prompt section, or provider request; `parseHomeworkMessage()` returns application data only.

#### Token effect

None. Parser output is kept in the application domain and is not included in a model request by this package.

#### KV Cache effect

None. This package does not assemble model context or alter provider cache keys.

## Known Limitations and Deferred Work

- The parser is intentionally deterministic and covers the first real message fixture; model-assisted enrichment will be added behind a Host service.
- Persistence, Remote API transport, Moodle mapping, reminders, dictation, and tutor actions are separate slices.
