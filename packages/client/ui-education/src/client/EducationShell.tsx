/* oxlint-disable @stylistic/max-len -- shell slot wiring is intentionally colocated. */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { IconEditOutline16, IconPlusOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseHomeworkMessage, type AssistanceType, type HomeworkTask, type HomeworkSubject, type HomeworkTaskType } from '@deepseek-ai/dsh-education-homework'
import type { HomeworkDay, HomeworkDaySummary, TextbookChapter, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import type { HomeworkClient } from './index.ts'
import { ChapterStudyPage } from './ChapterStudyPage.tsx'
import { SubjectHomeworkPage } from './SubjectHomeworkPage.tsx'
import { StudyPage, type StudyMode } from './StudyPage.tsx'
import { parseTextbookChapters } from './chapter-index.ts'
import type { EducationKey } from './locales.ts'
import css from './EducationShell.module.css'
import confirmCss from './ConfirmGroups.module.css'

type EducationShellProps = { homework: HomeworkClient; t: (key: EducationKey, params?: Record<string, unknown>) => string }
const dateKey = new Date().toISOString().slice(0, 10)
const CONFIRM_SUBJECTS: readonly HomeworkSubject[] = ['other', 'chinese', 'math', 'english', 'biology', 'history', 'geography']
const CONFIRM_TASK_TYPES: readonly HomeworkTaskType[] = ['other', 'written', 'reading', 'recitation', 'dictation', 'review', 'practice', 'worksheet', 'question_answer', 'drawing', 'parent_signature']
const CONFIRM_ASSISTANCE_TYPES: readonly AssistanceType[] = ['recitation', 'dictation', 'review', 'parent_signature', 'reminder', 'tutor', 'check', 'textbook', 'parent_assistance', 'missing_info']

// PDF.js can run its worker protocol through a same-page loopback when the
// worker module is already available. This keeps local uploads independent of
// a separately hosted `pdf.worker.mjs` asset.
const pdfjsGlobal = globalThis as typeof globalThis & {
  pdfjsWorker?: { readonly WorkerMessageHandler: typeof WorkerMessageHandler }
}
pdfjsGlobal.pdfjsWorker ??= { WorkerMessageHandler }

function displayDate(date: string): string {
  return date.replace(/-/g, '.')
}

function displayClock(value: string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function displayDuration(seconds: number, hourLabel: string, minuteLabel: string): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  return hours > 0 ? `${hours}${hourLabel}${String(minutes).padStart(2, '0')}${minuteLabel}` : `${minutes}${minuteLabel}`
}

function formatTextbookMarkdown(title: string, text: string): string {
  const body = text.replace(/\r\n/g, '\n').trim()
  return body === '' ? `# ${title.trim() || '教材资料'}\n` : `# ${title.trim() || '教材资料'}\n\n${body}\n`
}

function markdownChapterIndex(markdown: string): string {
  return markdown.split(/\r?\n/).map(line => line.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim()).filter((line): line is string => line !== undefined && line !== '').join('\n')
}

async function extractPdfText(file: File): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines: string[] = []
      let current = ''
      let previousY: number | undefined
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string' || item.str.trim() === '') continue
        const y = Array.isArray(item.transform) && typeof item.transform[5] === 'number' ? item.transform[5] : undefined
        if (previousY !== undefined && y !== undefined && Math.abs(previousY - y) > 4 && current.trim() !== '') {
          lines.push(current.trim())
          current = ''
        }
        current += `${current === '' ? '' : ' '}${item.str.trim()}`
        previousY = y
      }
      if (current.trim() !== '') lines.push(current.trim())
      pages.push(lines.join('\n'))
    }
    return pages.join('\n\n').trim()
  } finally {
    await pdf.destroy()
  }
}

function monthKeyFor(date: string): string {
  return date.slice(0, 7)
}

