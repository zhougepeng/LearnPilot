/* oxlint-disable @stylistic/max-len -- model prompts and durable mappings stay colocated. */
import { Context, Service } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { parseHomeworkMessage, requiresParentAssistanceOf, requiresParentSignatureOf, splitParentAssistanceActions, type AssistanceType, type HomeworkSubject, type HomeworkTask, type HomeworkTaskType } from '@deepseek-ai/dsh-education-homework'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ChapterAnalysis, ChapterAnalysisSection, ChapterKeySentence, ChapterQuizItem, ChapterSourceRef, ChapterStudyRecord, HomeworkAnalyzeChapterRequest, HomeworkAnalyzeRequest, HomeworkAnalysis, HomeworkChapterView, HomeworkCoachRequest, HomeworkCoachResult, HomeworkConfirmImportRequest, HomeworkDay, HomeworkDaySummary, HomeworkGetChapterRequest, HomeworkSaveTextbookRequest, HomeworkStartSubjectSessionRequest, HomeworkSubjectSession, HomeworkUpdateChapterProgressRequest, HomeworkUpdateSubjectSessionRequest, HomeworkUpdateTaskStatusRequest } from './types.ts'
import { DEFAULT_TEXTBOOK_PROFILES } from './textbook-presets.ts'
import { defaultChapterSource } from './chapter-sources.ts'
import { homeworkDomainSpec } from './spec.ts'

export type * from './types.ts'
export { homeworkDomainSpec } from './spec.ts'

declare module '@deepseek-ai/cordis' { interface Context { homeworkController: HomeworkController } }

const EMPTY_DAY = (dateKey: string): HomeworkDay => ({ dateKey, imports: [], tasks: [], textbooks: [...DEFAULT_TEXTBOOK_PROFILES], sessions: [] })

function sessionId(dateKey: string, subject: HomeworkSubject): string { return `${dateKey}-${subject}` }

function activeSecondsAt(session: HomeworkSubjectSession, now: string): number {
  if (session.status !== 'active' || session.lastResumedAt === undefined) return Math.max(0, Math.floor(session.activeSeconds))
  const started = Date.parse(session.lastResumedAt)
  const current = Date.parse(now)
  const segment = Number.isFinite(started) && Number.isFinite(current) ? Math.max(0, Math.floor((current - started) / 1_000)) : 0
  return Math.max(0, Math.floor(session.activeSeconds) + segment)
}

function sessionsOf(day: HomeworkDay): readonly HomeworkSubjectSession[] { return day.sessions ?? [] }

function withSession(day: HomeworkDay, nextSession: HomeworkSubjectSession): HomeworkDay {
  const sessions = [...sessionsOf(day)]
  const index = sessions.findIndex(session => session.subject === nextSession.subject)
  if (index < 0) sessions.push(nextSession)
  else sessions[index] = nextSession
  return { ...day, sessions }
}

function pauseOtherActiveSessions(day: HomeworkDay, subject: HomeworkSubject, now: string): HomeworkDay {
  let changed = false
  const sessions = sessionsOf(day).map((session) => {
    if (session.subject === subject || session.status !== 'active') return session
    changed = true
    const { lastResumedAt: _lastResumedAt, ...withoutResume } = session
    return { ...withoutResume, status: 'paused' as const, activeSeconds: activeSecondsAt(session, now), updatedAt: now }
  })
  return changed ? { ...day, sessions } : day
}

function normalizeSessions(day: HomeworkDay): HomeworkDay { return day.sessions === undefined ? { ...day, sessions: [] } : day }

function mergePresetTextbooks(day: HomeworkDay): HomeworkDay {
  const subjects = new Set(day.textbooks.map(book => book.subject))
  const presets = DEFAULT_TEXTBOOK_PROFILES.filter(book => !subjects.has(book.subject))
  return presets.length === 0 ? day : { ...day, textbooks: [...day.textbooks, ...presets] }
}

function normalizeParentAssistance(day: HomeworkDay): HomeworkDay {
  let changed = false
  const tasks = day.tasks.flatMap((task) => {
    const titles = splitParentAssistanceActions(task.title)
    if (titles.length < 2) {
      if (task.requiresParentAssistance || !requiresParentAssistanceOf(task.title)) return [task]
      changed = true
      return [{ ...task, requiresParentAssistance: true, assistanceTypes: [...new Set([...task.assistanceTypes, 'parent_assistance' as const])] }]
    }
    changed = true
    const baseAssistance: AssistanceType[] = task.assistanceTypes.filter(type => type !== 'parent_assistance' && type !== 'parent_signature')
    return titles.map((title, index) => {
      const requiresParentAssistance = requiresParentAssistanceOf(title)
      const requiresParentSignature = requiresParentSignatureOf(title)
      const assistanceTypes = [...baseAssistance]
      if (requiresParentAssistance) assistanceTypes.push('parent_assistance')
      if (requiresParentSignature) assistanceTypes.push('parent_signature')
      return { ...task, id: index === 0 ? task.id : `${task.id}-parent`, title, requiresParentAssistance, requiresParentSignature, assistanceTypes }
    })
  })
  return changed ? { ...day, tasks } : day
}

