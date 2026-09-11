/* oxlint-disable @stylistic/max-len -- fixtures keep each remote response visible in one case. */
import { Context } from '@deepseek-ai/cordis'
import { parseHomeworkMessage } from '@deepseek-ai/dsh-education-homework'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeworkController } from '../src/index.ts'
import type { HomeworkDay, TextbookChapter, TextbookProfile } from '../src/types.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

function controllerWith(chunks: readonly StreamChunk[], retryChunks = chunks): HomeworkController {
  const ctx = new Context()
  roots.push(ctx)
  let callIndex = 0
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'qpww', model: 'gpt-5.6-terra' }),
  } as never)
  ctx.provide('llm', {
    stream: vi.fn(() => {
      const selected = callIndex++ === 0 ? chunks : retryChunks
      return (async function* () {
        for (const chunk of selected) yield chunk
      })()
    }),
  } as never)
  return new HomeworkController(ctx)
}

function chapterControllerWith(chunks: readonly StreamChunk[]): { controller: HomeworkController; chapters: Map<string, unknown> } {
  const controller = controllerWith(chunks)
  const textbook: TextbookProfile = {
    id: 'book-chinese', subject: 'chinese', grade: '七年级', term: '上册', publisher: '人民教育出版社', edition: '统编版', volume: '上册', title: '七年级语文上册', catalogStatus: 'user_confirmed',
  }
  const day: HomeworkDay = { dateKey: '2026-09-08', imports: [], tasks: [], textbooks: [textbook] }
  const chapters = new Map<string, unknown>()
  ;(controller as unknown as { table: { get: (key: string) => HomeworkDay | undefined } }).table = { get: () => day }
  ;(controller as unknown as { chapterTable: { get: (key: string) => unknown; put: (key: string, value: unknown) => Promise<void> } }).chapterTable = {
    get: key => chapters.get(key),
    put: async (key, value) => { chapters.set(key, value) },
  }
  return { controller, chapters }
}

