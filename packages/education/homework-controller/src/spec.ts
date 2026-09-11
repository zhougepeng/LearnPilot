/* oxlint-disable @stylistic/max-len -- schema declarations mirror the durable wire record. */
import { z } from 'zod'
import type { ChapterStudyRecord, HomeworkDay } from './types.ts'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

const task = z.object({
  id: z.string(), importId: z.string(), subject: z.enum(['chinese', 'math', 'english', 'biology', 'history', 'geography', 'other']),
  title: z.string(), description: z.string().optional(), taskType: z.string(), dueLabel: z.string().optional(), recurrence: z.string().optional(),
  sourceReference: z.string(), requiresParentAssistance: z.boolean().optional().default(false), requiresParentSignature: z.boolean(), assistanceTypes: z.array(z.string()), missingInformation: z.boolean(),
  missingInformationReason: z.string().optional(), status: z.enum(['todo', 'in_progress', 'done']), completedAt: z.string().optional(), estimatedMinutes: z.number().optional(), confidence: z.number(),
  textbookProfileId: z.string().optional(), textbookMatchStatus: z.enum(['unmatched', 'suggested', 'confirmed']).optional(), lessonReference: z.string().optional(),
})
const subjectSession = z.object({
  id: z.string(), dateKey: z.string(), subject: z.enum(['chinese', 'math', 'english', 'biology', 'history', 'geography', 'other']),
  status: z.enum(['active', 'paused', 'completed']), startedAt: z.string(), endedAt: z.string().optional(),
  activeSeconds: z.number().nonnegative(), lastResumedAt: z.string().optional(), updatedAt: z.string(),
})

const sourceRef = z.object({ label: z.string().max(120), quote: z.string().max(400).optional() })
const chapter = z.object({
  id: z.string(), textbookProfileId: z.string(), unitTitle: z.string().optional(), lessonNumber: z.string().optional(), title: z.string(),
})
const chapterAnalysis = z.object({
  overview: z.string().max(2_000), summary: z.string().max(8_000),
  structure: z.array(z.object({ title: z.string().max(160), body: z.string().max(3_000), sourceRefs: z.array(sourceRef) })).max(12),
  themes: z.array(z.string().max(240)).max(12), keyWords: z.array(z.string().max(80)).max(24), writingTechniques: z.array(z.string().max(240)).max(16),
  keySentences: z.array(z.object({ quote: z.string().max(500), explanation: z.string().max(2_000), sourceRefs: z.array(sourceRef) })).max(12),
  retellOutline: z.array(z.string().max(500)).max(16),
  quiz: z.array(z.object({ id: z.string(), kind: z.enum(['basic', 'text', 'transfer']), question: z.string().max(1_000), answer: z.string().max(2_000), explanation: z.string().max(2_000), sourceRefs: z.array(sourceRef) })).max(12),
  sourceRefs: z.array(sourceRef).max(32), warnings: z.array(z.string().max(500)).max(16), aiUsed: z.boolean(), model: z.string().optional(), generatedAt: z.string(),
})
const chapterProgress = z.object({ read: z.boolean(), completedActivityIds: z.array(z.string()).max(64), score: z.number().min(0).max(1).optional(), updatedAt: z.string() })
const chapterStudy = z.object({
  key: z.string(), textbookProfileId: z.string(), chapter, sourceText: z.string().max(200_000).optional(), sourceFileName: z.string().max(260).optional(), sourceHash: z.string().max(80).optional(), analysis: chapterAnalysis.optional(), progress: chapterProgress,
})

/** Validates one durable daily homework record. */
export const homeworkDaySchema = z.object({
  dateKey: z.string(),
  imports: z.array(z.object({ id: z.string(), rawText: z.string(), receivedAt: z.string(), source: z.enum(['wechat', 'manual', 'other']) })),
  tasks: z.array(task),
  textbooks: z.array(z.object({ id: z.string(), subject: z.enum(['chinese', 'math', 'english', 'biology', 'history', 'geography', 'other']), grade: z.string(), term: z.string(), publisher: z.string(), edition: z.string(), volume: z.string(), title: z.string(), sourceFileName: z.string().optional(), chapterIndex: z.string().optional(), sourceUrl: z.string().url().optional(), catalogStatus: z.enum(['preset', 'needs_confirmation', 'user_confirmed']).optional() })),
  sessions: z.array(subjectSession).optional().default([]),
}) as unknown as z.ZodType<HomeworkDay>

/** Durable domain declaration for daily homework and chapter study records. */
export const homeworkDomainSpec = defineDomain({
  name: 'education_homework',
  version: 1,
  compatibleVersions: [0],
  tables: { days: domainTable<string, HomeworkDay>(homeworkDaySchema), chapters: domainTable<string, ChapterStudyRecord>(chapterStudy as unknown as z.ZodType<ChapterStudyRecord>) },
})