function requireModelText(assembler: BlockAssembler, route: string): string {
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    throw new Error(`${route}：${finish.failure.message}`)
  }
  if (finish.kind === 'max-tokens') throw new Error(`${route}：模型输出达到上限，结果不完整`)
  if (finish.kind === 'tool-calls') throw new Error(`${route}：模型返回了当前作业流程不支持的工具调用`)
  const text = assembler.blocks()
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
  if (text === '') throw new Error(`${route}：模型没有返回可整理的文本`)
  return text
}

type ModelJson = { tasks?: unknown; summary?: unknown; warnings?: unknown }
type ChapterModelJson = {
  overview?: unknown
  summary?: unknown
  structure?: unknown
  themes?: unknown
  keyWords?: unknown
  writingTechniques?: unknown
  keySentences?: unknown
  retellOutline?: unknown
  quiz?: unknown
  sourceRefs?: unknown
  warnings?: unknown
}

const SUBJECT_ALIASES: Readonly<Record<string, HomeworkSubject>> = {
  chinese: 'chinese', '中文': 'chinese', '语文': 'chinese',
  math: 'math', mathematics: 'math', '数学': 'math',
  english: 'english', '英语': 'english',
  biology: 'biology', '生物': 'biology',
  history: 'history', '历史': 'history',
  geography: 'geography', '地理': 'geography',
  other: 'other', '其他': 'other',
}

const TASK_TYPES: readonly HomeworkTaskType[] = ['written', 'reading', 'recitation', 'dictation', 'review', 'practice', 'worksheet', 'question_answer', 'drawing', 'parent_signature', 'other']
const ASSISTANCE_TYPES: readonly AssistanceType[] = ['reminder', 'tutor', 'dictation', 'recitation', 'review', 'check', 'textbook', 'parent_assistance', 'parent_signature', 'missing_info']

function modelSubject(value: unknown): HomeworkSubject {
  if (typeof value !== 'string') return 'other'
  return SUBJECT_ALIASES[value.trim().toLowerCase()] ?? 'other'
}

function modelTaskType(value: unknown): HomeworkTaskType {
  return typeof value === 'string' && TASK_TYPES.includes(value as HomeworkTaskType) ? value as HomeworkTaskType : 'other'
}

function modelAssistanceTypes(value: unknown): AssistanceType[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is AssistanceType => typeof item === 'string' && ASSISTANCE_TYPES.includes(item as AssistanceType))
}

function modelTask(value: unknown, importId: string, index: number, textbookProfiles: readonly { subject: HomeworkSubject }[]): HomeworkTask | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const title = valueString(Reflect.get(value, 'title')).slice(0, 2_000)
  if (title === '') return undefined
  const subject = modelSubject(Reflect.get(value, 'subject'))
  const missingInformation = Reflect.get(value, 'missingInformation') === true
  const missingInformationReason = valueString(Reflect.get(value, 'missingInformationReason'))
  const confidenceValue = Number(Reflect.get(value, 'confidence'))
  const estimatedMinutesValue = Number(Reflect.get(value, 'estimatedMinutes'))
  const profileMatches = textbookProfiles.some(profile => profile.subject === subject)
  const requiresParentAssistance = Reflect.get(value, 'requiresParentAssistance') === true || requiresParentAssistanceOf(title)
  const requiresParentSignature = Reflect.get(value, 'requiresParentSignature') === true || requiresParentSignatureOf(title)
  const assistanceTypes = modelAssistanceTypes(Reflect.get(value, 'assistanceTypes'))
  if (requiresParentAssistance && !assistanceTypes.includes('parent_assistance')) assistanceTypes.push('parent_assistance')
  if (requiresParentSignature && !assistanceTypes.includes('parent_signature')) assistanceTypes.push('parent_signature')
  return {
    id: `${importId}-task-${String(index).padStart(2, '0')}`,
    importId,
    subject,
    title,
    ...(valueString(Reflect.get(value, 'description')) ? { description: valueString(Reflect.get(value, 'description')).slice(0, 3_000) } : {}),
    taskType: modelTaskType(Reflect.get(value, 'taskType')),
    ...(valueString(Reflect.get(value, 'dueLabel')) ? { dueLabel: valueString(Reflect.get(value, 'dueLabel')).slice(0, 80) } : {}),
    ...(valueString(Reflect.get(value, 'recurrence')) ? { recurrence: valueString(Reflect.get(value, 'recurrence')).slice(0, 120) } : {}),
    sourceReference: (valueString(Reflect.get(value, 'sourceReference')) || title).slice(0, 2_000),
    requiresParentAssistance,
    requiresParentSignature,
    assistanceTypes,
    missingInformation,
    ...(missingInformationReason ? { missingInformationReason: missingInformationReason.slice(0, 500) } : {}),
    status: 'todo',
    ...(Number.isFinite(estimatedMinutesValue) && estimatedMinutesValue > 0 ? { estimatedMinutes: Math.min(1_440, estimatedMinutesValue) } : {}),
    confidence: Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0.65,
    textbookMatchStatus: profileMatches ? 'suggested' : 'unmatched',
    ...(valueString(Reflect.get(value, 'lessonReference')) ? { lessonReference: valueString(Reflect.get(value, 'lessonReference')).slice(0, 260) } : {}),
  }
}

