/* oxlint-disable @stylistic/max-len -- study navigation keeps its route data colocated. */
import { useEffect, useMemo, useState } from 'react'
import type { HomeworkSubject } from '@deepseek-ai/dsh-education-homework'
import type { HomeworkDay, TextbookChapter, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import type { EducationKey } from './locales.ts'
import { parseTextbookChapters } from './chapter-index.ts'
import css from './EducationShell.module.css'

export type StudyMode = 'preview' | 'review'

interface StudyPageProps {
  readonly day: HomeworkDay
  readonly labels: Readonly<Record<HomeworkSubject, string>>
  readonly mode: StudyMode
  readonly t: (key: EducationKey) => string
  readonly onModeChange: (mode: StudyMode) => void
  readonly onStartChapter: (textbook: TextbookProfile, chapter: TextbookChapter) => void
}

/** Lets a learner choose a subject and chapter before opening the study view. */
export function StudyPage({ day, labels, mode, t, onModeChange, onStartChapter }: StudyPageProps) {
  const books = useMemo(() => day.textbooks
    .filter(book => book.catalogStatus !== 'needs_confirmation' && parseTextbookChapters(book).length > 0), [day.textbooks])
  const subjects = useMemo(() => [...new Set(books.map(book => book.subject))], [books])
  const [subject, setSubject] = useState<HomeworkSubject | undefined>(subjects[0])

  useEffect(() => {
    if (subject === undefined || !subjects.includes(subject)) setSubject(subjects[0])
  }, [subject, subjects])

  const textbook = books.find(book => book.subject === subject)
  const chapters = textbook === undefined ? [] : parseTextbookChapters(textbook)

  return <section className={css.studyPage}>
    <div className={css.hero}>
      <div><p className={css.kicker}>{t('study.kicker')}</p><h1>{t('study.title')}</h1><span>{t('study.description')}</span></div>
    </div>
    <div className={css.studyModes} role="tablist" aria-label={t('study.modeLabel')}>
      <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? css.studyModeActive : ''} onClick={() => onModeChange('preview')}><strong>{t('study.preview')}</strong><small>{t('study.previewHint')}</small></button>
      <button type="button" role="tab" aria-selected={mode === 'review'} className={mode === 'review' ? css.studyModeActive : ''} onClick={() => onModeChange('review')}><strong>{t('study.review')}</strong><small>{t('study.reviewHint')}</small></button>
    </div>
    {subjects.length === 0 ? <section className={css.empty}><h2>{t('study.noTextbooks')}</h2><p className={css.muted}>{t('study.noTextbooksHint')}</p></section> : <>
      <div className={css.studySubjectList} role="list" aria-label={t('study.subjectLabel')}>
        {subjects.map(item => <button type="button" role="listitem" className={item === subject ? css.studySubjectActive : css.studySubject} key={item} onClick={() => setSubject(item)}>{labels[item]}</button>)}
      </div>
      {textbook !== undefined && <section className={css.studyChapterPanel}>
        <div className={css.studyPanelHeader}><div><p className={css.kicker}>{labels[textbook.subject]}</p><h2>{textbook.title}</h2></div><span>{textbook.publisher}</span></div>
        <div className={css.studyChapterList}>{chapters.map(chapter => <button type="button" className={css.studyChapter} key={chapter.id} onClick={() => onStartChapter(textbook, chapter)}><span><strong>{chapter.lessonNumber ? `${chapter.lessonNumber} ` : ''}{chapter.title}</strong>{chapter.unitTitle && <small>{chapter.unitTitle}</small>}</span><em>{mode === 'preview' ? t('study.startPreview') : t('study.startReview')}</em></button>)}</div>
      </section>}
    </>}
  </section>
}
