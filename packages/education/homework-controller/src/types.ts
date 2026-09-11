/* oxlint-disable @stylistic/max-len -- public request types keep related fields together. */
import type { HomeworkTask, HomeworkSubject } from '@deepseek-ai/dsh-education-homework'

/** Saved metadata for one student textbook. */
export interface TextbookProfile {
  readonly id: string
  readonly subject: HomeworkSubject
  readonly grade: string
  readonly term: string
  readonly publisher: string
  readonly edition: string
  readonly volume: string
  readonly title: string
  readonly sourceFileName?: string
  readonly chapterIndex?: string
  readonly sourceUrl?: string
  readonly catalogStatus?: 'preset' | 'needs_confirmation' | 'user_confirmed'
}

/** Durable daily homework snapshot returned to the Client. */
export interface HomeworkDay {
  readonly dateKey: string
  readonly imports: readonly HomeworkImportView[]
  readonly tasks: readonly HomeworkTask[]
  readonly textbooks: readonly TextbookProfile[]
  /** One resumable execution session per subject and day. */
  readonly sessions?: readonly HomeworkSubjectSession[]
}

/** Lifecycle state for a subject homework execution session. */
export type HomeworkSubjectSessionStatus = 'active' | 'paused' | 'completed'

/** Durable timing record for one subject's homework session. */
export interface HomeworkSubjectSession {
  readonly id: string
  readonly dateKey: string
  readonly subject: HomeworkSubject
  readonly status: HomeworkSubjectSessionStatus
  readonly startedAt: string
  readonly endedAt?: string
  /** Accumulated active seconds before the current active segment. */
  readonly activeSeconds: number
  /** Start of the current active segment, present only while active. */
  readonly lastResumedAt?: string
  readonly updatedAt: string
}

/** Request to start or resume one subject homework session. */
export interface HomeworkStartSubjectSessionRequest {
  readonly dateKey: string
  readonly subject: HomeworkSubject
}

/** Request to pause or finish one subject homework session. */
export interface HomeworkUpdateSubjectSessionRequest {
  readonly dateKey: string
  readonly subject: HomeworkSubject
}

/** Compact completion counts used to browse saved homework days. */
export interface HomeworkDaySummary {
  readonly dateKey: string
  readonly totalTasks: number
  readonly completedTasks: number
  readonly incompleteTasks: number
  readonly importCount: number
}

/** One imported teacher message shown in the daily snapshot. */
export interface HomeworkImportView {
  readonly id: string
  readonly rawText: string
  readonly receivedAt: string
  readonly source: 'wechat' | 'manual' | 'other'
}

/** Request to confirm one imported message and persist its tasks. */
export interface HomeworkConfirmImportRequest {
  readonly dateKey: string
  readonly importId: string
  readonly rawText: string
  readonly source?: 'wechat' | 'manual' | 'other'
  readonly textbookProfileIdsBySubject?: Readonly<Partial<Record<HomeworkSubject, string>>>
  readonly analyzedTasks?: readonly HomeworkTask[]
}

/** Request to change one homework task status. */
export interface HomeworkUpdateTaskStatusRequest {
  readonly dateKey: string
  readonly taskId: string
  readonly status: HomeworkTask['status']
}

/** Request to save or replace one textbook profile. */
export interface HomeworkSaveTextbookRequest {
  readonly dateKey: string
  readonly profile: TextbookProfile
}

/** Inputs used to organize one teacher message. */
export interface HomeworkAnalyzeRequest { readonly rawText: string; readonly textbookProfiles: readonly TextbookProfile[] }
/** Model-assisted homework organization result. */
export interface HomeworkAnalysis { readonly tasks: readonly HomeworkTask[]; readonly aiUsed: boolean; readonly model?: string; readonly summary: string; readonly warnings: readonly string[] }
/** Inputs used to request step-by-step help for one task. */
export interface HomeworkCoachRequest { readonly task: HomeworkTask; readonly textbook?: TextbookProfile }
/** Step-by-step tutoring result. */
export interface HomeworkCoachResult { readonly guidance: string; readonly aiUsed: boolean; readonly model?: string; readonly warning?: string }

/** One navigable lesson parsed from a textbook chapter index. */
export interface TextbookChapter {
  readonly id: string
  readonly textbookProfileId: string
  readonly unitTitle?: string
  readonly lessonNumber?: string
  readonly title: string
}

/** Short source label used to trace generated claims back to the lesson. */
export interface ChapterSourceRef {
  readonly label: string
  readonly quote?: string
}

/** One section in a generated chapter content map. */
export interface ChapterAnalysisSection {
  readonly title: string
  readonly body: string
  readonly sourceRefs: readonly ChapterSourceRef[]
}

/** Explanation for one selected sentence from the lesson. */
export interface ChapterKeySentence {
  readonly quote: string
  readonly explanation: string
  readonly sourceRefs: readonly ChapterSourceRef[]
}

/** One layered practice question with a reference answer. */
export interface ChapterQuizItem {
  readonly id: string
  readonly kind: 'basic' | 'text' | 'transfer'
  readonly question: string
  readonly answer: string
  readonly explanation: string
  readonly sourceRefs: readonly ChapterSourceRef[]
}

/** Structured AI analysis for one chapter. */
export interface ChapterAnalysis {
  readonly overview: string
  readonly summary: string
  readonly structure: readonly ChapterAnalysisSection[]
  readonly themes: readonly string[]
  readonly keyWords: readonly string[]
  readonly writingTechniques: readonly string[]
  readonly keySentences: readonly ChapterKeySentence[]
  readonly retellOutline: readonly string[]
  readonly quiz: readonly ChapterQuizItem[]
  readonly sourceRefs: readonly ChapterSourceRef[]
  readonly warnings: readonly string[]
  readonly aiUsed: boolean
  readonly model?: string
  readonly generatedAt: string
}

/** Learner progress stored alongside one chapter analysis. */
export interface ChapterProgress {
  readonly read: boolean
  readonly completedActivityIds: readonly string[]
  readonly score?: number
  readonly updatedAt: string
}

/** Durable chapter source, analysis, and progress record. */
export interface ChapterStudyRecord {
  readonly key: string
  readonly textbookProfileId: string
  readonly chapter: TextbookChapter
  readonly sourceText?: string
  readonly sourceFileName?: string
  readonly sourceHash?: string
  readonly analysis?: ChapterAnalysis
  readonly progress: ChapterProgress
}

/** Browser-facing chapter view assembled from a textbook and study record. */
export interface HomeworkChapterView {
  readonly key: string
  readonly textbook: TextbookProfile
  readonly chapter: TextbookChapter
  readonly source: {
    readonly status: 'missing' | 'provided'
    readonly text?: string
    readonly fileName?: string
    readonly hash?: string
  }
  readonly analysis?: ChapterAnalysis
  readonly progress: ChapterProgress
}

/** Request to load one chapter study view. */
export interface HomeworkGetChapterRequest {
  readonly dateKey: string
  readonly textbookProfileId: string
  readonly chapter: TextbookChapter
}

/** Request to generate analysis from confirmed lesson source text. */
export interface HomeworkAnalyzeChapterRequest extends HomeworkGetChapterRequest {
  readonly sourceText: string
  readonly sourceFileName?: string
}

/** Request to mark a chapter activity complete. */
export interface HomeworkUpdateChapterProgressRequest {
  readonly dateKey: string
  readonly chapterKey: string
  readonly activityId: string
  readonly score?: number
}