function expandTaskActions(task: HomeworkTask): HomeworkTask[] {
  const titles = splitParentAssistanceActions(task.title)
  if (titles.length < 2) return [task]
  const baseAssistance: AssistanceType[] = task.assistanceTypes.filter(type => type !== 'parent_assistance' && type !== 'parent_signature')
  return titles.map((title, index) => {
    const requiresParentAssistance = requiresParentAssistanceOf(title)
    const requiresParentSignature = requiresParentSignatureOf(title)
    const assistanceTypes = [...baseAssistance]
    if (requiresParentAssistance) assistanceTypes.push('parent_assistance')
    if (requiresParentSignature) assistanceTypes.push('parent_signature')
    return { ...task, id: index === 0 ? task.id : `${task.id}-parent`, title, requiresParentAssistance, requiresParentSignature, assistanceTypes }
  })
}

function balancedJsonCandidates(text: string): string[] {
  const candidates: string[] = []
  let start = -1
  let quote = false
  let escaped = false
  const stack: string[] = []
  const closing: Readonly<Record<string, string>> = { '}': '{', ']': '[' }
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (start < 0) {
      if (character === '{' || character === '[') {
        start = index
        stack.push(character)
      }
      continue
    }
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = false
      continue
    }
    if (character === '"') {
      quote = true
      continue
    }
    if (character === '{' || character === '[') {
      stack.push(character)
      continue
    }
    if (character !== '}' && character !== ']') continue
    if (stack[stack.length - 1] !== closing[character]) {
      start = -1
      stack.length = 0
      continue
    }
    stack.pop()
    if (stack.length === 0) {
      candidates.push(text.slice(start, index + 1))
      start = -1
    }
  }
  return candidates
}

function parseJsonCandidate(candidate: string): unknown {
  const normalized = candidate.replace(/^\uFEFF/, '').trim()
  try { return JSON.parse(normalized) as unknown } catch {
    const withoutTrailingCommas = normalized.replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(withoutTrailingCommas) as unknown
  }
}

function parseModelJson(text: string, route: string): ModelJson {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/<(?:(?:think)|(?:analysis))>[\s\S]*?<\/(?:(?:think)|(?:analysis))>/gi, '')
    .trim()
  const fenced = [...normalized.matchAll(/```(?:json|jsonc)?\s*([\s\S]*?)```/gi)].map(match => match[1] as string)
  const candidates = [normalized, ...fenced, ...balancedJsonCandidates(normalized)]
  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = parseJsonCandidate(candidate)
      if (Array.isArray(parsed)) return { tasks: parsed }
      if (typeof parsed === 'object' && parsed !== null) return parsed as ModelJson
    } catch { /* try the next bounded candidate */ }
  }
  throw new Error(`${route}：模型返回内容不是有效 JSON`)
}

async function requestModelText(
  ctx: Context,
  selection: { provider: string; model: string },
  prompt: string,
  route: string,
): Promise<string> {
  const message = createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ provider: selection.provider, model: selection.model, messages: [message] })) assembler.push(chunk)
  return requireModelText(assembler, route)
}

function valueString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function valueStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()).slice(0, limit)
}

function valueSourceRefs(value: unknown): ChapterSourceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ChapterSourceRef[] => {
    if (typeof item !== 'object' || item === null) return []
    const label = valueString(Reflect.get(item, 'label'))
    if (label === '') return []
    const quote = valueString(Reflect.get(item, 'quote'))
    return [{ label, ...(quote === '' ? {} : { quote: quote.slice(0, 400) }) }]
  }).slice(0, 32)
}

function valueSections(value: unknown): ChapterAnalysisSection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ChapterAnalysisSection[] => {
    if (typeof item !== 'object' || item === null) return []
    const title = valueString(Reflect.get(item, 'title'))
    const body = valueString(Reflect.get(item, 'body'))
    if (title === '' || body === '') return []
    return [{ title: title.slice(0, 160), body: body.slice(0, 3_000), sourceRefs: valueSourceRefs(Reflect.get(item, 'sourceRefs')) }]
  }).slice(0, 12)
}

