// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HomeworkSubject } from '@deepseek-ai/dsh-education-homework'
import type { HomeworkDay, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import { StudyPage } from '../src/client/StudyPage.tsx'
import { zh } from '../src/client/locales.ts'

const labels: Readonly<Record<HomeworkSubject, string>> = {
  chinese: '语文', math: '数学', english: '英语', biology: '生物', history: '历史', geography: '地理', other: '其他',
}

describe('StudyPage', () => {
  it('selects a subject and opens a chapter in the chosen study mode', () => {
    const textbook: TextbookProfile = { id: 'chinese-book', subject: 'chinese', grade: '七年级', term: '上册', publisher: '人民教育出版社', edition: '统编版', volume: '上册', title: '七上语文', chapterIndex: '第一单元：1 春；2 济南的冬天' }
    const day: HomeworkDay = { dateKey: '2026-09-11', imports: [], tasks: [], textbooks: [textbook], sessions: [] }
    const onModeChange = vi.fn()
    const onStartChapter = vi.fn()
    render(<StudyPage day={day} labels={labels} mode="preview" t={key => zh[key]} onModeChange={onModeChange} onStartChapter={onStartChapter} />)

    fireEvent.click(screen.getByRole('tab', { name: /复习/ }))
    fireEvent.click(screen.getByRole('button', { name: /1 春/ }))
    expect(onModeChange).toHaveBeenCalledWith('review')
    expect(onStartChapter).toHaveBeenCalledWith(textbook, expect.objectContaining({ title: '春', lessonNumber: '1' }))
  })
})
