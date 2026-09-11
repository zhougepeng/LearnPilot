// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HomeworkTask } from '@deepseek-ai/dsh-education-homework'
import type { HomeworkChapterView, HomeworkClient } from '../src/client/index.ts'
import type { HomeworkDay, TextbookProfile } from '@deepseek-ai/dsh-education-homework-controller/types'
import { SubjectHomeworkPage } from '../src/client/SubjectHomeworkPage.tsx'
import { zh } from '../src/client/locales.ts'

describe('SubjectHomeworkPage reference layout', () => {
  it('shows saved lesson text beside the chapter analysis', async () => {
    const task: HomeworkTask = { id: 'subject-import-task-01', importId: 'subject-import', subject: 'chinese', title: '背诵《济南的冬天》', taskType: 'recitation', sourceReference: '语文：背诵《济南的冬天》', requiresParentAssistance: false, requiresParentSignature: false, assistanceTypes: ['recitation'], missingInformation: false, status: 'todo', confidence: 0.94, lessonReference: '《济南的冬天》' }
    const textbook: TextbookProfile = { id: 'book', subject: 'chinese', grade: '七年级', term: '上册', publisher: '人民教育出版社', edition: '统编版', volume: '上册', title: '七上语文', chapterIndex: '第一单元：2 济南的冬天' }
    const day: HomeworkDay = { dateKey: '2026-09-10', imports: [], tasks: [task], textbooks: [textbook] }
    const view: HomeworkChapterView = { key: 'book::unit::winter', textbook, chapter: { id: 'book::第一单元::济南的冬天', textbookProfileId: 'book', unitTitle: '第一单元', lessonNumber: '2', title: '济南的冬天' }, source: { status: 'provided', text: '济南的冬天是响晴的。', fileName: '济南的冬天.txt' }, progress: { read: false, completedActivityIds: [], updatedAt: '2026-09-10T00:00:00.000Z' } }
    const homework = { getChapter: vi.fn(async () => view) } as unknown as HomeworkClient
    render(<SubjectHomeworkPage dateKey="2026-09-10" subject="chinese" day={day} labels={{ chinese: '语文', math: '数学', english: '英语', biology: '生物', history: '历史', geography: '地理', other: '其他' }} homework={homework} t={key => zh[key]} onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('济南的冬天是响晴的。')).toBeTruthy())
    expect(screen.getByRole('heading', { name: '课文原文' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'AI 分析结果' })).toBeTruthy()
    expect(screen.getByText('老舍抓住济南冬天“温晴”的特点，描绘山、水和城的秀美景色。')).toBeTruthy()
  })

  it('shows completed time beside the task title', () => {
    const task: HomeworkTask = { id: 'completed-task', importId: 'completed-import', subject: 'math', title: '完成练习册第10页', taskType: 'practice', sourceReference: '数学作业', requiresParentAssistance: false, requiresParentSignature: false, assistanceTypes: [], missingInformation: false, status: 'done', completedAt: '2026-09-10T08:35:00.000Z', confidence: 1 }
    const day: HomeworkDay = { dateKey: '2026-09-10', imports: [], tasks: [task], textbooks: [] }
    const homework = {} as unknown as HomeworkClient
    render(<SubjectHomeworkPage dateKey="2026-09-10" subject="math" day={day} labels={{ chinese: '语文', math: '数学', english: '英语', biology: '生物', history: '历史', geography: '地理', other: '其他' }} homework={homework} t={key => zh[key]} onBack={vi.fn()} />)

    expect(screen.getByText(/^已完成 \(\d{2}:\d{2}\)$/)).toBeTruthy()
  })
})