function valueKeySentences(value: unknown): ChapterKeySentence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ChapterKeySentence[] => {
    if (typeof item !== 'object' || item === null) return []
    const quote = valueString(Reflect.get(item, 'quote'))
    const explanation = valueString(Reflect.get(item, 'explanation'))
    if (quote === '' || explanation === '') return []
    return [{ quote: quote.slice(0, 500), explanation: explanation.slice(0, 2_000), sourceRefs: valueSourceRefs(Reflect.get(item, 'sourceRefs')) }]
  }).slice(0, 12)
}

function valueQuiz(value: unknown): ChapterQuizItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ChapterQuizItem[] => {
    if (typeof item !== 'object' || item === null) return []
    const id = valueString(Reflect.get(item, 'id'))
    const question = valueString(Reflect.get(item, 'question'))
    const answer = valueString(Reflect.get(item, 'answer'))
    const explanation = valueString(Reflect.get(item, 'explanation'))
    const kind = Reflect.get(item, 'kind')
    if (id === '' || question === '' || answer === '' || explanation === '' || (kind !== 'basic' && kind !== 'text' && kind !== 'transfer')) return []
    return [{ id, kind, question: question.slice(0, 1_000), answer: answer.slice(0, 2_000), explanation: explanation.slice(0, 2_000), sourceRefs: valueSourceRefs(Reflect.get(item, 'sourceRefs')) }]
  }).slice(0, 12)
}