describe('HomeworkController model use', () => {
  it('lists saved homework days with completion counts in reverse chronological order', () => {
    const controller = controllerWith([])
    const task = parseHomeworkMessage('语文：完成《春》课后题1', '2026-09-06T00:00:00.000Z', 'history-fixture').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one homework task')
    const records: ReadonlyMap<string, HomeworkDay> = new Map([
      ['2026-09-08', { dateKey: '2026-09-08', imports: [{ id: 'i2', rawText: '数学作业', receivedAt: '2026-09-08T08:00:00.000Z', source: 'manual' }], tasks: [{ ...task, id: 'done-task', status: 'done' }], textbooks: [] }],
      ['2026-09-09', { dateKey: '2026-09-09', imports: [{ id: 'i3', rawText: '语文作业', receivedAt: '2026-09-09T08:00:00.000Z', source: 'manual' }], tasks: [{ ...task, id: 'todo-task' }, { ...task, id: 'todo-task-2', title: '完成《春》课后题2' }], textbooks: [] }],
    ])
    ;(controller as unknown as { table: { entries: () => IterableIterator<[string, HomeworkDay]> } }).table = { entries: () => records.entries() }

    expect(controller.listHistory()).toEqual([
      { dateKey: '2026-09-09', totalTasks: 2, completedTasks: 0, incompleteTasks: 2, importCount: 1 },
      { dateKey: '2026-09-08', totalTasks: 1, completedTasks: 1, incompleteTasks: 0, importCount: 1 },
    ])
  })

  it('persists one resumable subject session and task completion time', async () => {
    const controller = controllerWith([])
    const task = parseHomeworkMessage('数学：完成课本第12页第1题', '2026-09-09T00:00:00.000Z', 'session-fixture').tasks[0]
    if (task === undefined) throw new Error('fixture must produce one homework task')
    let saved: HomeworkDay = { dateKey: '2026-09-09', imports: [], tasks: [task], textbooks: [] }
    ;(controller as unknown as { table: { get: () => HomeworkDay; put: (_key: string, value: HomeworkDay) => Promise<void> } }).table = {
      get: () => saved,
      put: async (_key, value) => { saved = value },
    }

    const started = await controller.startSubjectSession({ dateKey: '2026-09-09', subject: 'math' })
    expect(started.sessions).toHaveLength(1)
    expect(started.sessions?.[0]).toMatchObject({ subject: 'math', status: 'active', activeSeconds: 0 })

    const paused = await controller.pauseSubjectSession({ dateKey: '2026-09-09', subject: 'math' })
    expect(paused.sessions?.[0]?.status).toBe('paused')
    const resumed = await controller.startSubjectSession({ dateKey: '2026-09-09', subject: 'math' })
    expect(resumed.sessions?.[0]?.status).toBe('active')

    const completed = await controller.updateTaskStatus({ dateKey: '2026-09-09', taskId: task.id, status: 'done' })
    expect(completed.tasks[0]).toMatchObject({ status: 'done' })
    expect(completed.tasks[0]?.completedAt).toEqual(expect.any(String))
    const finished = await controller.finishSubjectSession({ dateKey: '2026-09-09', subject: 'math' })
    expect(finished.sessions?.[0]).toMatchObject({ status: 'completed', endedAt: expect.any(String) })
    expect(finished.sessions?.[0]?.activeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('pauses another active subject when a new subject starts', async () => {
    const controller = controllerWith([])
    const mathTask = parseHomeworkMessage('数学：完成课本第12页第1题', '2026-09-09T00:00:00.000Z', 'exclusive-fixture').tasks[0]
    if (mathTask === undefined) throw new Error('fixture must produce one homework task')
    const chineseTask = { ...mathTask, id: 'exclusive-fixture-task-02', subject: 'chinese' as const, title: '背诵《春》' }
    let saved: HomeworkDay = { dateKey: '2026-09-09', imports: [], tasks: [mathTask, chineseTask], textbooks: [] }
    ;(controller as unknown as { table: { get: () => HomeworkDay; put: (_key: string, value: HomeworkDay) => Promise<void> } }).table = {
      get: () => saved,
      put: async (_key, value) => { saved = value },
    }

    await controller.startSubjectSession({ dateKey: '2026-09-09', subject: 'math' })
    const switched = await controller.startSubjectSession({ dateKey: '2026-09-09', subject: 'chinese' })
    expect(switched.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: 'math', status: 'paused' }),
      expect.objectContaining({ subject: 'chinese', status: 'active' }),
    ]))
  })

  it('uses the selected default model for homework analysis', async () => {
    const rawText = '数学：完成课本第12页第1-3题'
    const parsed = parseHomeworkMessage(rawText, '2026-09-06T00:00:00.000Z', 'fixture')
    const task = parsed.tasks[0]
    if (task === undefined) throw new Error('fixture must produce one homework task')
    const response = JSON.stringify({
      tasks: [{ title: task.title, lessonReference: '第12页', confidence: 0.92 }],
      summary: '已结合教材页码整理。',
      warnings: [],
    })
    const controller = controllerWith([
      { type: 'text-delta', index: 0, text: response },
      { type: 'finish', reason: { kind: 'stop' } },
    ])

    await expect(controller.analyze({ rawText, textbookProfiles: [] })).resolves.toMatchObject({
      aiUsed: true,
      model: 'qpww/gpt-5.6-terra',
      summary: '已结合教材页码整理。',
      tasks: [{ title: task.title, lessonReference: '第12页', confidence: 0.92 }],
      warnings: [],
    })
  })

  it('lets the model classify free-form homework without a subject heading', async () => {
    const rawText = '明天背诵《春》，完成课后题1和2。'
    expect(parseHomeworkMessage(rawText, '2026-09-06T00:00:00.000Z', 'fixture').tasks).toHaveLength(0)
    const controller = controllerWith([
      { type: 'text-delta', index: 0, text: JSON.stringify({ tasks: [{ subject: '语文', title: '背诵《春》并完成课后题1和2', taskType: 'recitation', confidence: 0.86, sourceReference: '明天背诵《春》，完成课后题1和2' }], summary: '已按上下文识别科目。', warnings: [] }) },
      { type: 'finish', reason: { kind: 'stop' } },
    ])

    await expect(controller.analyze({ rawText, textbookProfiles: [] })).resolves.toMatchObject({
      aiUsed: true,
      summary: '已按上下文识别科目。',
      tasks: [{ subject: 'chinese', title: '背诵《春》并完成课后题1和2', taskType: 'recitation', confidence: 0.86 }],
    })
  })

  it('reports the model failure instead of parsing an empty response as JSON', async () => {
    const controller = controllerWith([
      { type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'Insufficient Balance' } } },
    ])

    const result = await controller.analyze({ rawText: '语文：背诵《春》', textbookProfiles: [] })

    expect(result.aiUsed).toBe(false)
    expect(result.warnings).toEqual(['AI 整理未完成：qpww/gpt-5.6-terra：Insufficient Balance'])
    expect(result.warnings.join('')).not.toContain('Unexpected end of JSON input')
    expect(result.warnings.join('')).not.toContain('没有可用的 DSH 模型')
  })

  it('accepts a JSON code block wrapped in a short model explanation', async () => {
    const rawText = '语文：完成《春》课后题1'
    const parsed = parseHomeworkMessage(rawText, '2026-09-06T00:00:00.000Z', 'fixture')
    const task = parsed.tasks[0]
    if (task === undefined) throw new Error('fixture must produce one homework task')
    const controller = controllerWith([
      { type: 'text-delta', index: 0, text: `整理如下：\n\`\`\`json\n${JSON.stringify({ tasks: [{ title: task.title, confidence: 0.8 }], summary: '已整理', warnings: [] })}\n\`\`\`` },
      { type: 'finish', reason: { kind: 'stop' } },
    ])

    await expect(controller.analyze({ rawText, textbookProfiles: [] })).resolves.toMatchObject({
      aiUsed: true,
      summary: '已整理',
      tasks: [{ title: task.title, confidence: 0.8 }],
    })
  })

  it('retries once when the model returns non-JSON text', async () => {
    const rawText = '数学：完成课本第12页第1题'
    const parsed = parseHomeworkMessage(rawText, '2026-09-06T00:00:00.000Z', 'fixture')
    const task = parsed.tasks[0]
    if (task === undefined) throw new Error('fixture must produce one homework task')
    const valid = JSON.stringify({ tasks: [{ title: task.title, lessonReference: '第12页', confidence: 0.9 }], summary: '已重试整理', warnings: [] })
    const controller = controllerWith(
      [{ type: 'text-delta', index: 0, text: '我先分析一下这道作业。' }, { type: 'finish', reason: { kind: 'stop' } }],
      [{ type: 'text-delta', index: 0, text: valid }, { type: 'finish', reason: { kind: 'stop' } }],
    )

    await expect(controller.analyze({ rawText, textbookProfiles: [] })).resolves.toMatchObject({
      aiUsed: true,
      summary: '已重试整理',
      tasks: [{ title: task.title, lessonReference: '第12页', confidence: 0.9 }],
      warnings: [],
    })
  })
})

