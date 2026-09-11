// @vitest-environment jsdom
/* oxlint-disable @stylistic/max-len -- chapter fixtures keep expected analysis visible. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HomeworkChapterView, TextbookChapter, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import type { HomeworkClient } from '../src/client/index.ts'
import { ChapterStudyPage } from '../src/client/ChapterStudyPage.tsx'
import { zh } from '../src/client/locales.ts'

const textbook: TextbookProfile = { id: 'book', subject: 'chinese', grade: '七年级', term: '上册', publisher: '人民教育出版社', edition: '统编版', volume: '上册', title: '七上语文' }
const chapter: TextbookChapter = { id: 'book::unit::spring', textbookProfileId: 'book', unitTitle: '第一单元', lessonNumber: '1', title: '春' }
const baseView: HomeworkChapterView = {
  key: 'book::unit::spring', textbook, chapter, source: { status: 'missing' }, progress: { read: true, completedActivityIds: [], updatedAt: '2026-09-08T00:00:00.000Z' },
}

function analyzedView(): HomeworkChapterView {
  return {
    ...baseView,
    source: { status: 'provided', text: '春天来了', fileName: '春.txt', hash: 'abc' },
    analysis: {
      overview: '一篇描写春天的散文。', summary: '按段落梳理。', structure: [{ title: '开头', body: '点明季节。', sourceRefs: [{ label: '第1段' }] }], themes: ['赞美春天'], keyWords: ['春'], writingTechniques: ['比喻'], keySentences: [], retellOutline: ['先写春天到来'], quiz: [{ id: 'q1', kind: 'basic', question: '写了什么？', answer: '春天', explanation: '抓住对象概括。', sourceRefs: [] }], sourceRefs: [{ label: '第1段' }], warnings: [], aiUsed: true, model: 'test/model', generatedAt: '2026-09-08T00:00:00.000Z',
    },
  }
}

describe('ChapterStudyPage', () => {
  it('automatically analyzes a built-in public lesson source', async () => {
    const builtInView: HomeworkChapterView = { ...baseView, source: { status: 'provided', text: '盼望着，盼望着', fileName: '《春》公开课文（维基文库）' } }
    const analyzeChapter = vi.fn(() => Promise.resolve(analyzedView()))
    const homework = { getChapter: vi.fn(() => Promise.resolve(builtInView)), analyzeChapter, updateChapterProgress: vi.fn() } as unknown as HomeworkClient
    const { unmount } = render(<ChapterStudyPage dateKey="2026-09-08" textbook={textbook} chapter={chapter} homework={homework} t={key => zh[key]} onBack={vi.fn()} />)

    await waitFor(() => expect(analyzeChapter).toHaveBeenCalledWith(expect.objectContaining({ sourceText: '盼望着，盼望着' })))
    await waitFor(() => expect(screen.getByText('一篇描写春天的散文。')).toBeTruthy())
    unmount()
  })

  it('asks for source text, renders analysis, and records quiz progress', async () => {
    const analyzeChapter = vi.fn(() => Promise.resolve(analyzedView()))
    const updateChapterProgress = vi.fn(() => Promise.resolve({ ...analyzedView(), progress: { ...analyzedView().progress, completedActivityIds: ['quiz:q1'] } }))
    const homework = { getChapter: vi.fn(() => Promise.resolve(baseView)), analyzeChapter, updateChapterProgress } as unknown as HomeworkClient
    render(<ChapterStudyPage dateKey="2026-09-08" textbook={textbook} chapter={chapter} homework={homework} t={key => zh[key]} onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('先提供这篇课文')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('课文原文'), { target: { value: '春天来了' } })
    fireEvent.click(screen.getByRole('button', { name: '生成章节总结' }))
    await waitFor(() => expect(screen.getByText('一篇描写春天的散文。')).toBeTruthy())
    expect(screen.getByText('春天来了')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看参考解析' }))
    expect(screen.getByText('春天')).toBeTruthy()
    expect(updateChapterProgress).toHaveBeenCalledWith({ dateKey: '2026-09-08', chapterKey: 'book::unit::spring', activityId: 'quiz:q1' })
    expect(analyzeChapter).toHaveBeenCalledWith(expect.objectContaining({ sourceText: '春天来了' }))
  })
})