function shiftMonth(month: string, offset: number): string {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 1970, (value ?? 1) - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function calendarCells(month: string): readonly (string | undefined)[] {
  const [year, value] = month.split('-').map(Number)
  const monthIndex = (value ?? 1) - 1
  const firstWeekday = new Date(Date.UTC(year ?? 1970, monthIndex, 1)).getUTCDay()
  const leading = (firstWeekday + 6) % 7
  const count = new Date(Date.UTC(year ?? 1970, monthIndex + 1, 0)).getUTCDate()
  return Array.from({ length: leading + count }, (_, index) => index < leading
    ? undefined
    : `${month}-${String(index - leading + 1).padStart(2, '0')}`)
}

function sessionStatusClass(status: 'active' | 'paused' | 'completed' | undefined, completed: boolean): string {
  if (completed || status === 'completed') return 'complete'
  if (status === 'active' || status === 'paused') return 'inProgress'
  return 'incomplete'
}

function latestCompletedAt(tasks: readonly HomeworkTask[]): string | undefined {
  return tasks.map(task => task.completedAt).filter((value): value is string => value !== undefined).sort().at(-1)
}

type ConfirmTaskGroup = {
  readonly subject: HomeworkSubject
  readonly lesson: string
  readonly tasks: readonly HomeworkTask[]
}

function confirmLessonLabel(task: HomeworkTask, fallback: string): string {
  const reference = task.lessonReference?.trim()
  if (reference !== undefined && reference !== '') return reference
  const titleMatch = task.title.match(/第\s*[0-9一二三四五六七八九十百]+\s*课|《[^》]+》/)
  return titleMatch?.[0] ?? fallback
}

function groupConfirmTasks(tasks: readonly HomeworkTask[], fallback: string): ConfirmTaskGroup[] {
  const groups = new Map<string, { subject: HomeworkSubject; lesson: string; tasks: HomeworkTask[] }>()
  for (const task of tasks) {
    const lesson = confirmLessonLabel(task, fallback)
    const key = `${task.subject}:${lesson}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { subject: task.subject, lesson, tasks: [task] })
    else group.tasks.push(task)
  }
  return [...groups.values()]
}

function isConfirmSubject(value: unknown): value is HomeworkSubject {
  return typeof value === 'string' && CONFIRM_SUBJECTS.includes(value as HomeworkSubject)
}

function isConfirmTaskType(value: unknown): value is HomeworkTaskType {
  return typeof value === 'string' && CONFIRM_TASK_TYPES.includes(value as HomeworkTaskType)
}

function isConfirmAssistanceType(value: unknown): value is AssistanceType {
  return typeof value === 'string' && CONFIRM_ASSISTANCE_TYPES.includes(value as AssistanceType)
}

/** Rebuild a task with the current wire fields so old/model drafts can still be confirmed. */
function normalizeConfirmTasks(tasks: readonly HomeworkTask[], emptyTitle: string): HomeworkTask[] {
  return tasks.map((task, index) => {
    const raw = task as HomeworkTask & { readonly assistanceTypes?: unknown }
    const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title : emptyTitle
    const assistanceTypes = Array.isArray(raw.assistanceTypes)
      ? [...new Set(raw.assistanceTypes.filter(isConfirmAssistanceType))]
      : []
    const requiresParentAssistance = raw.requiresParentAssistance === true || assistanceTypes.includes('parent_assistance')
    const requiresParentSignature = raw.requiresParentSignature === true || assistanceTypes.includes('parent_signature')
    if (requiresParentAssistance && !assistanceTypes.includes('parent_assistance')) assistanceTypes.push('parent_assistance')
    if (requiresParentSignature && !assistanceTypes.includes('parent_signature')) assistanceTypes.push('parent_signature')
    const normalized = {
      id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `confirm-task-${index + 1}`,
      importId: typeof raw.importId === 'string' && raw.importId !== '' ? raw.importId : `import-${Date.now()}`,
      subject: isConfirmSubject(raw.subject) ? raw.subject : 'other',
      title,
      taskType: isConfirmTaskType(raw.taskType) ? raw.taskType : 'other',
      sourceReference: typeof raw.sourceReference === 'string' && raw.sourceReference !== '' ? raw.sourceReference : title,
      requiresParentAssistance,
      requiresParentSignature,
      assistanceTypes,
      missingInformation: raw.missingInformation === true,
      status: raw.status === 'done' || raw.status === 'in_progress' ? raw.status : 'todo',
      confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0.65,
      ...(typeof raw.description === 'string' && raw.description !== '' ? { description: raw.description } : {}),
      ...(typeof raw.dueLabel === 'string' && raw.dueLabel !== '' ? { dueLabel: raw.dueLabel } : {}),
      ...(typeof raw.recurrence === 'string' && raw.recurrence !== '' ? { recurrence: raw.recurrence } : {}),
      ...(typeof raw.missingInformationReason === 'string' && raw.missingInformationReason !== '' ? { missingInformationReason: raw.missingInformationReason } : {}),
      ...(typeof raw.completedAt === 'string' && raw.completedAt !== '' ? { completedAt: raw.completedAt } : {}),
      ...(typeof raw.estimatedMinutes === 'number' && Number.isFinite(raw.estimatedMinutes) ? { estimatedMinutes: raw.estimatedMinutes } : {}),
      ...(typeof raw.textbookProfileId === 'string' && raw.textbookProfileId !== '' ? { textbookProfileId: raw.textbookProfileId } : {}),
      ...(raw.textbookMatchStatus === 'unmatched' || raw.textbookMatchStatus === 'suggested' || raw.textbookMatchStatus === 'confirmed' ? { textbookMatchStatus: raw.textbookMatchStatus } : {}),
      ...(typeof raw.lessonReference === 'string' && raw.lessonReference !== '' ? { lessonReference: raw.lessonReference } : {}),
    } satisfies HomeworkTask
    return normalized
  })
}

export function EducationShell({ homework, t }: EducationShellProps) {
  const state = homework.useHomework()
  const sampleText = t('add.sampleText')
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<HomeworkTask[]>([])
  const [editingTaskId, setEditingTaskId] = useState<string>()
  const [page, setPage] = useState<'home' | 'add' | 'confirm' | 'textbook' | 'chapter' | 'subject' | 'study' | 'history' | 'settings'>('home')
  const [emptyPromptDismissed, setEmptyPromptDismissed] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<'preparing' | 'model' | 'organizing'>('preparing')
  const [coach, setCoach] = useState<{ title: string; guidance: string; aiUsed: boolean; model?: string; warning?: string } | undefined>()
  const [textbookSubject, setTextbookSubject] = useState<HomeworkSubject>('chinese')
  const [textbookTitle, setTextbookTitle] = useState('')
  const [publisher, setPublisher] = useState('')
  const [grade, setGrade] = useState('七年级')
  const [term, setTerm] = useState('上册')
  const [chapterIndex, setChapterIndex] = useState('')
  const [sourceFileName, setSourceFileName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [textbookDialogOpen, setTextbookDialogOpen] = useState(false)
  const [textbookFileLoading, setTextbookFileLoading] = useState(false)
  const [textbookMarkdown, setTextbookMarkdown] = useState('')
  const [textbookFileError, setTextbookFileError] = useState('')
  const [selectedTextbook, setSelectedTextbook] = useState<TextbookProfile>()
  const [selectedChapter, setSelectedChapter] = useState<TextbookChapter>()
  const [studyMode, setStudyMode] = useState<StudyMode>('preview')
  const [studyOrigin, setStudyOrigin] = useState<'study' | 'textbook'>('textbook')
  const [selectedSubject, setSelectedSubject] = useState<HomeworkSubject>()
  const [pendingSubjectSwitch, setPendingSubjectSwitch] = useState<{ subject: HomeworkSubject; activeSubject: HomeworkSubject }>()
  const [historyDays, setHistoryDays] = useState<readonly HomeworkDaySummary[]>([])
  const [historyDate, setHistoryDate] = useState(dateKey)
  const [historyMonth, setHistoryMonth] = useState(() => monthKeyFor(dateKey))
  const [historyOnlyIncomplete, setHistoryOnlyIncomplete] = useState(false)
  const [historyDay, setHistoryDay] = useState<HomeworkDay>()
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDayLoading, setHistoryDayLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const tasks = state.status === 'ready' ? state.day.tasks : []
  const groups = useMemo(() => [...new Set(tasks.map(task => task.subject))], [tasks])
  const confirmSubjects = useMemo(() => [...new Set(draft.map(task => task.subject))], [draft])
  const historyTasks = useMemo(() => historyDay?.tasks.filter(task => !historyOnlyIncomplete || task.status !== 'done') ?? [], [historyDay?.tasks, historyOnlyIncomplete])
  const visibleHistoryDays = useMemo(() => historyOnlyIncomplete ? historyDays.filter(day => day.incompleteTasks > 0) : historyDays, [historyDays, historyOnlyIncomplete])
  const historySubjects = useMemo(() => {
    const subjects = new Set<HomeworkSubject>(historyTasks.map(task => task.subject))
    for (const session of historyDay?.sessions ?? []) subjects.add(session.subject)
    return [...subjects]
  }, [historyDay?.sessions, historyTasks])
  const historyTotalSeconds = useMemo(() => (historyDay?.sessions ?? []).reduce((total, session) => total + session.activeSeconds, 0), [historyDay?.sessions])
  const historyDayStatus = historyDay === undefined
    ? ''
    : historyDay.tasks.length > 0 && historyDay.tasks.every(task => task.status === 'done')
      ? t('history.statusComplete')
      : historyDay.tasks.some(task => task.status === 'done')
        ? t('history.statusInProgress')
        : t('history.statusIncomplete')
  const historyCalendarCells = useMemo(() => calendarCells(historyMonth), [historyMonth])
  const labels: Record<HomeworkSubject, string> = {
    chinese: t('subject.chinese'), math: t('subject.math'), english: t('subject.english'), biology: t('subject.biology'), history: t('subject.history'), geography: t('subject.geography'), other: t('subject.other'),
  }
  useEffect(() => {
    if (state.status === 'ready' && tasks.length === 0 && page === 'home' && !emptyPromptDismissed) setPage('add')
  }, [emptyPromptDismissed, page, state.status, tasks.length])
  useEffect(() => {
    if (page !== 'history') return
    setHistoryLoading(true)
    setHistoryError('')
    void homework.listHistory().then(days => setHistoryDays(days)).catch(reason => setHistoryError(reason instanceof Error ? reason.message : t('history.loadError'))).finally(() => setHistoryLoading(false))
  }, [homework, page, t])
  if (state.status === 'loading') return <div className={css.shell}><div className={css.main}><section className={css.form}><h1>{t('load.title')}</h1><p className={css.muted}>{t('load.body')}</p></section></div></div>
  if (state.status === 'error') return <div className={css.shell}><div className={css.main}><section className={css.form}><h1>{t('load.failed')}</h1><p className={css.error}>{state.message}</p><div className={css.actions}><button className={css.primary} onClick={homework.retry}>{t('load.retry')}</button></div></section></div></div>
  const day = state.day
  const parse = async (): Promise<void> => {
    setError('')
    setAnalyzing(true)
    setAnalysisStage('preparing')
    const result = parseHomeworkMessage(text, new Date().toISOString(), `import-${Date.now()}`)
    try {
      setAnalysisStage('model')
      const analysis = await homework.analyze({ rawText: text, textbookProfiles: day.textbooks })
      if (analysis.tasks.length === 0) { setError(t('add.aiNoTasks')); return }
      setAnalysisStage('organizing')
      setDraft([...analysis.tasks]); setPage('confirm')
    } catch {
      if (result.tasks.length === 0) { setError(t('add.aiUnavailable')); return }
      setDraft([...result.tasks]); setPage('confirm')
    }
    finally { setAnalyzing(false) }
  }
  const confirm = async (): Promise<void> => {
    setSaving(true); setError('')
    try {
      const profileIdsBySubject: Partial<Record<HomeworkSubject, string>> = {}
      for (const profile of day.textbooks) {
        if (profile.catalogStatus !== 'needs_confirmation') profileIdsBySubject[profile.subject] = profile.id
      }
      const analyzedTasks = normalizeConfirmTasks(draft, t('confirm.emptyTask'))
      await homework.confirmImport({ dateKey, importId: analyzedTasks[0]?.importId ?? `import-${Date.now()}`, rawText: text, source: 'manual', textbookProfileIdsBySubject: profileIdsBySubject, analyzedTasks })
      setText(''); setDraft([]); setPage('home'); setNotice(t('notice.saved'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('error.save')) }
    finally { setSaving(false) }
  }
  const openTextbookDialog = (): void => {
    setError(''); setTextbookFileError(''); setTextbookSubject('chinese'); setTextbookTitle(''); setPublisher(''); setGrade('七年级'); setTerm('上册'); setChapterIndex(''); setSourceFileName(''); setSourceUrl(''); setTextbookMarkdown(''); setTextbookDialogOpen(true)
  }
  const onTextbookFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    const inferredTitle = file.name.replace(/\.(pdf|txt|md)$/i, '')
    setSourceFileName(file.name); setTextbookFileError(''); setTextbookMarkdown(''); setTextbookFileLoading(true)
    if (textbookTitle.trim() === '') setTextbookTitle(inferredTitle)
    try {
      const source = file.name.toLowerCase().endsWith('.pdf') ? await extractPdfText(file) : await file.text()
      if (source.trim() === '') throw new Error(t('textbook.fileNoText'))
      const markdown = formatTextbookMarkdown(textbookTitle || inferredTitle, source)
      setTextbookMarkdown(markdown)
      if (chapterIndex.trim() === '') setChapterIndex(markdownChapterIndex(markdown))
    } catch (reason) {
      setTextbookFileError(reason instanceof Error ? reason.message : t('textbook.fileReadError'))
    } finally { setTextbookFileLoading(false) }
  }
  const downloadTextbookMarkdown = (): void => {
    if (textbookMarkdown.trim() === '') return
    const url = URL.createObjectURL(new Blob([textbookMarkdown], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `${(textbookTitle || '教材资料').trim()}.md`; link.click(); URL.revokeObjectURL(url)
  }
  const toggle = async (task: HomeworkTask): Promise<void> => {
    try { await homework.updateTaskStatus(dateKey, task.id, task.status === 'done' ? 'todo' : 'done') }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('error.update')) }
  }
  const saveTextbook = async (): Promise<void> => {
    if (!textbookTitle.trim() || !publisher.trim()) { setError(t('error.textbookRequired')); return }
    const trimmedSourceUrl = sourceUrl.trim()
    if (trimmedSourceUrl !== '') {
      try {
        const parsedSourceUrl = new URL(trimmedSourceUrl)
        if (parsedSourceUrl.protocol !== 'http:' && parsedSourceUrl.protocol !== 'https:') {
          setError(t('error.textbookSourceUrl'))
          return
        }
      } catch {
        setError(t('error.textbookSourceUrl'))
        return
      }
    }
    setSaving(true); setError('')
    try {
      const chapter = chapterIndex.trim()
      const source = sourceFileName.trim()
      await homework.saveTextbook({
        dateKey,
        profile: {
          id: `textbook-${textbookSubject}`,
          subject: textbookSubject,
          grade,
          term,
          publisher: publisher.trim(),
          edition: publisher.trim(),
          volume: term,
          title: textbookTitle.trim(),
          ...(chapter ? { chapterIndex: chapter } : {}),
          ...(source ? { sourceFileName: source } : {}),
          ...(trimmedSourceUrl ? { sourceUrl: trimmedSourceUrl } : {}),
        },
      })
      setTextbookDialogOpen(false); setPage('home'); setNotice(t('notice.textbookSaved').replace('{subject}', labels[textbookSubject]))
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('error.save')) }
    finally { setSaving(false) }
  }
  const confirmStopActiveSubject = async (): Promise<boolean> => {
    if (page !== 'subject' || selectedSubject === undefined) return true
    const active = day.sessions?.find(session => session.subject === selectedSubject && session.status === 'active')
    if (active === undefined) return true
    if (!window.confirm(t('session.leaveConfirm').replace('{subject}', labels[selectedSubject]))) return false
    try {
      await homework.finishSubjectSession({ dateKey, subject: selectedSubject })
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('session.error'))
      return false
    }
  }
  const openHome = async (): Promise<void> => { if (!(await confirmStopActiveSubject())) return; setEmptyPromptDismissed(true); setPage('home') }
  const openAdd = async (): Promise<void> => { if (!(await confirmStopActiveSubject())) return; setError(''); setText(''); setPage('add') }
  const openTextbooks = async (): Promise<void> => { if (!(await confirmStopActiveSubject())) return; setError(''); setPage('textbook') }
  const openStudy = async (): Promise<void> => { if (!(await confirmStopActiveSubject())) return; setError(''); setPage('study') }
  const openHistory = async (): Promise<void> => { if (!(await confirmStopActiveSubject())) return; setHistoryError(''); setHistoryDay(undefined); setHistoryMonth(monthKeyFor(historyDate)); setPage('history') }
  const openSettings = async (): Promise<void> => { if (!(await confirmStopActiveSubject())) return; setError(''); setPage('settings') }
  const openChapter = (book: TextbookProfile, chapter: TextbookChapter, mode?: StudyMode): void => { setError(''); setStudyOrigin(mode === undefined ? 'textbook' : 'study'); setStudyMode(mode ?? 'preview'); setSelectedTextbook(book); setSelectedChapter(chapter); setPage('chapter') }
  const startSubject = async (subject: HomeworkSubject): Promise<void> => {
    setError('')
    setSelectedSubject(subject)
    setPage('subject')
    try { await homework.startSubjectSession({ dateKey, subject }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('session.error')) }
  }
  const openSubject = async (subject: HomeworkSubject): Promise<void> => {
    const active = day.sessions?.find(session => session.status === 'active' && session.subject !== subject)
    if (active !== undefined) {
      setPendingSubjectSwitch({ subject, activeSubject: active.subject })
      return
    }
    await startSubject(subject)
  }
  const confirmSubjectSwitch = async (): Promise<void> => {
    const pending = pendingSubjectSwitch
    setPendingSubjectSwitch(undefined)
    if (pending !== undefined) await startSubject(pending.subject)
  }
  const openSubjectChapter = async (): Promise<void> => {
    const subject = selectedSubject
    if (subject === undefined || !(await confirmStopActiveSubject())) return
    const subjectTasks = day.tasks.filter(task => task.subject === subject)
    const linkedBook = subjectTasks.find(task => task.textbookProfileId !== undefined)?.textbookProfileId
    const book = linkedBook === undefined ? day.textbooks.find(item => item.subject === subject && item.catalogStatus !== 'needs_confirmation') : day.textbooks.find(item => item.id === linkedBook)
    if (book === undefined) return
    const chapter = parseTextbookChapters(book).find(item => subjectTasks.some(task => (task.lessonReference ?? task.title).includes(item.title)))
    if (chapter !== undefined) openChapter(book, chapter)
  }
  const loadHistoryDay = async (key: string): Promise<void> => {
    setHistoryDate(key)
    setHistoryDayLoading(true)
    setHistoryError('')
    try { setHistoryDay(await homework.getDay(key)) }
    catch (reason) { setHistoryDay(undefined); setHistoryError(reason instanceof Error ? reason.message : t('history.loadError')) }
    finally { setHistoryDayLoading(false) }
  }
  const toggleHistoryTask = async (task: HomeworkTask): Promise<void> => {
    if (historyDay === undefined) return
    try {
      const updated = await homework.updateTaskStatus(historyDay.dateKey, task.id, task.status === 'done' ? 'todo' : 'done')
      setHistoryDay(updated)
      setHistoryDays(days => days.map(day => day.dateKey !== updated.dateKey ? day : { ...day, totalTasks: updated.tasks.length, completedTasks: updated.tasks.filter(item => item.status === 'done').length, incompleteTasks: updated.tasks.filter(item => item.status !== 'done').length }))
    } catch (reason) { setHistoryError(reason instanceof Error ? reason.message : t('error.update')) }
  }
  const updateDraftTask = (taskId: string, patch: Partial<HomeworkTask>): void => {
    setDraft(current => current.map(task => task.id === taskId ? { ...task, ...patch } : task))
  }
  const updateDraftParentFlag = (task: HomeworkTask, field: 'requiresParentAssistance' | 'requiresParentSignature', enabled: boolean): void => {
    const type = field === 'requiresParentAssistance' ? 'parent_assistance' : 'parent_signature'
    const assistanceTypes = new Set(task.assistanceTypes)
    if (enabled) assistanceTypes.add(type)
    else assistanceTypes.delete(type)
    updateDraftTask(task.id, { [field]: enabled, assistanceTypes: [...assistanceTypes] })
  }
  const removeDraftTask = (taskId: string): void => {
    setDraft(current => current.filter(task => task.id !== taskId))
  }
  const addDraftTask = (): void => {
    const importId = draft[0]?.importId ?? `import-${Date.now()}`
    const id = `${importId}-manual-${Date.now()}`
    setDraft(current => [...current, {
      id,
      importId,
      subject: 'other',
      title: '',
      taskType: 'other',
      sourceReference: '手动添加',
      requiresParentAssistance: false,
      requiresParentSignature: false,
      assistanceTypes: [],
      missingInformation: false,
      status: 'todo',
      confidence: 1,
      lessonReference: '',
    }])
    setEditingTaskId(id)
  }
  const renderTaskRow = (task: HomeworkTask, onToggle: (task: HomeworkTask) => Promise<void>) => <label className={task.status === 'done' ? css.taskDone : css.task} key={task.id}><input type="checkbox" checked={task.status === 'done'} onChange={() => void onToggle(task)} /><span>{task.title}</span>{(task.dueLabel || task.status === 'done') && <span className={css.taskMeta}>{task.dueLabel && <em>{task.dueLabel}</em>}{task.status === 'done' && <small className={css.done}>{task.completedAt ? `${t('task.done')} (${displayClock(task.completedAt)})` : t('task.done')}</small>}</span>}{task.requiresParentAssistance && <small className={css.parentBadge}>{t('task.parentAssistance')}</small>}{task.missingInformation && <small>{t('task.missing').replace('{reason}', task.missingInformationReason ?? '')}</small>}</label>
  const renderGroupedTaskRows = (subjectTasks: readonly HomeworkTask[], onToggle: (task: HomeworkTask) => Promise<void>): ReactNode => {
    const fallback = t('confirm.groupUnspecified')
    const lessonGroups = groupConfirmTasks(subjectTasks, fallback)
    return <div className={css.subjectLessonList}>{lessonGroups.map(group => <div className={css.subjectLesson} key={`${group.subject}:${group.lesson}`}>
      {group.lesson !== fallback && <h3 className={css.subjectLessonHeading}>{group.lesson}</h3>}
      {group.tasks.map(task => renderTaskRow(task, onToggle))}
    </div>)}</div>
  }
  const renderConfirmTask = (task: HomeworkTask) => {
    const editing = editingTaskId === task.id
    return <div className={`${confirmCss.confirmTask} ${editing ? confirmCss.confirmTaskEditing : ''}`} key={task.id}>
      {editing ? <div className={confirmCss.confirmTaskEditor}>
        <label className={confirmCss.confirmTaskField}><span>{t('confirm.editTitle')}</span><textarea rows={2} value={task.title} onChange={event => updateDraftTask(task.id, { title: event.target.value })} /></label>
        <div className={confirmCss.confirmTaskFields}>
          <label className={confirmCss.confirmTaskField}><span>{t('confirm.editSubject')}</span><select value={task.subject} onChange={event => updateDraftTask(task.id, { subject: event.target.value as HomeworkSubject })}>{(Object.entries(labels) as Array<[HomeworkSubject, string]>).map(([subject, label]) => <option key={subject} value={subject}>{label}</option>)}</select></label>
          <label className={confirmCss.confirmTaskField}><span>{t('confirm.editLesson')}</span><input value={task.lessonReference ?? ''} placeholder={t('confirm.lessonPlaceholder')} onChange={event => updateDraftTask(task.id, { lessonReference: event.target.value })} /></label>
        </div>
        <div className={confirmCss.confirmTaskFlags}>
          <label><input type="checkbox" checked={task.requiresParentAssistance} onChange={event => updateDraftParentFlag(task, 'requiresParentAssistance', event.target.checked)} />{t('confirm.parentAssistance')}</label>
          <label><input type="checkbox" checked={task.requiresParentSignature} onChange={event => updateDraftParentFlag(task, 'requiresParentSignature', event.target.checked)} />{t('confirm.parentSignature')}</label>
        </div>
      </div> : <div className={confirmCss.confirmTaskSummary}><strong>{task.title || t('confirm.emptyTask')}</strong><div className={confirmCss.confirmTaskBadges}>{task.requiresParentAssistance && <span>{t('confirm.parentAssistance')}</span>}{task.requiresParentSignature && <span>{t('confirm.parentSignature')}</span>}{task.lessonReference && <span>{task.lessonReference}</span>}</div></div>}
      <div className={confirmCss.confirmTaskActions}><button type="button" className={confirmCss.confirmIconButton} aria-label={editing ? t('confirm.doneEditing') : t('confirm.edit')} title={editing ? t('confirm.doneEditing') : t('confirm.edit')} onClick={() => setEditingTaskId(editing ? undefined : task.id)}>{editing ? '✓' : <IconEditOutline16 size={16} />}</button><button type="button" className={`${confirmCss.confirmIconButton} ${confirmCss.confirmIconDanger}`} aria-label={t('confirm.remove')} title={t('confirm.remove')} onClick={() => { removeDraftTask(task.id); if (editing) setEditingTaskId(undefined) }}><IconTrashOutline16 size={16} /></button></div>
      {!editing && task.missingInformation && <small>{t('task.missing').replace('{reason}', task.missingInformationReason ?? '')}</small>}
    </div>
  }
  const processingMessage = analysisStage === 'preparing' ? t('add.processingPreparing') : analysisStage === 'model' ? t('add.processingModel') : t('add.processingOrganizing')
  return <div className={css.shell} data-education-shell>
    <header className={css.topbar}><strong>{t('app.name')}</strong><nav><button className={page === 'home' || page === 'subject' ? css.activeNav : ''} onClick={openHome}>{t('nav.home')}</button><button className={page === 'study' ? css.activeNav : ''} onClick={openStudy}>{t('nav.study')}</button><button className={page === 'history' ? css.activeNav : ''} onClick={openHistory}>{t('nav.history')}</button><button className={page === 'add' ? css.activeNav : ''} onClick={openAdd}>{t('nav.add')}</button><button className={page === 'textbook' || page === 'chapter' ? css.activeNav : ''} onClick={openTextbooks}>{t('nav.textbooks')}</button><button className={page === 'settings' ? css.activeNav : ''} onClick={openSettings}>{t('nav.settings')}</button></nav><span>{t('app.student')}</span></header>
    <main className={css.main}>
      {page === 'home' && <><div className={css.hero}><div><h1>{t('home.title')}</h1><span>{t('home.completed').replace('{done}', String(tasks.filter(task => task.status === 'done').length)).replace('{total}', String(tasks.length))}</span></div><button className={css.primary} onClick={openAdd}>{t('home.add')}</button></div><div className={css.subjectGrid}>{groups.length === 0 && <section className={css.empty}><h2>{t('home.emptyTitle')}</h2><button className={css.primary} onClick={openAdd}>{t('home.add')}</button></section>}{groups.map((subject) => { const subjectTasks = tasks.filter(task => task.subject === subject); const session = day.sessions?.find(item => item.subject === subject); const actionLabel = session?.status === 'completed' && subjectTasks.every(task => task.status === 'done') ? t('session.view') : session === undefined ? t('session.start') : t('session.resume'); return <section className={css.subject} key={subject}><div className={css.subjectTitle}><h2>{labels[subject]}</h2><span>{subjectTasks.filter(task => task.status === 'done').length} / {subjectTasks.length}</span></div><div className={css.subjectAction}><button className={css.subjectStartButton} onClick={() => void openSubject(subject)}>{actionLabel}</button></div>{renderGroupedTaskRows(subjectTasks, toggle)}</section> })}</div></>}
      {page === 'subject' && selectedSubject !== undefined && <>{error !== '' && <p className={css.error}>{error}</p>}<SubjectHomeworkPage dateKey={dateKey} subject={selectedSubject} day={day} labels={labels} homework={homework} t={t} onBack={openHome} onOpenChapter={openSubjectChapter} /></>}
      {page === 'study' && <StudyPage day={day} labels={labels} mode={studyMode} t={t} onModeChange={setStudyMode} onStartChapter={(book, chapter) => openChapter(book, chapter, studyMode)} />}
      {page === 'history' && <section className={css.historyPage}>
        <div className={css.hero}><div><p className={css.kicker}>{t('history.kicker')}</p><h1>{t('history.title')}</h1><span>{t('history.description')}</span></div></div>
        <div className={css.historyToolbar}><label>{t('history.date')}<input type="date" value={historyDate} onChange={(event) => { setHistoryDate(event.target.value); setHistoryMonth(monthKeyFor(event.target.value)) }} /></label><button className={css.primary} disabled={historyDate === '' || historyDayLoading} onClick={() => void loadHistoryDay(historyDate)}>{historyDayLoading ? t('history.loadingDay') : t('history.viewDay')}</button><label className={css.historyToggle}><input type="checkbox" checked={historyOnlyIncomplete} onChange={event => setHistoryOnlyIncomplete(event.target.checked)} />{t('history.onlyIncomplete')}</label></div>
        {historyError !== '' && <p className={css.error}>{historyError}</p>}
        {historyLoading ? <p className={css.muted}>{t('history.loading')}</p> : <>
          <section className={css.calendarPanel} aria-label={t('history.title')}>
            <div className={css.calendarHeader}><button type="button" aria-label={t('history.calendarPrev')} onClick={() => setHistoryMonth(month => shiftMonth(month, -1))}>‹</button><strong>{t('history.monthLabel').replace('{year}', historyMonth.slice(0, 4)).replace('{month}', historyMonth.slice(5, 7))}</strong><button type="button" aria-label={t('history.calendarNext')} onClick={() => setHistoryMonth(month => shiftMonth(month, 1))}>›</button><button type="button" className={css.calendarToday} onClick={() => { setHistoryMonth(monthKeyFor(dateKey)); setHistoryDate(dateKey); void loadHistoryDay(dateKey) }}>{t('history.calendarToday')}</button></div>
            <div className={css.calendarWeekdays}>{(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(dayName => <span key={dayName}>{t(`history.weekday.${dayName}`)}</span>)}</div>
            <div className={css.calendarGrid}>{historyCalendarCells.map((key, index) => { const summary = key === undefined ? undefined : historyDays.find(day => day.dateKey === key); const status = summary === undefined ? 'empty' : summary.incompleteTasks === 0 ? 'complete' : summary.completedTasks > 0 ? 'inProgress' : 'incomplete'; const statusClass = status === 'complete' ? css.historyStatusComplete : status === 'inProgress' ? css.historyStatusInProgress : status === 'incomplete' ? css.historyStatusIncomplete : css.historyStatusEmpty; return key === undefined ? <span className={css.calendarBlank} key={`blank-${index}`} /> : <button type="button" aria-label={displayDate(key)} className={`${css.calendarDay} ${historyDate === key ? css.calendarDaySelected : ''}`} key={key} onClick={() => void loadHistoryDay(key)}><strong>{Number(key.slice(-2))}</strong><span className={`${css.calendarStatusIcon} ${statusClass}`} aria-hidden="true" />{summary === undefined ? <small>{t('history.calendarNoRecord')}</small> : <small>{summary.completedTasks}/{summary.totalTasks}</small>}</button> })}</div>
            <div className={css.calendarLegend}><span><i className={`${css.calendarStatusIcon} ${css.historyStatusComplete}`} />{t('history.calendarLegendComplete')}</span><span><i className={`${css.calendarStatusIcon} ${css.historyStatusIncomplete}`} />{t('history.calendarLegendIncomplete')}</span><span><i className={`${css.calendarStatusIcon} ${css.historyStatusInProgress}`} />{t('history.calendarLegendInProgress')}</span></div>
          </section>
          {visibleHistoryDays.length === 0 && <section className={css.empty}><h2>{t(historyOnlyIncomplete ? 'history.emptyIncomplete' : 'history.empty')}</h2></section>}
        </>}
        {historyDay !== undefined && <section className={css.historyDay}>
          <div className={css.historyDayHeader}><div><p className={css.kicker}>{t('history.selectedDay')}</p><h2>{displayDate(historyDay.dateKey)}</h2></div><div className={css.historyDaySummary}><span>{historyDay.tasks.filter(task => task.status === 'done').length} / {historyDay.tasks.length} {historyDayStatus}</span><strong>{t('history.totalTime')} {displayDuration(historyTotalSeconds, t('history.hour'), t('history.minute'))}</strong></div></div>
          {historySubjects.length === 0 ? <p className={css.muted}>{t(historyOnlyIncomplete ? 'history.noIncompleteTasks' : 'history.noTasks')}</p> : <div className={css.historySubjectList}>{historySubjects.map((subject) => { const subjectTasks = historyTasks.filter(task => task.subject === subject); const subjectSession = historyDay.sessions?.find(session => session.subject === subject); const allSubjectTasks = historyDay.tasks.filter(task => task.subject === subject); const completedCount = allSubjectTasks.filter(task => task.status === 'done').length; const totalCount = allSubjectTasks.length; const subjectStatus = sessionStatusClass(subjectSession?.status, totalCount > 0 && completedCount === totalCount); const statusLabel = subjectStatus === 'complete' ? t('history.statusComplete') : subjectStatus === 'inProgress' ? t('history.statusInProgress') : t('history.statusIncomplete'); const subjectEndAt = subjectSession?.endedAt ?? latestCompletedAt(allSubjectTasks) ?? subjectSession?.updatedAt; return <article className={css.historySubjectCard} key={subject}><div className={css.subjectTitle}><h3>{labels[subject]}</h3><span>{completedCount} / {totalCount}</span></div><div className={css.historySubjectMeta}><span><i className={`${css.calendarStatusIcon} ${subjectStatus === 'complete' ? css.historyStatusComplete : subjectStatus === 'inProgress' ? css.historyStatusInProgress : css.historyStatusIncomplete}`} />{statusLabel}</span><span>{displayDuration(subjectSession?.activeSeconds ?? 0, t('history.hour'), t('history.minute'))}</span>{subjectSession !== undefined && <span>{t('history.sessionRange').replace('{start}', displayClock(subjectSession.startedAt)).replace('{end}', displayClock(subjectEndAt))}</span>}</div>{subjectTasks.length === 0 ? <p className={css.muted}>{t('history.noIncompleteTasks')}</p> : renderGroupedTaskRows(subjectTasks, toggleHistoryTask)}</article> })}</div>}
        </section>}
      </section>}
      {page === 'add' && <section className={css.form}><p className={css.kicker}>{t('add.kicker')}</p><h1>{t('add.title')}</h1><div className={css.inputModes}><button type="button" onClick={() => setText(sampleText)}>{t('add.sample')}</button><label className={css.fileButton}>{t('add.attach')}<input type="file" accept="image/*,.txt,.md" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSourceFileName(file.name); if (file.type.startsWith('text/')) void file.text().then(setText); else setText(`${text}\n[已上传图片：${file.name}，请确认图片中的作业原文]`) } }} /></label></div><textarea value={text} onChange={event => setText(event.target.value)} placeholder={t('add.placeholder')} />{error && <p className={css.error}>{error}</p>}<div className={css.actions}><button onClick={() => setPage('home')}>{t('add.cancel')}</button><button className={css.primary} disabled={!text.trim() || analyzing} onClick={() => void parse()}>{analyzing ? t('add.analyzing') : t('add.organize')}</button></div></section>}
      {page === 'confirm' && <section className={`${css.form} ${confirmCss.confirmForm}`}><p className={css.kicker}>{t('confirm.kicker')}</p><h1>{t('confirm.title')}</h1><div className={confirmCss.confirmWorkspace}>{confirmSubjects.map((subject) => { const subjectTasks = draft.filter(task => task.subject === subject); return <section className={confirmCss.confirmSubjectRow} key={subject}><div className={confirmCss.confirmSubjectColumn}><strong>{labels[subject]}</strong><small>{t('confirm.groupTasks').replace('{count}', String(subjectTasks.length))}</small></div><div className={confirmCss.confirmSubjectPanel}><div className={confirmCss.confirmGroups}>{groupConfirmTasks(subjectTasks, t('confirm.groupUnspecified')).map(group => <section className={confirmCss.confirmGroup} key={`${group.subject}:${group.lesson}`}><div className={confirmCss.confirmGroupHeader}>{group.lesson !== t('confirm.groupUnspecified') && <h2>{group.lesson}</h2>}</div>{group.tasks.map(renderConfirmTask)}</section>)}</div></div></section>})}</div><button type="button" className={confirmCss.confirmAddIcon} aria-label={t('confirm.addTask')} title={t('confirm.addTask')} onClick={addDraftTask}><IconPlusOutline16 size={16} /></button>{error && <p className={css.error}>{error}</p>}<div className={css.actions}><button onClick={() => setPage('add')}>{t('confirm.back')}</button><button className={css.primary} disabled={saving} onClick={() => void confirm()}>{saving ? t('confirm.saving') : t('confirm.save')}</button></div></section>}
      {page === 'textbook' && <section className={`${css.form} ${css.textbookPage}`}><p className={css.kicker}>{t('textbook.kicker')}</p><h1>{t('textbook.title')}</h1><p className={css.muted}>{t('textbook.description')}</p><div className={css.bookForm}><label>{t('textbook.subject')}<select value={textbookSubject} onChange={event => setTextbookSubject(event.target.value as HomeworkSubject)}>{(Object.entries(labels) as Array<[HomeworkSubject, string]>).filter(([key]) => key !== 'other').map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>{t('textbook.name')}<input value={textbookTitle} onChange={event => setTextbookTitle(event.target.value)} placeholder={t('textbook.namePlaceholder')} /></label><label>{t('textbook.publisher')}<input value={publisher} onChange={event => setPublisher(event.target.value)} placeholder={t('textbook.publisherPlaceholder')} /></label><label>{t('textbook.grade')}<input value={grade} onChange={event => setGrade(event.target.value)} /></label><label>{t('textbook.volume')}<input value={term} onChange={event => setTerm(event.target.value)} /></label><label>{t('textbook.chapterIndex')}<textarea value={chapterIndex} onChange={event => setChapterIndex(event.target.value)} placeholder={t('textbook.chapterPlaceholder')} /></label><label>{t('textbook.source')}<input value={sourceFileName} onChange={event => setSourceFileName(event.target.value)} placeholder={t('textbook.sourcePlaceholder')} /></label></div>{error && <p className={css.error}>{error}</p>}<div className={css.actions}><button onClick={() => setPage('home')}>{t('textbook.back')}</button><button className={css.primary} disabled={saving} onClick={() => void saveTextbook()}>{saving ? t('textbook.saving') : t('textbook.save')}</button></div>{day.textbooks.length > 0 && <div className={css.savedBooks}><h2>{t('textbook.saved')}</h2>{day.textbooks.map((book) => { const chapters = parseTextbookChapters(book); return <div className={css.savedBook} key={book.id}><div className={css.savedBookHeader}><strong>{labels[book.subject]} · {book.title}</strong><span>{book.publisher}{book.catalogStatus === 'needs_confirmation' ? ` · ${t('textbook.pendingVerify')}` : book.catalogStatus === 'preset' ? ` · ${t('textbook.preset')}` : ''}</span></div>{book.sourceUrl && <a href={book.sourceUrl} target="_blank" rel="noreferrer">{t('textbook.openSource')}</a>}{chapters.length === 0 ? <p className={css.muted}>{t('textbook.noChapters')}</p> : <div className={css.chapterList}>{chapters.map(chapter => <button key={chapter.id} onClick={() => openChapter(book, chapter)}><span>{chapter.lessonNumber ? `${chapter.lessonNumber} ` : ''}{chapter.title}</span><small>{chapter.unitTitle}</small></button>)}</div>}</div> })}</div>}</section>}
      {page === 'chapter' && selectedTextbook !== undefined && selectedChapter !== undefined && <ChapterStudyPage dateKey={dateKey} textbook={selectedTextbook} chapter={selectedChapter} mode={studyMode} homework={homework} t={t} onBack={studyOrigin === 'study' ? openStudy : openTextbooks} />}
      {page === 'settings' && <section className={css.settingsPage}><h1>{t('settings.title')}</h1><div className={css.settingsList}><button onClick={openTextbooks}>{t('settings.textbooks')}</button><button onClick={homework.openModelSettings}>{t('settings.models')}</button></div></section>}
      {notice && <div className={css.notice} role="status">{notice}<button onClick={() => setNotice('')}>{t('notice.close')}</button></div>}
      {pendingSubjectSwitch !== undefined && <div className={css.sessionConfirmOverlay} role="presentation"><div className={css.sessionConfirmDialog} role="dialog" aria-modal="true" aria-labelledby="session-switch-title"><h2 id="session-switch-title">{t('session.switchTitle')}</h2><p>{t('session.switchConfirm').replace('{subject}', labels[pendingSubjectSwitch.activeSubject])}</p><div className={css.sessionConfirmActions}><button type="button" onClick={() => setPendingSubjectSwitch(undefined)}>{t('session.switchCancel')}</button><button type="button" className={css.primary} onClick={() => void confirmSubjectSwitch()}>{t('session.switchAction')}</button></div></div></div>}
      {coach && <div className={css.coachOverlay} role="dialog"><div className={css.coachDialog}><button className={css.coachClose} onClick={() => setCoach(undefined)}>×</button><p className={css.kicker}>{t('coach.kicker')}</p><h2>{coach.title}</h2><p className={coach.aiUsed ? css.aiStatus : css.ruleStatus}>{coach.aiUsed ? `${t('confirm.aiUsed')} · ${coach.model ?? ''}` : t('confirm.ruleUsed')}</p>{coach.warning && <p className={css.warning}>{coach.warning}</p>}<div className={css.guidance}>{coach.guidance}</div></div></div>}
      {analyzing && <div className={css.processingOverlay} role="dialog" aria-modal="true" aria-busy="true" aria-labelledby="homework-processing-title"><div className={css.processingDialog}><span className={css.processingSpinner} aria-hidden="true" /><p className={css.kicker}>{t('add.processingKicker')}</p><h2 id="homework-processing-title">{t('add.processingTitle')}</h2><p className={css.processingMessage}>{processingMessage}</p><p className={css.processingHint}>{t('add.processingHint')}</p></div></div>}
    </main>
    {page === 'textbook' && <button type="button" className={css.textbookAddFloating} onClick={openTextbookDialog}>{t('textbook.add')}</button>}
    <nav className={css.mobileNav} aria-label={t('nav.home')}><button className={page === 'home' ? css.activeNav : ''} onClick={openHome}>{t('nav.home')}</button><button className={page === 'history' ? css.activeNav : ''} onClick={openHistory}>{t('nav.history')}</button><button className={page === 'add' ? css.activeNav : ''} onClick={openAdd}>{t('nav.add')}</button><button className={page === 'settings' ? css.activeNav : ''} onClick={openSettings}>{t('nav.settings')}</button></nav>
    {textbookDialogOpen && <div className={css.textbookOverlay} role="dialog" aria-modal="true" aria-labelledby="textbook-dialog-title"><div className={css.textbookDialog}><div className={css.textbookDialogHeader}><div><p className={css.kicker}>{t('textbook.kicker')}</p><h2 id="textbook-dialog-title">{t('textbook.addTitle')}</h2></div><button type="button" className={css.coachClose} aria-label={t('textbook.close')} onClick={() => setTextbookDialogOpen(false)}>×</button></div><div className={css.bookForm}><label>{t('textbook.subject')}<select value={textbookSubject} onChange={event => setTextbookSubject(event.target.value as HomeworkSubject)}>{(Object.entries(labels) as Array<[HomeworkSubject, string]>).filter(([key]) => key !== 'other').map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>{t('textbook.name')}<input value={textbookTitle} onChange={event => setTextbookTitle(event.target.value)} placeholder={t('textbook.namePlaceholder')} /></label><label>{t('textbook.publisher')}<input value={publisher} onChange={event => setPublisher(event.target.value)} placeholder={t('textbook.publisherPlaceholder')} /></label><label>{t('textbook.grade')}<input value={grade} onChange={event => setGrade(event.target.value)} /></label><label>{t('textbook.volume')}<input value={term} onChange={event => setTerm(event.target.value)} /></label><label>{t('textbook.chapterIndex')}<textarea value={chapterIndex} onChange={event => setChapterIndex(event.target.value)} placeholder={t('textbook.chapterPlaceholder')} /></label><label>{t('textbook.source')}<input value={sourceFileName} onChange={event => setSourceFileName(event.target.value)} placeholder={t('textbook.sourcePlaceholder')} /></label><label>{t('textbook.sourceUrl')}<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder={t('textbook.sourceUrlPlaceholder')} /></label></div><label className={css.textbookFileButton}>{t('textbook.uploadFile')}<input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={event => void onTextbookFile(event.target.files?.[0])} /></label>{textbookFileLoading && <p className={css.muted}>{t('textbook.fileLoading')}</p>}{textbookFileError !== '' && <p className={css.error}>{textbookFileError}</p>}{textbookMarkdown !== '' && <div className={css.textbookMarkdown}><div className={css.textbookMarkdownHeader}><strong>{t('textbook.markdownPreview')}</strong><button type="button" onClick={downloadTextbookMarkdown}>{t('textbook.downloadMarkdown')}</button></div><textarea value={textbookMarkdown} onChange={event => setTextbookMarkdown(event.target.value)} /></div>}{error && <p className={css.error}>{error}</p>}<div className={css.actions}><button type="button" onClick={() => setTextbookDialogOpen(false)}>{t('textbook.back')}</button><button type="button" className={css.primary} disabled={saving || textbookFileLoading} onClick={() => void saveTextbook()}>{saving ? t('textbook.saving') : t('textbook.save')}</button></div></div></div>}
  </div>
}
