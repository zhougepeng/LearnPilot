/* oxlint-disable @stylistic/max-len -- compact study cards keep related actions together. */
import { useEffect, useMemo, useState } from 'react'
import type { HomeworkChapterView, TextbookChapter, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import type { EducationKey } from './locales.ts'
import type { HomeworkClient } from './index.ts'
import { builtInChapterReference } from './chapter-index.ts'
import type { StudyMode } from './StudyPage.tsx'
import css from './EducationShell.module.css'

interface ChapterStudyPageProps {
  readonly dateKey: string
  readonly textbook: TextbookProfile
  readonly chapter: TextbookChapter
  readonly mode?: StudyMode
  readonly homework: HomeworkClient
  readonly t: (key: EducationKey) => string
  readonly onBack: () => void | Promise<void>
}

function sourceLabels(labels: readonly { readonly label: string }[]): string {
  return labels.map(item => item.label).join('、')
}

export function ChapterStudyPage({ dateKey, textbook, chapter, mode, homework, t, onBack }: ChapterStudyPageProps) {
  const studyMode = mode ?? 'preview'
  const [view, setView] = useState<HomeworkChapterView>()
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [revealedQuiz, setRevealedQuiz] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void homework.getChapter({ dateKey, textbookProfileId: textbook.id, chapter }).then((next) => {
      if (!active) return
      setView(next)
      setSourceText(next.source.text ?? '')
      setSourceFileName(next.source.fileName ?? '')
      setLoading(false)
      const builtInSource = next.source.status === 'provided' && next.analysis === undefined && next.source.text?.trim() !== '' && next.source.fileName?.startsWith('《') === true
      if (!builtInSource) return
      setAnalyzing(true)
      void homework.analyzeChapter({ dateKey, textbookProfileId: textbook.id, chapter, sourceText: next.source.text as string, sourceFileName: next.source.fileName }).then((analyzed) => {
        if (!active) return
        setView(analyzed)
        setSourceText(analyzed.source.text ?? next.source.text ?? '')
        setSourceFileName(analyzed.source.fileName ?? next.source.fileName ?? '')
        setRevealedQuiz(new Set())
      }).catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : t('chapter.analyzeError'))
      }).finally(() => {
        if (active) setAnalyzing(false)
      })
    }).catch((reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : t('chapter.loadError'))
      setLoading(false)
    })
    return () => { active = false }
  }, [chapter, dateKey, homework, t, textbook.id])

  const completedCount = view?.progress.completedActivityIds.length ?? 0
  const activityTotal = (view?.analysis?.quiz.length ?? 0) + (view?.analysis === undefined ? 0 : 1)
  const progressLabel = activityTotal === 0 ? t('chapter.progressNotStarted') : `${completedCount} / ${activityTotal}`
  const quizCompleted = useMemo(() => new Set(view?.progress.completedActivityIds ?? []), [view?.progress.completedActivityIds])

  const markActivity = async (activityId: string, score?: number): Promise<void> => {
    if (view === undefined || view.progress.completedActivityIds.includes(activityId)) return
    try {
      const next = await homework.updateChapterProgress({ dateKey, chapterKey: view.key, activityId, ...(score === undefined ? {} : { score }) })
      if (next !== undefined) setView(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('chapter.progressError'))
    }
  }

  const analyze = async (): Promise<void> => {
    const trimmed = sourceText.trim()
    if (trimmed === '') { setError(t('chapter.sourceRequired')); return }
    setAnalyzing(true)
    setError('')
    try {
      const next = await homework.analyzeChapter({ dateKey, textbookProfileId: textbook.id, chapter, sourceText: trimmed, ...(sourceFileName.trim() ? { sourceFileName: sourceFileName.trim() } : {}) })
      setView(next)
      setSourceText(next.source.text ?? trimmed)
      setSourceFileName(next.source.fileName ?? sourceFileName)
      setRevealedQuiz(new Set())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('chapter.analyzeError'))
    } finally {
      setAnalyzing(false)
    }
  }

  const onSourceFile = (file: File | undefined): void => {
    if (file === undefined) return
    setSourceFileName(file.name)
    if (file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name)) {
      void file.text().then(setSourceText).catch(() => setError(t('chapter.fileReadError')))
      return
    }
    setError(t('chapter.fileTypeError'))
  }

  if (loading) return <section className={css.chapterPage}><button className={css.backButton} onClick={() => void onBack()}>{t('chapter.back')}</button><p className={css.muted}>{t('chapter.loading')}</p></section>
  if (error !== '' && view === undefined) return <section className={css.chapterPage}><button className={css.backButton} onClick={() => void onBack()}>{t('chapter.back')}</button><h1>{chapter.title}</h1><p className={css.error}>{error}</p></section>

  const analysis = view?.analysis
  const preview = builtInChapterReference(chapter)
  return <section className={css.chapterPage}>
    <div className={css.chapterHeader}>
      <div>
        <button className={css.backButton} onClick={() => void onBack()}>{t('chapter.back')}</button>
        <p className={css.kicker}>{studyMode === 'preview' ? t('study.preview') : t('study.review')} · {chapter.unitTitle ?? t('chapter.kicker')}</p>
        <h1>{chapter.lessonNumber === undefined ? chapter.title : `${chapter.lessonNumber} ${chapter.title}`}</h1>
        <p className={css.muted}>{textbook.title} · {textbook.publisher}</p>
      </div>
      <div className={css.chapterProgress}><span>{t('chapter.progress')}</span><strong>{progressLabel}</strong></div>
    </div>

    {analysis === undefined && preview !== undefined && <article className={css.analysisPanel}>
      <p className={css.kicker}>{t('session.referenceKicker')}</p>
      <h2>{t('chapter.previewTitle')}</h2>
      <p className={css.subjectReferencePreviewNote}>{t('session.referencePreviewNote')}</p>
      <div className={css.subjectReferenceSummary}><h3>{t('chapter.overview')}</h3><strong>{preview.overview}</strong><p>{preview.summary}</p></div>
      <div className={css.subjectReferenceSection}><h3>{t('chapter.structure')}</h3><div className={css.subjectReferenceStructure}>{preview.structure.map(section => <div key={section.title}><strong>{section.title}</strong><span>{section.body}</span></div>)}</div></div>
      <div className={css.subjectReferenceSection}><h3>{t('session.referenceKeywords')}</h3><div className={css.subjectReferenceTags}>{[...preview.themes, ...preview.keyWords].map(item => <span key={item}>{item}</span>)}</div></div>
    </article>}

    {view?.source.status === 'missing' && <div className={css.chapterSourceCard}>
      <div><h2>{mode === undefined ? t('chapter.sourceMissingTitle') : studyMode === 'preview' ? t('chapter.previewSourceTitle') : t('chapter.reviewSourceTitle')}</h2><p className={css.muted}>{t('chapter.sourceMissingBody').replace('{chapter}', chapter.title)}</p></div>
      <label className={css.chapterSourceLabel}>{t('chapter.sourceFile')}<input value={sourceFileName} onChange={event => setSourceFileName(event.target.value)} placeholder={t('chapter.sourceFilePlaceholder')} /></label>
      <label className={css.chapterSourceLabel}>{t('chapter.sourceText')}<textarea value={sourceText} onChange={event => setSourceText(event.target.value)} placeholder={t('chapter.sourcePlaceholder')} /></label>
      <div className={css.inputModes}><label className={css.fileButton}>{t('chapter.attachText')}<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={event => onSourceFile(event.target.files?.[0])} /></label><button className={css.primary} disabled={analyzing} onClick={() => void analyze()}>{analyzing ? t('chapter.generating') : mode === undefined ? t('chapter.generate') : studyMode === 'preview' ? t('chapter.generatePreview') : t('chapter.generateReview')}</button></div>
      {error !== '' && <p className={css.error}>{error}</p>}
    </div>}

    {view?.source.status === 'provided' && <div className={css.chapterSourceBar}><span>{t('chapter.sourceReady')}{view.source.fileName ? ` · ${view.source.fileName}` : ''}</span><button onClick={() => { setView((current) => { if (current === undefined) return current; const { analysis: _analysis, ...withoutAnalysis } = current; return withoutAnalysis }); setError('') }}>{t('chapter.editSource')}</button><button className={css.primary} disabled={analyzing} onClick={() => void analyze()}>{analyzing ? t('chapter.regenerating') : mode === undefined ? t('chapter.regenerate') : studyMode === 'preview' ? t('chapter.generatePreview') : t('chapter.generateReview')}</button></div>}

    {view?.source.status === 'provided' && analysis === undefined && <div className={css.chapterSourceCard}><label className={css.chapterSourceLabel}>{t('chapter.sourceText')}<textarea value={sourceText} onChange={event => setSourceText(event.target.value)} /></label>{error !== '' && <p className={css.error}>{error}</p>}<div className={css.actions}><button className={css.primary} disabled={analyzing} onClick={() => void analyze()}>{analyzing ? t('chapter.generating') : mode === undefined ? t('chapter.generate') : studyMode === 'preview' ? t('chapter.generatePreview') : t('chapter.generateReview')}</button></div></div>}

    {analysis !== undefined && <>
      <div className={css.sourceAnalysisGrid}>
        <article className={css.sourceTextPanel}><div className={css.sectionHeading}><h2>{t('chapter.sourceText')}</h2><span className={css.muted}>{view?.source.fileName}</span></div><div className={css.sourceText}>{view?.source.text}</div></article>
        <article className={css.analysisHero}><p className={css.kicker}>{t('chapter.overview')}</p><h2>{analysis.overview}</h2><p>{analysis.summary}</p><button className={quizCompleted.has('overview') ? css.completedButton : css.chapterAction} onClick={() => void markActivity('overview')}>{quizCompleted.has('overview') ? t('chapter.completed') : t('chapter.markRead')}</button></article>
      </div>
      <div className={css.analysisGrid}>
        <article className={css.analysisPanel}><h2>{t('chapter.structure')}</h2>{analysis.structure.length === 0 ? <p className={css.muted}>{t('chapter.noStructure')}</p> : analysis.structure.map(section => <div className={css.structureRow} key={section.title}><strong>{section.title}</strong><p>{section.body}</p>{section.sourceRefs.length > 0 && <small>{t('chapter.sourceRef')}：{sourceLabels(section.sourceRefs)}</small>}</div>)}</article>
      </div>

      <div className={css.analysisGrid}>
        <article className={css.analysisPanel}><h2>{t('chapter.themes')}</h2><div className={css.tagList}>{analysis.themes.length === 0 ? <span className={css.muted}>{t('chapter.noThemes')}</span> : analysis.themes.map(item => <span key={item}>{item}</span>)}</div><h2>{t('chapter.keyWords')}</h2><div className={css.tagList}>{analysis.keyWords.length === 0 ? <span className={css.muted}>{t('chapter.noKeywords')}</span> : analysis.keyWords.map(item => <span key={item}>{item}</span>)}</div><h2>{t('chapter.techniques')}</h2><div className={css.tagList}>{analysis.writingTechniques.length === 0 ? <span className={css.muted}>{t('chapter.noTechniques')}</span> : analysis.writingTechniques.map(item => <span key={item}>{item}</span>)}</div></article>
        <article className={css.analysisPanel}><h2>{t('chapter.keySentences')}</h2>{analysis.keySentences.length === 0 ? <p className={css.muted}>{t('chapter.noKeySentences')}</p> : analysis.keySentences.map(sentence => <div className={css.quoteBlock} key={sentence.quote}><blockquote>“{sentence.quote}”</blockquote><p>{sentence.explanation}</p>{sentence.sourceRefs.length > 0 && <small>{t('chapter.sourceRef')}：{sourceLabels(sentence.sourceRefs)}</small>}</div>)}</article>
      </div>

      <article className={css.analysisPanel}><h2>{t('chapter.retell')}</h2><ol className={css.retellList}>{analysis.retellOutline.map(item => <li key={item}>{item}</li>)}</ol></article>

      <article className={css.analysisPanel}><div className={css.sectionHeading}><h2>{t('chapter.quiz')}</h2><span className={css.muted}>{t('chapter.quizHint')}</span></div>{analysis.quiz.length === 0 ? <p className={css.muted}>{t('chapter.noQuiz')}</p> : <div className={css.quizList}>{analysis.quiz.map((item, index) => { const revealed = revealedQuiz.has(item.id); const done = quizCompleted.has(`quiz:${item.id}`); return <div className={css.quizItem} key={item.id}><div className={css.quizMeta}>{t(`chapter.quizKind.${item.kind}` as EducationKey)} · {index + 1}</div><h3>{item.question}</h3><textarea placeholder={t('chapter.answerPlaceholder')} aria-label={`${t('chapter.answerLabel')} ${index + 1}`} /><button className={done ? css.completedButton : css.chapterAction} onClick={() => { setRevealedQuiz(current => new Set(current).add(item.id)); void markActivity(`quiz:${item.id}`) }}>{revealed ? t('chapter.hideExplanation') : t('chapter.showExplanation')}</button>{revealed && <div className={css.explanation}><strong>{t('chapter.referenceAnswer')}</strong><p>{item.answer}</p><strong>{t('chapter.explanation')}</strong><p>{item.explanation}</p>{item.sourceRefs.length > 0 && <small>{t('chapter.sourceRef')}：{sourceLabels(item.sourceRefs)}</small>}</div>}</div> })}</div>}</article>
      {analysis.warnings.map(warning => <p className={css.warning} key={warning}>{warning}</p>)}
    </>}
  </section>
}