function fingerprint(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function fallbackChapterAnalysis(sourceText: string, generatedAt: string, warning: string): ChapterAnalysis {
  const paragraphs = sourceText.split(/\r?\n+/).map(item => item.trim()).filter(Boolean).slice(0, 6)
  return {
    overview: '原文已保存，模型暂不可用。',
    summary: '请先通读原文，再按段落梳理内容；模型恢复后可以重新生成更具体的总结。',
    structure: paragraphs.map((body, index) => ({ title: `第${index + 1}段`, body: body.slice(0, 220), sourceRefs: [{ label: `第${index + 1}段` }] })),
    themes: [], keyWords: [], writingTechniques: [], keySentences: [],
    retellOutline: paragraphs.map((_, index) => `复述第${index + 1}段的主要内容`),
    quiz: [{ id: 'fallback-summary', kind: 'basic', question: '请用一句话概括这篇课文的主要内容。', answer: '请根据原文作答。', explanation: '先圈出人物、事件或景物，再用“对象 + 变化/特点”组织答案。', sourceRefs: [] }],
    sourceRefs: [], warnings: [warning], aiUsed: false, generatedAt,
  }
}

function normalizeChapterAnalysis(value: ChapterModelJson, generatedAt: string, route: string): ChapterAnalysis {
  const structure = valueSections(value.structure)
  const keySentences = valueKeySentences(value.keySentences)
  const quiz = valueQuiz(value.quiz)
  return {
    overview: valueString(value.overview, '已根据提供的课文资料生成章节概览。').slice(0, 2_000),
    summary: valueString(value.summary, '已根据提供的课文资料生成内容梳理。').slice(0, 8_000),
    structure, themes: valueStringArray(value.themes, 12), keyWords: valueStringArray(value.keyWords, 24), writingTechniques: valueStringArray(value.writingTechniques, 16),
    keySentences, retellOutline: valueStringArray(value.retellOutline, 16), quiz,
    sourceRefs: valueSourceRefs(value.sourceRefs), warnings: valueStringArray(value.warnings, 16), aiUsed: true, model: route, generatedAt,
  }
}

function chapterKey(profileId: string, chapterId: string): string { return `${profileId}::${chapterId}` }

/** Host Remote service for daily homework and chapter study workflows. */
export class HomeworkController extends TypertRemoteService {
  static inject = ['storageDomain', 'llm', 'agentDefaultModel']
  private table?: KvTable<string, HomeworkDay>
  private chapterTable?: KvTable<string, ChapterStudyRecord>

  constructor(ctx: Context) { super(ctx, 'homeworkController', { namespace: 'homework' }) }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(homeworkDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'education-homework.domainClose')
    this.table = domain.table('days')
    this.chapterTable = domain.table('chapters')
  }

  /**
   * Read one day's homework snapshot, merging missing preset textbook profiles.
   * @param dateKey - ISO date key for the requested day.
   * @returns Durable homework and textbook data for the day.
   */
  @Remote('getToday')
  getToday(dateKey: string): HomeworkDay { return this.read(dateKey) }

  /**
   * List saved days with compact completion counts for the history view.
   * @returns Saved homework days in reverse chronological order.
   */
  @Remote('listHistory')
  listHistory(): HomeworkDaySummary[] {
    return [...this.requireTable().entries()]
      .map(([dateKey, storedDay]) => {
        const day = normalizeParentAssistance(storedDay)
        const completedTasks = day.tasks.filter(task => task.status === 'done').length
        return {
          dateKey,
          totalTasks: day.tasks.length,
          completedTasks,
          incompleteTasks: day.tasks.length - completedTasks,
          importCount: day.imports.length,
        }
      })
      .filter(day => day.totalTasks > 0 || day.importCount > 0)
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
  }

  /**
   * Load or initialize one chapter study record for a saved textbook profile.
   * @param request - Textbook and chapter identity to load.
   * @returns The chapter view with source, analysis, and progress state.
   */
  @Remote('getChapter')
  async getChapter(request: HomeworkGetChapterRequest): Promise<HomeworkChapterView> {
    this.validateChapterRequest(request)
    const textbook = this.read(request.dateKey).textbooks.find(book => book.id === request.textbookProfileId)
    if (textbook === undefined) throw new Error('education-homework: 教材档案不存在，请先保存教材')
    const key = chapterKey(textbook.id, request.chapter.id)
    const existing = this.requireChapterTable().get(key)
    const builtInSource = defaultChapterSource(textbook.id, request.chapter.title)
    const record = existing === undefined
      ? {
        key,
        textbookProfileId: textbook.id,
        chapter: request.chapter,
        ...(builtInSource === undefined ? {} : { sourceText: builtInSource.text, sourceFileName: builtInSource.fileName, sourceHash: fingerprint(builtInSource.text) }),
        progress: { read: false, completedActivityIds: [], updatedAt: new Date().toISOString() },
      }
      : existing.sourceText === undefined && builtInSource !== undefined
        ? { ...existing, sourceText: builtInSource.text, sourceFileName: builtInSource.fileName, sourceHash: fingerprint(builtInSource.text) }
        : existing
    if (record !== existing) await this.requireChapterTable().put(key, record)
    return this.chapterView(record, textbook)
  }

  /**
   * Generate source-grounded chapter analysis and persist the lesson source.
   * @param request - Textbook, chapter, and confirmed source text.
   * @returns The updated chapter view.
   */
  @Remote('analyzeChapter')
  async analyzeChapter(request: HomeworkAnalyzeChapterRequest): Promise<HomeworkChapterView> {
    this.validateChapterRequest(request)
    const textbook = this.read(request.dateKey).textbooks.find(book => book.id === request.textbookProfileId)
    if (textbook === undefined) throw new Error('education-homework: 教材档案不存在，请先保存教材')
    const sourceText = request.sourceText.trim()
    if (sourceText === '') throw new Error('education-homework: 请先粘贴课文原文')
    if (sourceText.length > 200_000) throw new Error('education-homework: 课文原文不能超过 200000 个字符')
    const key = chapterKey(textbook.id, request.chapter.id)
    const current = this.requireChapterTable().get(key)
    const now = new Date().toISOString()
    let analysis: ChapterAnalysis
    try {
      const selection = this.ctx.agentDefaultModel.currentSelection()
      const route = `${selection.provider}/${selection.model}`
      const prompt = [
        '你是初中语文学习助手。只依据用户提供的课文原文，不要补写其他版本内容。只输出一个 JSON 对象。',
        '不要输出思考过程、解释、Markdown 或代码围栏；所有字符串使用双引号。',
        '字段必须包含 overview、summary、structure、themes、keyWords、writingTechniques、keySentences、retellOutline、quiz、sourceRefs、warnings。',
        'structure 是数组，每项包含 title、body、sourceRefs；keySentences 每项包含 quote、explanation、sourceRefs；quiz 每项包含 id、kind（basic/text/transfer）、question、answer、explanation、sourceRefs。',
        '所有具体判断尽量给出原文段落或短引文作为 sourceRefs；不确定时写入 warnings。',
        `教材：${JSON.stringify({ title: textbook.title, publisher: textbook.publisher, edition: textbook.edition, volume: textbook.volume })}`,
        `章节：${JSON.stringify(request.chapter)}`,
        `课文原文：\n${sourceText.slice(0, 200_000)}`,
      ].join('\n')
      const response = await requestModelText(this.ctx, selection, prompt, route)
      const parsed = parseModelJson(response, route) as ChapterModelJson
      analysis = normalizeChapterAnalysis(parsed, now, route)
      if (analysis.structure.length === 0 || analysis.quiz.length === 0) {
        analysis = { ...analysis, warnings: [...analysis.warnings, '模型未返回完整的结构或练习，建议重新生成。'] }
      }
    } catch (error) {
      analysis = fallbackChapterAnalysis(sourceText, now, `AI 章节总结未完成：${error instanceof Error ? error.message : String(error)}`)
    }
    const record: ChapterStudyRecord = {
      key,
      textbookProfileId: textbook.id,
      chapter: request.chapter,
      sourceText,
      ...(request.sourceFileName?.trim() ? { sourceFileName: request.sourceFileName.trim().slice(0, 260) } : {}),
      sourceHash: fingerprint(sourceText),
      analysis,
      progress: current?.progress ?? { read: false, completedActivityIds: [], updatedAt: now },
    }
    await this.requireChapterTable().put(key, record)
    return this.chapterView(record, textbook)
  }

  /**
   * Record one completed chapter activity idempotently.
   * @param request - Chapter key, activity id, and optional score.
   * @returns The updated view, or `undefined` when the record no longer exists.
   */
  @Remote('updateChapterProgress')
  async updateChapterProgress(request: HomeworkUpdateChapterProgressRequest): Promise<HomeworkChapterView | undefined> {
    const current = this.requireChapterTable().get(request.chapterKey)
    if (current === undefined) return undefined
    const activityIds = current.progress.completedActivityIds.includes(request.activityId)
      ? current.progress.completedActivityIds
      : [...current.progress.completedActivityIds, request.activityId]
    const progress = { ...current.progress, read: true, completedActivityIds: activityIds, ...(request.score === undefined ? {} : { score: Math.max(0, Math.min(1, request.score)) }), updatedAt: new Date().toISOString() }
    const next = { ...current, progress }
    await this.requireChapterTable().put(request.chapterKey, next)
    const textbook = this.read(request.dateKey).textbooks.find(book => book.id === current.textbookProfileId)
    return textbook === undefined ? undefined : this.chapterView(next, textbook)
  }

  /**
   * Organize one teacher message with deterministic parsing and optional AI enrichment.
   * @param request - Teacher message and saved textbook profiles.
   * @returns Parsed tasks plus model status and warnings.
   */
  @Remote('analyze')
  async analyze(request: HomeworkAnalyzeRequest): Promise<HomeworkAnalysis> {
    const parsed = parseHomeworkMessage(request.rawText, new Date().toISOString(), `analysis-${Date.now()}`)
    try {
      const selection = this.ctx.agentDefaultModel.currentSelection()
      const route = `${selection.provider}/${selection.model}`
      const prompt = ['你是初中作业整理助手。只输出一个 JSON 对象，第一字符必须是 {，最后字符必须是 }。', '不要输出思考过程、解释、Markdown、代码围栏或注释；所有字符串使用双引号，不要尾逗号。', '即使原文没有“语文：”或“数学：”这样的标题，也要根据上下文识别每项作业的科目；无法判断时使用 other，不要丢弃可执行作业。', '字段必须是 tasks、summary、warnings。tasks 中每项必须包含 subject（chinese/math/english/biology/history/geography/other）和 title，可选 description、taskType、dueLabel、recurrence、sourceReference、requiresParentAssistance、requiresParentSignature、assistanceTypes、missingInformation、missingInformationReason、estimatedMinutes、confidence、lessonReference。一个句子里有多个并列动作时要拆成多个 tasks，例如“改错并给家长讲解错题”必须拆成“改错”和“给家长讲解错题”两项；requiresParentAssistance 表示家长需要参与签字、检查、听孩子讲解、辅导或配合完成，requiresParentSignature 只是其中的签字子集。只提取老师原文明确出现的可执行作业，不要把成绩说明、提醒或背景通知单独当成作业；sourceReference 尽量引用原文中的短句。', `教材档案：${JSON.stringify(request.textbookProfiles)}`, `老师原文：\n${request.rawText}`].join('\n')
      const text = await requestModelText(this.ctx, selection, prompt, route)
      let json: ModelJson
      try {
        json = parseModelJson(text, route)
      } catch {
        const retryPrompt = ['上一次输出格式不符合要求。请重新整理，只输出一个可被 JSON.parse 解析的 JSON 对象。', '不要输出解释、思考过程、Markdown 或代码围栏；第一字符是 {，最后字符是 }；使用双引号且不要尾逗号。', '字段：tasks（数组，每项只允许 title、lessonReference、confidence）、summary、warnings。只能使用老师原文中明确出现的作业。', `老师原文：\n${request.rawText}`].join('\n')
        json = parseModelJson(await requestModelText(this.ctx, selection, retryPrompt, route), route)
      }
      const byTitle = new Map(parsed.tasks.map(task => [task.title, task]))
      const seen = new Set<string>()
      const tasks = Array.isArray(json.tasks) ? json.tasks.flatMap((item, index): HomeworkTask[] => {
        if (typeof item !== 'object' || item === null) return []
        const title = valueString(Reflect.get(item, 'title'))
        const base = byTitle.get(title)
        const confidence = Number(Reflect.get(item, 'confidence'))
        const lessonReference = valueString(Reflect.get(item, 'lessonReference'))
        const task = base === undefined
          ? modelTask(item, parsed.import.id, index + 1, request.textbookProfiles)
          : { ...base, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : base.confidence, ...(lessonReference ? { lessonReference } : {}), textbookMatchStatus: request.textbookProfiles.some(book => book.subject === base.subject) ? 'suggested' as const : 'unmatched' as const }
        if (task === undefined) return []
        return expandTaskActions(task).filter((expanded) => {
          const identity = `${expanded.subject}:${expanded.title}`
          if (seen.has(identity)) return false
          seen.add(identity)
          return true
        })
      }).slice(0, 32) : []
      return { tasks: tasks.length > 0 ? tasks : parsed.tasks, aiUsed: true, model: route, summary: typeof json.summary === 'string' ? json.summary : 'AI 已完成作业拆分与教材匹配建议。', warnings: Array.isArray(json.warnings) ? json.warnings.filter((item): item is string => typeof item === 'string') : [] }
    } catch (error) {
      return {
        tasks: parsed.tasks,
        aiUsed: false,
        summary: '已使用规则完成基础整理，模型调用未完成。',
        warnings: [`AI 整理未完成：${error instanceof Error ? error.message : String(error)}`],
      }
    }
  }

  /**
   * Request step-by-step tutoring for one homework task.
   * @param request - Task and optional confirmed textbook profile.
   * @returns Guidance text and model status.
   */
  @Remote('coach')
  async coach(request: HomeworkCoachRequest): Promise<HomeworkCoachResult> {
    try {
      const selection = this.ctx.agentDefaultModel.currentSelection()
      const route = `${selection.provider}/${selection.model}`
      const message = createUserMessage({ content: [{ type: 'text', text: `你是耐心的初中辅导老师。针对这道作业只给分步提示，不直接给最终答案。作业：${request.task.title}。教材：${request.textbook?.title ?? '未匹配教材'}。给出 3-5 步可执行提示。` }], source: { kind: 'user' } })
      const assembler = new BlockAssembler()
      for await (const chunk of this.ctx.llm.stream({ provider: selection.provider, model: selection.model, messages: [message] })) assembler.push(chunk)
      return { guidance: requireModelText(assembler, route), aiUsed: true, model: route }
    } catch (error) {
      return {
        guidance: '先圈出题目要求，再写出已知条件；完成第一步后自检单位、关键词和计算过程。遇到不会的地方，把卡住的步骤发给老师或家长。',
        aiUsed: false,
        warning: `AI 辅导未完成：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * Confirm one imported teacher message and persist its tasks.
   * @param request - Import identity, raw message, and optional reviewed tasks.
   * @returns The updated daily homework snapshot.
   */
  @Remote('confirmImport')
  async confirmImport(request: HomeworkConfirmImportRequest): Promise<HomeworkDay> {
    const current = this.read(request.dateKey)
    if (current.imports.some(item => item.id === request.importId)) return current
    const parsed = parseHomeworkMessage(request.rawText, new Date().toISOString(), request.importId)
    const profileIds = request.textbookProfileIdsBySubject ?? {}
    const sourceTasks = request.analyzedTasks?.length ? request.analyzedTasks : parsed.tasks
    const tasks = sourceTasks.map((task) => {
      const profileId = profileIds[task.subject]
      return profileId === undefined
        ? { ...task, textbookMatchStatus: 'unmatched' as const }
        : { ...task, textbookProfileId: profileId, textbookMatchStatus: 'confirmed' as const }
    })
    const next: HomeworkDay = {
      dateKey: request.dateKey,
      imports: [...current.imports, { id: request.importId, rawText: request.rawText, receivedAt: parsed.import.receivedAt, source: request.source ?? 'manual' }],
      tasks: [...current.tasks, ...tasks],
      textbooks: current.textbooks,
    }
    await this.requireTable().put(request.dateKey, next)
    return next
  }

  /**
   * Update one persisted homework task status.
   * @param request - Date, task identity, and next status.
   * @returns The updated daily homework snapshot.
   */
  @Remote('updateTaskStatus')
  async updateTaskStatus(request: HomeworkUpdateTaskStatusRequest): Promise<HomeworkDay> {
    const current = this.read(request.dateKey)
    const index = current.tasks.findIndex(task => task.id === request.taskId)
    if (index < 0) return current
    const tasks = [...current.tasks]
    const task = tasks[index]
    if (task === undefined) return current
    if (request.status === 'done') {
      tasks[index] = { ...task, status: request.status, completedAt: new Date().toISOString() }
    } else {
      const { completedAt: _completedAt, ...withoutCompletion } = task
      tasks[index] = { ...withoutCompletion, status: request.status }
    }
    const next = { ...current, tasks }
    await this.requireTable().put(request.dateKey, next)
    return next
  }

  /**
   * Start or resume the single active subject session for one day.
   * @param request - Date and subject to start.
   * @returns The updated daily homework snapshot.
   */
  @Remote('startSubjectSession')
  async startSubjectSession(request: HomeworkStartSubjectSessionRequest): Promise<HomeworkDay> {
    const current = this.read(request.dateKey)
    if (!current.tasks.some(task => task.subject === request.subject)) return current
    const existing = sessionsOf(current).find(session => session.subject === request.subject)
    const hasIncompleteTasks = current.tasks.some(task => task.subject === request.subject && task.status !== 'done')
    const hasOtherActive = sessionsOf(current).some(session => session.subject !== request.subject && session.status === 'active')
    if ((existing?.status === 'active' && !hasOtherActive) || (existing?.status === 'completed' && !hasIncompleteTasks)) return current
    const now = new Date().toISOString()
    const exclusive = pauseOtherActiveSessions(current, request.subject, now)
    if (existing?.status === 'active') {
      await this.requireTable().put(request.dateKey, exclusive)
      return exclusive
    }
    const nextSession: HomeworkSubjectSession = existing === undefined
      ? { id: sessionId(request.dateKey, request.subject), dateKey: request.dateKey, subject: request.subject, status: 'active', startedAt: now, activeSeconds: 0, lastResumedAt: now, updatedAt: now }
      : { ...existing, status: 'active', lastResumedAt: now, updatedAt: now }
    const next = withSession(exclusive, nextSession)
    await this.requireTable().put(request.dateKey, next)
    return next
  }

  /**
   * Pause the active session for one subject.
   * @param request - Date and subject to pause.
   * @returns The updated daily homework snapshot.
   */
  @Remote('pauseSubjectSession')
  async pauseSubjectSession(request: HomeworkUpdateSubjectSessionRequest): Promise<HomeworkDay> {
    const current = this.read(request.dateKey)
    const existing = sessionsOf(current).find(session => session.subject === request.subject)
    if (existing === undefined || existing.status !== 'active') return current
    const now = new Date().toISOString()
    const { lastResumedAt: _lastResumedAt, ...withoutResume } = existing
    const nextSession: HomeworkSubjectSession = { ...withoutResume, status: 'paused', activeSeconds: activeSecondsAt(existing, now), updatedAt: now }
    const next = withSession(current, nextSession)
    await this.requireTable().put(request.dateKey, next)
    return next
  }

  /**
   * Finish the session for one subject and freeze its elapsed time.
   * @param request - Date and subject to finish.
   * @returns The updated daily homework snapshot.
   */
  @Remote('finishSubjectSession')
  async finishSubjectSession(request: HomeworkUpdateSubjectSessionRequest): Promise<HomeworkDay> {
    const current = this.read(request.dateKey)
    const existing = sessionsOf(current).find(session => session.subject === request.subject)
    if (existing === undefined || existing.status === 'completed') return current
    const now = new Date().toISOString()
    const { lastResumedAt: _lastResumedAt, ...withoutResume } = existing
    const nextSession: HomeworkSubjectSession = { ...withoutResume, status: 'completed', activeSeconds: activeSecondsAt(existing, now), endedAt: now, updatedAt: now }
    const next = withSession(current, nextSession)
    await this.requireTable().put(request.dateKey, next)
    return next
  }

  /**
   * Save or replace one textbook profile and attach it to matching tasks.
   * @param request - Date and textbook profile to persist.
   * @returns The updated daily homework snapshot.
   */
  @Remote('saveTextbook')
  async saveTextbook(request: HomeworkSaveTextbookRequest): Promise<HomeworkDay> {
    const current = this.read(request.dateKey)
    const textbooks = [...current.textbooks.filter(item => item.id !== request.profile.id), { ...request.profile, catalogStatus: 'user_confirmed' as const }]
    const tasks = current.tasks.map(task => task.subject === request.profile.subject && task.textbookProfileId === undefined
      ? { ...task, textbookProfileId: request.profile.id, textbookMatchStatus: 'confirmed' as const }
      : task)
    const next = { ...current, textbooks, tasks }
    await this.requireTable().put(request.dateKey, next)
    return next
  }

  private chapterView(record: ChapterStudyRecord, textbook: HomeworkChapterView['textbook']): HomeworkChapterView {
    return {
      key: record.key,
      textbook,
      chapter: record.chapter,
      source: {
        status: record.sourceText === undefined ? 'missing' : 'provided',
        ...(record.sourceText === undefined ? {} : { text: record.sourceText }),
        ...(record.sourceFileName === undefined ? {} : { fileName: record.sourceFileName }),
        ...(record.sourceHash === undefined ? {} : { hash: record.sourceHash }),
      },
      ...(record.analysis === undefined ? {} : { analysis: record.analysis }),
      progress: record.progress,
    }
  }

  private validateChapterRequest(request: HomeworkGetChapterRequest): void {
    if (request.chapter.textbookProfileId !== request.textbookProfileId) throw new Error('education-homework: 章节与教材档案不匹配')
    if (request.chapter.id.trim() === '' || request.chapter.title.trim() === '') throw new Error('education-homework: 章节标识和标题不能为空')
  }

  private read(dateKey: string): HomeworkDay { return normalizeSessions(normalizeParentAssistance(mergePresetTextbooks(this.requireTable().get(dateKey) ?? EMPTY_DAY(dateKey)))) }
  private requireTable(): KvTable<string, HomeworkDay> { if (this.table === undefined) throw new Error('education-homework: domain is not initialized'); return this.table }
  private requireChapterTable(): KvTable<string, ChapterStudyRecord> { if (this.chapterTable === undefined) throw new Error('education-homework: domain is not initialized'); return this.chapterTable }
}

export default HomeworkController
