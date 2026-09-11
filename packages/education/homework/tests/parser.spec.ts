import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseHomeworkMessage } from '../src/index.ts'

const fixture = await readFile(fileURLToPath(new URL('./fixtures/homework-message-001.txt', import.meta.url)), 'utf8')

describe('parseHomeworkMessage', () => {
  it('recognizes all six subjects and preserves a stable import record', () => {
    const result = parseHomeworkMessage(fixture, '2026-09-05T08:00:00.000Z')
    expect(result.subjects).toEqual(['english', 'chinese', 'history', 'math', 'biology', 'geography'])
    expect(result.import.source).toBe('wechat')
    expect(result.import.parseStatus).toBe('parsed')
  })

  it('splits actionable tasks and labels future review, dictation, signatures, and missing details', () => {
    const result = parseHomeworkMessage(fixture, '2026-09-05T08:00:00.000Z')
    expect(result.tasks.some(task => task.dueLabel === '周六')).toBe(true)
    expect(result.tasks.some(task => task.taskType === 'dictation')).toBe(true)
    expect(result.tasks.filter(task => task.requiresParentSignature)).toHaveLength(2)
    expect(result.tasks.filter(task => task.missingInformation).map(task => task.subject)).toEqual(['math', 'biology', 'geography'])
    expect(result.tasks.filter(task => task.subject === 'chinese').map(task => task.title)).toEqual([
      '完成《春》课后题1', '完成《春》课后题2', '完成《春》课后题3', '完成《春》课后题4', '默写《春》一遍', '家长签字', '抄写积累的有关四季的词语或句子',
    ])
    expect(result.tasks.filter(task => task.subject === 'math').map(task => task.title)).toEqual([
      '口算题（具体看数学群）', '题纸第三课时', '办好学第四页和第八页',
    ])
  })

  it('does not fabricate the omitted content of group-only assignments', () => {
    const result = parseHomeworkMessage(fixture, '2026-09-05T08:00:00.000Z')
    const missing = result.tasks.filter(task => task.missingInformation)
    expect(missing.map(task => task.title)).toEqual([
      '口算题（具体看数学群）', '画表格（具体内容，看生物老师在群里发的内容）', '作业见地理群',
    ])
    expect(missing.every(task => task.assistanceTypes.includes('missing_info'))).toBe(true)
  })

  it('recognizes today subject headings and separates parent-assisted math work from notices', () => {
    const result = parseHomeworkMessage(`今日数学作业：
1、《伴》9～10页
2、小卷《回顾与思考》
3、昨天大卷满分120分，题目较为简单，成绩低于108分的说明听讲及作业存在一定问题，需要大家帮助孩子及时调整！今天只有部分同学交回来已改错试卷，请改错并给家长讲解错题。`, '2026-09-09T00:00:00.000Z')
    expect(result.subjects).toEqual(['math'])
    expect(result.tasks.map(task => task.title)).toEqual(['《伴》9～10页', '小卷《回顾与思考》', '大卷改错', '给家长讲解错题'])
    expect(result.tasks[2]).toMatchObject({ requiresParentAssistance: false, requiresParentSignature: false })
    expect(result.tasks[3]).toMatchObject({ requiresParentAssistance: true, requiresParentSignature: false })
    expect(result.tasks[3]?.assistanceTypes).toContain('parent_assistance')
  })
})