describe('HomeworkController chapter study', () => {
  const chapter: TextbookChapter = { id: 'book-chinese::第一单元::春', textbookProfileId: 'book-chinese', unitTitle: '第一单元', lessonNumber: '1', title: '春' }

  it('seeds the public-domain Spring source for the Chinese preset', async () => {
    const { controller, chapters } = chapterControllerWith([])
    const view = await controller.getChapter({ dateKey: '2026-09-08', textbookProfileId: 'book-chinese', chapter })
    expect(view.source.status).toBe('provided')
    expect(view.source.text).toContain('盼望着，盼望着')
    expect(view.source.fileName).toContain('公开课文')
    expect(chapters.size).toBe(1)
  })

  it('hydrates an older missing-source chapter record', async () => {
    const { controller, chapters } = chapterControllerWith([])
    chapters.set('book-chinese::第一单元::春', { key: 'book-chinese::第一单元::春', textbookProfileId: 'book-chinese', chapter, progress: { read: false, completedActivityIds: [], updatedAt: '2026-09-08T00:00:00.000Z' } })
    const view = await controller.getChapter({ dateKey: '2026-09-08', textbookProfileId: 'book-chinese', chapter })
    expect(view.source.status).toBe('provided')
    expect(view.source.text).toContain('春天的脚步近了')
  })

  it('persists a source and normalizes structured chapter analysis', async () => {
    const response = JSON.stringify({
      overview: '一篇描写春天的散文。', summary: '按春草、春花等内容梳理。',
      structure: [{ title: '春景', body: '分层描写春天的景物。', sourceRefs: [{ label: '第3段', quote: '春天' }] }],
      themes: ['赞美春天'], keyWords: ['春'], writingTechniques: ['比喻'],
      keySentences: [{ quote: '春天来了', explanation: '点明季节变化。', sourceRefs: [{ label: '第1段' }] }],
      retellOutline: ['先写春天到来', '再写春景'], quiz: [{ id: 'q1', kind: 'basic', question: '文章写了什么？', answer: '春景', explanation: '从全文对象概括。', sourceRefs: [] }], sourceRefs: [{ label: '第1段' }], warnings: [],
    })
    const { controller, chapters } = chapterControllerWith([{ type: 'text-delta', index: 0, text: response }, { type: 'finish', reason: { kind: 'stop' } }])
    const result = await controller.analyzeChapter({ dateKey: '2026-09-08', textbookProfileId: 'book-chinese', chapter, sourceText: '第一段\n第二段', sourceFileName: '春.txt' })
    expect(result.source).toMatchObject({ status: 'provided', fileName: '春.txt' })
    expect(result.analysis).toMatchObject({ aiUsed: true, overview: '一篇描写春天的散文。', quiz: [{ id: 'q1' }] })
    expect(chapters.size).toBe(1)
  })

  it('stores a deterministic fallback when the selected model fails', async () => {
    const { controller } = chapterControllerWith([{ type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'Insufficient Balance' } } }])
    const result = await controller.analyzeChapter({ dateKey: '2026-09-08', textbookProfileId: 'book-chinese', chapter, sourceText: '第一段\n第二段' })
    expect(result.analysis).toMatchObject({ aiUsed: false, quiz: [{ id: 'fallback-summary' }] })
    expect(result.analysis?.warnings[0]).toContain('Insufficient Balance')
  })

  it('marks chapter activities once and keeps progress on reload', async () => {
    const { controller } = chapterControllerWith([])
    const view = await controller.getChapter({ dateKey: '2026-09-08', textbookProfileId: 'book-chinese', chapter })
    const updated = await controller.updateChapterProgress({ dateKey: '2026-09-08', chapterKey: view.key, activityId: 'overview' })
    expect(updated?.progress.completedActivityIds).toEqual(['overview'])
    const repeated = await controller.updateChapterProgress({ dateKey: '2026-09-08', chapterKey: view.key, activityId: 'overview' })
    expect(repeated?.progress.completedActivityIds).toEqual(['overview'])
  })

  it('rejects a chapter that names a different textbook profile', async () => {
    const { controller } = chapterControllerWith([])
    await expect(controller.getChapter({ dateKey: '2026-09-08', textbookProfileId: 'book-chinese', chapter: { ...chapter, textbookProfileId: 'other-book' } })).rejects.toThrow('章节与教材档案不匹配')
  })
})
