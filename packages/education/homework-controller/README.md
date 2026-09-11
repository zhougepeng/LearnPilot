---
description: "Host Remote controller for durable homework, textbook profiles, and model-assisted organization and tutoring."
kind: "package-reference"
---

# @deepseek-ai/dsh-education-homework-controller

English | [中文](README.zh.md)

## Summary

This Host package stores daily homework and textbook profiles and exposes the Remote methods used by the education workspace. It seeds the first-semester Grade 7 mathematics, Chinese, history, and biology indexes; English remains marked for cover confirmation and geography is not auto-selected. `analyze` first parses teacher text locally, then asks the DSH LLM service through `ctx.agentDefaultModel` to classify tasks from the full message, including messages without explicit subject headings, and add textbook references and a summary. If the selected provider fails or returns invalid output, the controller keeps the locally parsed tasks when available and returns the provider error for confirmation. `coach` requests step-by-step hints and has the same deterministic fallback.

## Use package

Load the package in the web-app Host composition together with storage, LLM, and the default-model service. The browser calls `getToday`, `listHistory`, `analyze`, `confirmImport`, `updateTaskStatus`, `saveTextbook`, `coach`, `getChapter`, `analyzeChapter`, and `updateChapterProgress` through the generated Remote face. `listHistory` returns reverse-chronological completion counts, while historical details use `getToday(dateKey)`, enabling date browsing and unfinished-day filtering.

Chapter study records live in a separate `chapters` table instead of the daily homework record. `analyzeChapter` requires confirmed lesson source text and stores its fingerprint, structured analysis, source references, and learner progress; a changed source should trigger regeneration. For curated public-domain lessons, `getChapter` hydrates a first-open or older missing-source record and the client starts analysis automatically; other textbook editions still require a user-provided source.

Subject timing is exclusive within one day: starting a new subject automatically pauses any other active subject while preserving its elapsed time, and the client asks for confirmation before stopping an active timer when leaving the homework page.

## Further Exploration

- [`src/index.ts`](src/index.ts) — Remote methods and model request handling.
- [`src/spec.ts`](src/spec.ts) — durable homework domain.
- [`src/types.ts`](src/types.ts) — browser/Host request and response types.

## Model Experience

### Homework organization, tutoring, and chapter study

#### What the model sees

The organization request includes the complete teacher message and saved textbook profiles. The model may return a subject and task title directly, which lets the controller handle free-form messages that the local parser cannot classify; each model task is normalized into the same confirmation record, keeps `requiresParentAssistance` as an attribute of its subject task, and splits correction and parent explanation into separate tasks when both actions appear together. Tutoring includes one task title and its matched textbook title. The chapter `analyzeChapter` request includes confirmed lesson text, textbook metadata, and the chapter index; it asks for an overview, structure, key-sentence notes, a retell outline, and layered practice with source references. The controller asks for one JSON object, accepts bounded JSON inside common reasoning-tag or code-fence wrappers, and retries once when the first response is only formatting-incompatible.

#### Token effect

One provider request is made per organization, tutoring, or chapter-analysis action. Input tokens grow with the teacher message, lesson source, and textbook profile text; chapter analysis is dominated by the confirmed lesson source.

#### KV Cache effect

The controller does not choose cache keys or persist provider cache state.

## Known Limitations and Deferred Work

- **No durable Agent session** — model calls have no conversation history, tool execution, or autonomous follow-up.
- **Textbook matching is conservative** — the model may suggest a reference, but confirmation still chooses the saved textbook profile before persistence.
- **Chapter sources are user-provided** — the first vertical slice accepts pasted `.txt`/`.md` text; image OCR, PDF extraction, and external RAG remain deferred.
