/* oxlint-disable @stylistic/max-len -- the compact reference panel keeps paired source and analysis markup together. */
import { useEffect, useMemo, useState } from 'react'
import type { HomeworkChapterView, HomeworkDay, HomeworkSubjectSession, TextbookChapter, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import type { HomeworkSubject, HomeworkTask } from '@deepseek-ai/dsh-education-homework'
import type { EducationKey } from './locales.ts'
import type { HomeworkClient } from './index.ts'
import { builtInChapterReference, parseTextbookChapters, type ChapterReferencePreview } from './chapter-index.ts'
import css from './EducationShell.module.css'

interface SubjectHomeworkPageProps {
  readonly dateKey: string
  readonly subject: HomeworkSubject
  readonly day: HomeworkDay
  readonly labels: Readonly<Record<HomeworkSubject, string>>
  readonly homework: HomeworkClient
  readonly t: (key: EducationKey) => string
  readonly onBack: () => void | Promise<void>
  readonly onOpenChapter?: () => void | Promise<void>
}

function elapsedSeconds(session: HomeworkSubjectSession | undefined, now: number): number {
  if (session === undefined) return 0
  const base = Math.max(0, Math.floor(session.activeSeconds))
  if (session.status !== 'active' || session.lastResumedAt === undefined) return base
  const resumedAt = Date.parse(session.lastResumedAt)
  return Number.isFinite(resumedAt) ? base + Math.max(0, Math.floor((now - resumedAt) / 1_000)) : base
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function formatCompletedAt(value: string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function normalizedText(value: string): string {
  return value.replace(/[《》「」“”"'、，。！？：:；;]/g, '').replace(/\s+/g, '').toLowerCase()
}

function chapterMatchesTasks(chapter: TextbookChapter, tasks: readonly HomeworkTask[]): boolean {
  const title = normalizedText(chapter.title)
  const lessonNumber = chapter.lessonNumber === undefined ? '' : normalizedText(chapter.lessonNumber)
  return tasks.some((task) => {
    const reference = normalizedText(`${task.lessonReference ?? ''}${task.title}`)
    if (title !== '' && reference.includes(title)) return true
    return lessonNumber !== '' && new RegExp(`(?:第)?${lessonNumber}(?:课|章|单元)`).test(reference)
  })
}

function findReferenceTextbook(day: HomeworkDay, subject: HomeworkSubject, tasks: readonly HomeworkTask[]): TextbookProfile | undefined {
  const linked = tasks.find(task => task.textbookProfileId !== undefined)?.textbookProfileId
  if (linked !== undefined) {
    const profile = day.textbooks.find(book => book.id === linked)
    if (profile !== undefined) return profile
  }
  return day.textbooks.find(book => book.subject === subject && book.catalogStatus !== 'needs_confirmation')
}

function ReferencePanel({ view, textbook, chapter, loading, error, preview, t, onOpenChapter }: { readonly view: HomeworkChapterView | undefined; readonly textbook: TextbookProfile | undefined; readonly chapter: TextbookChapter | undefined; readonly loading: boolean; readonly error: string; readonly preview: ChapterReferencePreview | undefined; readonly t: (key: EducationKey) => string; readonly onOpenChapter?: () => void | Promise<void> }) {
  if (textbook === undefined) return <section className={css.subjectReference} aria-live="polite">
    <div className={css.subjectReferenceHeader}>
      <div><p className={css.kicker}>{t('session.referenceKicker')}</p><h2>{t('session.referenceTitle')}</h2></div>
    </div>
    <p className={css.muted}>{t('session.referenceNoBook')}</p>
  </section>
  return <section className={css.subjectReference} aria-live="polite">
    <div className={css.subjectReferenceHeader}>
      <div>
        <p className={css.kicker}>{t('session.referenceKicker')}</p>
        <h2>{t('session.referenceTitle')}</h2>
      </div>
      <span className={css.subjectReferenceBook}>{textbook.title}</span>
    </div>
    {chapter === undefined && <p className={css.muted}>{t('session.referenceNoMatch')}</p>}
    {chapter !== undefined && loading && <p className={css.muted}>{t('session.referenceLoading')}</p>}
    {chapter !== undefined && !loading && error !== '' && <p className={css.error}>{error}</p>}
    {chapter !== undefined && !loading && error === '' && view !== undefined && <>
      <div className={css.subjectReferenceChapter}><strong>{chapter.lessonNumber ? `${chapter.lessonNumber} ` : ''}{chapter.title}</strong>{chapter.unitTitle && <span>{chapter.unitTitle}</span>}</div>
      <div className={css.subjectReferenceColumns}>
        <article className={css.subjectReferenceSourcePane}>
          <div className={css.subjectReferencePaneHeader}><h3>{t('session.referenceSourceTitle')}</h3><span>{view.source.status === 'provided' ? t('chapter.sourceReady') : t('chapter.sourceMissingTitle')}</span></div>
          {view.source.text ? <p className={css.subjectReferenceSourceText}>{view.source.text}</p> : <div className={css.subjectReferenceSourceEmpty}><p>{t('session.referenceSourceMissing')}</p>{onOpenChapter && <button type="button" onClick={() => void onOpenChapter()}>{t('session.referenceOpenChapter')}</button>}{textbook.sourceUrl && <a href={textbook.sourceUrl} target="_blank" rel="noreferrer">{t('textbook.openSource')}</a>}</div>}
        </article>
        <article className={css.subjectReferenceAnalysisPane}>
          <div className={css.subjectReferencePaneHeader}><h3>{t('session.referenceAnalysisTitle')}</h3><span>{view.analysis === undefined ? t('chapter.previewTitle') : t('session.referenceAnalysisTitle')}</span></div>
          {view.analysis === undefined && preview !== undefined && <p className={css.subjectReferencePreviewNote}>{t('session.referencePreviewNote')}</p>}
          {view.analysis === undefined && preview === undefined && <p className={css.muted}>{view.source.status === 'provided' ? t('session.referenceNoAnalysis') : t('session.referenceUnavailable')}</p>}
          {(() => {
            const analysis = view.analysis ?? preview
            if (analysis === undefined) return null
            return <div className={css.subjectReferenceContent}>
              <div className={css.subjectReferenceSummary}><h4>{t('chapter.overview')}</h4><strong>{analysis.overview}</strong><p>{analysis.summary}</p></div>
              {analysis.structure.length > 0 && <div className={css.subjectReferenceSection}><h4>{t('chapter.structure')}</h4><div className={css.subjectReferenceStructure}>{analysis.structure.slice(0, 4).map(section => <div key={section.title}><strong>{section.title}</strong><span>{section.body}</span></div>)}</div></div>}
              {(analysis.themes.length > 0 || analysis.keyWords.length > 0) && <div className={css.subjectReferenceSection}><h4>{t('session.referenceKeywords')}</h4><div className={css.subjectReferenceTags}>{[...analysis.themes, ...analysis.keyWords].slice(0, 12).map(item => <span key={item}>{item}</span>)}</div></div>}
            </div>
          })()}
        </article>
      </div>
    </>}
  </section>
}

export function SubjectHomeworkPage({ dateKey, subject, day, labels, homework, t, onBack, onOpenChapter }: SubjectHomeworkPageProps) {
  const tasks = useMemo(() => day.tasks.filter(task => task.subject === subject), [day.tasks, subject])
  const session = day.sessions?.find(item => item.subject === subject)
  const textbook = useMemo(() => findReferenceTextbook(day, subject, tasks), [day, subject, tasks])
  const chapter = useMemo(() => {
    if (textbook === undefined) return undefined
    const chapters = parseTextbookChapters(textbook)
    const matched = chapters.find(item => chapterMatchesTasks(item, tasks))
    return matched ?? (chapters.length === 1 ? chapters[0] : undefined)
  }, [textbook, tasks])
  const referencePreview = useMemo(() => builtInChapterReference(chapter), [chapter])
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState<HomeworkChapterView>()
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const completedCount = tasks.filter(task => task.status === 'done').length
  const allCompleted = tasks.length > 0 && completedCount === tasks.length

  useEffect(() => {
    if (session?.status !== 'active') return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [session?.status, session?.lastResumedAt])

  useEffect(() => {
    if (textbook === undefined || chapter === undefined) {
      setReference(undefined)
      setReferenceLoading(false)
      setReferenceError('')
      return
    }
    let active = true
    setReference(undefined)
    setReferenceLoading(true)
    setReferenceError('')
    void homework.getChapter({ dateKey, textbookProfileId: textbook.id, chapter }).then((next) => {
      if (!active) return
      setReference(next)
      setReferenceLoading(false)
    }).catch((reason) => {
      if (!active) return
      setReferenceError(reason instanceof Error ? reason.message : t('session.referenceLoadError'))
      setReferenceLoading(false)
    })
    return () => { active = false }
  }, [chapter, dateKey, homework, t, textbook])

  const runSessionAction = async (action: 'start' | 'pause' | 'finish'): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const request = { dateKey, subject }
      if (action === 'start') await homework.startSubjectSession(request)
      else if (action === 'pause') await homework.pauseSubjectSession(request)
      else await homework.finishSubjectSession(request)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('session.error'))
    } finally {
      setBusy(false)
    }
  }

  const toggleTask = async (task: HomeworkTask): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await homework.updateTaskStatus(dateKey, task.id, task.status === 'done' ? 'todo' : 'done')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.update'))
    } finally {
      setBusy(false)
    }
  }

  const sessionLabel = session?.status === 'active'
    ? t('session.inProgress')
    : session?.status === 'paused'
      ? t('session.paused')
      : session?.status === 'completed'
        ? t('session.ended')
        : t('session.notStarted')

  return <section className={css.subjectPage}>
    <button className={css.backButton} onClick={() => void onBack()}>{t('session.back')}</button>
    <header className={css.subjectPageHeader}>
      <div>
        <p className={css.kicker}>{t('session.kicker')}</p>
        <h1>{labels[subject]}</h1>
        <p className={css.muted}>{t('session.date').replace('{date}', dateKey.replace(/-/g, '.'))}</p>
      </div>
      <div className={css.sessionTimer}>
        <span>{sessionLabel}</span>
        <strong>{formatDuration(elapsedSeconds(session, now))}</strong>
        <small>{completedCount} / {tasks.length}</small>
      </div>
    </header>
    <div className={css.sessionActions}>
      {session?.status !== 'active' && !allCompleted && <button className={css.primary} disabled={busy} onClick={() => void runSessionAction('start')}>{session?.status === 'paused' || session?.status === 'completed' ? t('session.resume') : t('session.start')}</button>}
      {session?.status === 'active' && <button disabled={busy} onClick={() => void runSessionAction('pause')}>{t('session.pause')}</button>}
      {session?.status === 'active' && <button disabled={busy} onClick={() => void runSessionAction('finish')}>{t('session.finish')}</button>}
      {session?.status === 'completed' && allCompleted && <span className={css.sessionComplete}>{t('session.completed')}</span>}
    </div>
    {error !== '' && <p className={css.error}>{error}</p>}
    {tasks.length === 0 ? <section className={css.empty}><h2>{t('session.noTasks')}</h2></section> : <div className={css.sessionTaskList}>
      {tasks.map(task => <label className={task.status === 'done' ? css.sessionTaskDone : css.sessionTask} key={task.id}>
        <input type="checkbox" checked={task.status === 'done'} disabled={busy} onChange={() => void toggleTask(task)} />
        <span className={task.status === 'done' ? css.taskTitleDone : ''}>{task.title}</span>
        {task.status === 'done' && <div className={css.sessionTaskMeta}>
          <small className={css.done}>{task.completedAt ? `${t('task.done')} (${formatCompletedAt(task.completedAt)})` : t('task.done')}</small>
        </div>}
        {(task.requiresParentAssistance || task.missingInformation) && <div className={css.sessionTaskDetails}>
          {task.requiresParentAssistance && <small className={css.parentBadge}>{t('task.parentAssistance')}</small>}
          {task.missingInformation && <small>{t('task.missing').replace('{reason}', task.missingInformationReason ?? '')}</small>}
        </div>}
      </label>)}
    </div>}
    <ReferencePanel view={reference} textbook={textbook} chapter={chapter} loading={referenceLoading} error={referenceError} preview={referencePreview} t={t} {...(onOpenChapter === undefined ? {} : { onOpenChapter })} />
  </section>
}
