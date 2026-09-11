---
name: education-textbook-lookup
description: Use the curated Grade 7 first-semester textbook indexes to match homework to a subject, edition, chapter, and lesson without inventing page numbers or textbook versions.
user-invocable: true
---

# Grade 7 textbook lookup

Use the textbook profiles supplied by the education workspace and `packages/education/textbooks/chapter-index.md`.

## Required behavior

- Match by subject, publisher, volume, edition, and chapter title in that order.
- Return `subject`, `textbook`, `chapter`, `lesson`, `page`, `confidence`, and `needsConfirmation`.
- Set `page` to `null` unless the user supplied a page, an image, or a verified source record.
- Treat English `Starter` page references as unconfirmed until the cover and copyright page match.
- Do not select a geography edition from a subject name. Ask for the cover, copyright page, or original teacher message.
- For messages such as “see the math group” or “see the geography group”, request the original image or text before organizing the task.
- Keep the user's original task title and quote no more textbook content than needed to identify the lesson.

## Output discipline

Separate confirmed matches, suggested matches, and missing evidence. A suggested chapter is never a confirmed textbook relationship until the user saves or confirms the profile.
