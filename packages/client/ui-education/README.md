---
description: "Student homework workspace for importing teacher messages, confirming parsed tasks, and tracking today's assignments."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-education

English | [中文](README.zh.md)

## Summary

This browser plugin adds an education workspace to the DSH Web client: paste one complete teacher-group message, review the conservative subject and task extraction, confirm it, and track Host-persisted daily homework. “Homework history” reviews daily completion by date and can show only dates with unfinished items; “Preview / review” lets the learner choose a subject and textbook chapter before opening study. Starting homework for a subject presents the matched lesson as a two-column view with lesson text on the left and analysis on the right; when source text is missing, the left pane states the gap while the right pane can still show a compact reference. Missing details remain visible instead of being invented.

The package is intentionally limited to the homework loop. It does not replace DSH Conversation, streaming, or agent runtime, and it does not pretend to provide Moodle or RAGFlow data before those adapters are configured.

## Use package

Open **Add model** to reveal DSH's standard Models dialog, where a compatible provider can be added and one of its advertised models can be saved as the global default. After a usable model is configured, open **Add homework**, paste the complete message, choose **Start organizing**, review the extracted rows, and choose **Confirm and add**. The Host homework controller sends the source text and saved textbook profiles to that default model, so messages without explicit subject headings can still be classified from context. Deterministic parsing remains the fallback when the request fails.

The Textbook profiles view starts with curated Grade 7 first-semester chapter indexes for mathematics, Chinese, history, and biology. English remains pending cover and page confirmation, and geography has no automatic edition. Each preset keeps its source URL and chapter index so the model can suggest a lesson without inventing a page. Chinese chapters also include a concise common-version preview (overview, summary, structure, themes, and keywords), so a chapter can be read immediately; preview and review reuse the same saved chapter materials, while confirmed lesson text enables source-grounded model analysis, source warnings, and learner progress.

Choose **Add textbook** to open a dialog for the textbook metadata and a local `.pdf`, `.txt`, or `.md` file. Text-based PDFs are extracted in the browser, converted into a Markdown preview, and can be downloaded. Saving the profile keeps metadata, the chapter index, and the file name only; it does not place an entire textbook into the daily homework record.

## Model Experience

### Education homework workspace

#### What the model sees

This browser presentation sends no model request itself. The Host homework controller sends the complete teacher message and the saved textbook profiles for model-assisted organization; tutoring sends the selected task title and its matched textbook title. Opening a chapter invokes `analyzeChapter` with confirmed lesson text, textbook metadata, and the chapter index, then asks for an overview, structure, key-sentence notes, a retell outline, and layered practice. Organization and chapter analysis use JSON; tutoring uses step-by-step guidance.

#### Token effect

One provider request per organization, tutoring, or chapter-analysis action. Input size grows with the teacher message, lesson source, and saved textbook profile text.

#### KV Cache effect

None. This package does not assemble model context or alter provider cache keys.

## Known Limitations and Deferred Work

- **Direct model use, not an Agent session** — organization and tutoring use the DSH LLM service and global default model, but do not yet create a durable Agent session with tools, history, or autonomous follow-up.
- **Deferred integrations** — Moodle, RAGFlow, reminders, and parent accounts wait for explicit service contracts and deployment details.
- **Chapter source scope** — the add-textbook dialog accepts text PDFs, `.txt`, and `.md` for local conversion; scanned PDFs still need OCR, and image OCR, independent full-text storage, and cross-chapter retrieval remain deferred.
