// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHomeworkMessage } from '@deepseek-ai/dsh-education-homework'
import type { HomeworkAnalysis, HomeworkClient } from '../src/client/index.ts'
import { EducationShell } from '../src/client/EducationShell.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => cleanup())

describe('EducationShell homework recognition', () => {
  it('shows the current organizing stage while the agent is still responding', async () => {
    const task = parseHomeworkMessage('语文：默写一遍《春》', '2026-09-09T00:00:00.000Z', 'pending-import').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one task')
    let resolveAnalysis: (value: HomeworkAnalysis) => void = () => {}
    const analysisPromise = new Promise<HomeworkAnalysis>((resolve) => { resolveAnalysis = resolve })
    const homework = {
      useHomework: () => ({ status: 'ready', day: { dateKey: '2026-09-09', imports: [], tasks: [], textbooks: [] } }),
      analyze: vi.fn(() => analysisPromise),
    } as unknown as HomeworkClient
    render(<EducationShell homework={homework} t={key => zh[key]} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '语文：默写一遍《春》' } })
    fireEvent.click(screen.getByRole('button', { name: '开始整理' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('智能体正在识别科目并拆解任务…')).toBeTruthy()

    resolveAnalysis({ tasks: [task], aiUsed: true, model: 'test/model', summary: '完成', warnings: [] })
    await waitFor(() => expect(screen.getByText('整理结果')).toBeTruthy())
  })

  it('delegates free-form text to the agent when deterministic parsing finds no tasks', async () => {
    const rawText = '明天背诵《春》，完成课后题1和2。'
    const task = parseHomeworkMessage('语文：默写一遍《春》', '2026-09-09T00:00:00.000Z', 'agent-import').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one task')
    const analysis: HomeworkAnalysis = {
      tasks: [
        { ...task, title: '背诵《春》并完成课后题1和2', subject: 'chinese', lessonReference: '《春》' },
        { ...task, id: 'agent-import-task-02', title: '整理《春》的重点句', subject: 'chinese', lessonReference: '《春》' },
        { ...task, id: 'agent-import-task-03', title: '完成第2课练习', subject: 'math', lessonReference: '第2课' },
      ],
      aiUsed: true,
      model: 'test/model',
      summary: '已按上下文识别科目。',
      warnings: [],
    }
    const homework = {
      useHomework: () => ({ status: 'ready', day: { dateKey: '2026-09-09', imports: [], tasks: [], textbooks: [] } }),
      analyze: vi.fn(async () => analysis),
      listHistory: vi.fn(async () => []),
    } as unknown as HomeworkClient
    render(<EducationShell homework={homework} t={key => zh[key]} />)

    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
    fireEvent.change(screen.getByRole('textbox'), { target: { value: rawText } })
    fireEvent.click(screen.getByRole('button', { name: '开始整理' }))

    await waitFor(() => expect(screen.getByText('整理结果')).toBeTruthy())
    expect(homework.analyze).toHaveBeenCalledWith({ rawText, textbookProfiles: [] })
    expect(screen.getByRole('heading', { name: '《春》' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '第2课' })).toBeTruthy()
    expect(screen.getByText('2 项作业')).toBeTruthy()
    expect(screen.queryByText('没有识别到带学科标题的作业，请检查粘贴内容。')).toBeNull()
  })

  it('browses history by date and filters days with unfinished work', async () => {
    const task = parseHomeworkMessage('语文：完成《春》课后题1', '2026-09-09T00:00:00.000Z', 'history-import').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one task')
    const homework = {
      useHomework: () => ({ status: 'ready', day: { dateKey: '2026-09-09', imports: [{ id: 'today', rawText: '语文作业', receivedAt: '2026-09-09T08:00:00.000Z', source: 'manual' }], tasks: [{ ...task, status: 'todo' }], textbooks: [] } }),
      listHistory: vi.fn(async () => [
        { dateKey: '2026-09-09', totalTasks: 1, completedTasks: 0, incompleteTasks: 1, importCount: 1 },
        { dateKey: '2026-09-08', totalTasks: 2, completedTasks: 2, incompleteTasks: 0, importCount: 1 },
      ]),
      getDay: vi.fn(async (dateKey: string) => ({ dateKey, imports: [], tasks: [{ ...task, status: 'todo' }, { ...task, id: 'done-task', status: 'done', completedAt: '2026-09-09T08:35:00.000Z' }], textbooks: [], sessions: [{ id: 'session-chinese', dateKey, subject: 'chinese' as const, status: 'completed' as const, startedAt: '2026-09-09T08:00:00.000Z', endedAt: '2026-09-09T08:35:00.000Z', activeSeconds: 1_800, updatedAt: '2026-09-09T08:35:00.000Z' }] })),
    } as unknown as HomeworkClient
    render(<EducationShell homework={homework} t={key => zh[key]} />)

    fireEvent.click(screen.getAllByRole('button', { name: '历史作业' })[0]!)
    await waitFor(() => expect(screen.getByText('历史每日作业')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '2026.09.09' }))
    await waitFor(() => expect(screen.getByText('选中日期')).toBeTruthy())
    expect(screen.getByText('2026.09.09')).toBeTruthy()
    expect(screen.getByText('当天总用时 30分钟')).toBeTruthy()
    expect(screen.getByText(/^已完成 \(\d{2}:\d{2}\)$/)).toBeTruthy()
    expect(homework.getDay).toHaveBeenCalledWith('2026-09-09')
    fireEvent.click(screen.getByRole('checkbox', { name: '只看未完成' }))
    expect(screen.getByRole('button', { name: '2026.09.09' })).toBeTruthy()
  })

  it('asks before leaving an active subject timer and stops it when confirmed', async () => {
    const task = parseHomeworkMessage('数学：完成课本第12页第1题', '2026-09-09T00:00:00.000Z', 'leave-fixture').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one homework task')
    const dateKey = new Date().toISOString().slice(0, 10)
    const day = { dateKey, imports: [], tasks: [task], textbooks: [], sessions: [{ id: 'session-math', dateKey, subject: 'math' as const, status: 'active' as const, startedAt: `${dateKey}T08:00:00.000Z`, lastResumedAt: `${dateKey}T08:00:00.000Z`, activeSeconds: 0, updatedAt: `${dateKey}T08:00:00.000Z` }] }
    const homework = {
      useHomework: () => ({ status: 'ready', day }),
      startSubjectSession: vi.fn(async () => day),
      finishSubjectSession: vi.fn(async () => day),
      listHistory: vi.fn(async () => []),
    } as unknown as HomeworkClient
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<EducationShell homework={homework} t={key => zh[key]} />)
    fireEvent.click(screen.getByRole('button', { name: '继续写作业' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '数学' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '返回今日作业' }))
    expect(confirm).toHaveBeenCalledWith('当前正在进行数学作业，离开将停止计时，是否继续？')
    expect(screen.getByRole('heading', { name: '数学' })).toBeTruthy()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '返回今日作业' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '今日作业' })).toBeTruthy())
    expect(homework.finishSubjectSession).toHaveBeenCalledWith({ dateKey, subject: 'math' })
    confirm.mockRestore()
  })

  it('allows correcting a recognized task before confirming it', async () => {
    const task = parseHomeworkMessage('语文：默写一遍《春》', '2026-09-09T00:00:00.000Z', 'edit-import').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one task')
    const day = { dateKey: '2026-09-09', imports: [], tasks: [], textbooks: [] }
    const homework = {
      useHomework: () => ({ status: 'ready', day }),
      analyze: vi.fn(async () => ({ tasks: [task], aiUsed: false, summary: '规则整理', warnings: [] })),
      confirmImport: vi.fn(async () => day),
    } as unknown as HomeworkClient
    render(<EducationShell homework={homework} t={key => zh[key]} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '语文：背诵《春》' } })
    fireEvent.click(screen.getByRole('button', { name: '开始整理' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '请确认后保存' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: '朗读《春》三遍' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '需要家长协助' }))
    fireEvent.click(screen.getByRole('button', { name: '确认加入今日作业' }))

    await waitFor(() => expect(homework.confirmImport).toHaveBeenCalled())
    expect(homework.confirmImport).toHaveBeenCalledWith(expect.objectContaining({ analyzedTasks: [expect.objectContaining({ title: '朗读《春》三遍', requiresParentAssistance: true, assistanceTypes: expect.arrayContaining(['parent_assistance']) })] }))
  })

  it('opens the textbook dialog and converts a text upload into markdown', async () => {
    const day = { dateKey: '2026-09-09', imports: [], tasks: [], textbooks: [] }
    const homework = {
      useHomework: () => ({ status: 'ready', day }),
      saveTextbook: vi.fn(async () => day),
    } as unknown as HomeworkClient
    render(<EducationShell homework={homework} t={key => zh[key]} />)

    fireEvent.click(screen.getAllByRole('button', { name: '教材档案' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: '先告诉我孩子使用哪本教材' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '新增教材' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    const file = new File(['# 第一课 春\n\n春天来了。'], '语文.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('上传 PDF / TXT / Markdown'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getAllByRole('textbox').some(element => (element as HTMLTextAreaElement).value.includes('# 第一课 春'))).toBe(true))
    expect(screen.getAllByRole('textbox').some(element => (element as HTMLTextAreaElement).value.includes('第一课 春'))).toBe(true)
  })
})
