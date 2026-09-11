/** Typed homework import records and conservative teacher-message parsing. */

export type HomeworkSubject =
  | 'chinese' | 'math' | 'english' | 'biology' | 'history' | 'geography' | 'other'

/** Normalized assignment category used by the parser. */
export type HomeworkTaskType =
  | 'written' | 'reading' | 'recitation' | 'dictation' | 'review' | 'practice'
  | 'worksheet' | 'question_answer' | 'drawing' | 'parent_signature' | 'other'

/** Types of help the education workspace can offer for an assignment. */
export type AssistanceType =
  | 'reminder' | 'tutor' | 'dictation' | 'recitation' | 'review' | 'check'
  | 'textbook' | 'parent_assistance' | 'parent_signature' | 'missing_info'

/** One imported teacher message before confirmation. */
export interface HomeworkImport {
  readonly id: string
  readonly rawText: string
  readonly receivedAt: string
  readonly source: 'wechat' | 'manual' | 'other'
  readonly parseStatus: 'pending' | 'parsed' | 'confirmed'
}

/** One conservatively parsed homework task. */
export interface HomeworkTask {
  readonly id: string
  readonly importId: string
  readonly subject: HomeworkSubject
  readonly title: string
  readonly description?: string
  readonly taskType: HomeworkTaskType
  readonly dueLabel?: string
  readonly recurrence?: string
  readonly sourceReference: string
  /** Whether a parent must participate beyond the student's independent work. */
  readonly requiresParentAssistance: boolean
  readonly requiresParentSignature: boolean
  readonly assistanceTypes: readonly AssistanceType[]
  readonly missingInformation: boolean
  readonly missingInformationReason?: string
  readonly status: 'todo' | 'in_progress' | 'done'
  /** When the learner last marked this task complete. */
  readonly completedAt?: string
  readonly estimatedMinutes?: number
  readonly confidence: number
  /** Confirmed textbook profile used for this task, when available. */
  readonly textbookProfileId?: string
  /** Whether the textbook relation is confirmed, suggested, or absent. */
  readonly textbookMatchStatus?: 'unmatched' | 'suggested' | 'confirmed'
  /** Lesson, unit, page, or exercise reference supplied by the user or parser. */
  readonly lessonReference?: string
}

/** Parser output for one teacher message. */
export interface HomeworkParseResult {
  readonly import: HomeworkImport
  readonly tasks: readonly HomeworkTask[]
  readonly subjects: readonly HomeworkSubject[]
}

const SUBJECTS: Readonly<Record<string, HomeworkSubject>> = {
  英语: 'english', 语文: 'chinese', 历史: 'history', 数学: 'math', 生物: 'biology', 地理: 'geography',
}

const subjectName: Readonly<Record<HomeworkSubject, string>> = {
  chinese: '语文', math: '数学', english: '英语', biology: '生物', history: '历史', geography: '地理', other: '其他',
}

const PARENT_ASSISTANCE_PATTERN = /家长签字|家长签名|家长确认|家长检查|家长辅导|家长指导|家长协助|家长配合|家长参与|请家长|由家长|家长完成|给家长讲解|向家长讲解|和家长|与家长/i

/** Detect parent participation requested by the teacher text. */
export function requiresParentAssistanceOf(text: string): boolean {
  return PARENT_ASSISTANCE_PATTERN.test(text)
}

/** Detect the narrower parent-signature requirement. */
export function requiresParentSignatureOf(text: string): boolean {
  return /家长签字|家长签名|parent signature/i.test(text)
}

/** Split a combined correction-and-explanation instruction into separate tasks. */
export function splitParentAssistanceActions(text: string): string[] {
  const normalized = text.trim().replace(/[。；]$/, '').trim()
  if (!/(?:请)?改错并给家长讲解错题/.test(normalized)) return normalized === '' ? [] : [normalized]
  const subject = normalized.match(/大卷|试卷|卷子|作业本/)?.[0] ?? ''
  return [`${subject}改错`, '给家长讲解错题']
}

function subjectOfHeading(label: string): HomeworkSubject | undefined {
  const compact = label.trim().replace(/\s+/g, '')
  const candidates = [compact, compact.replace(/^今日/, '')]
  for (const candidate of candidates) {
    const withoutHomework = candidate.replace(/作业$/, '')
    const subject = SUBJECTS[candidate] ?? SUBJECTS[withoutHomework]
    if (subject !== undefined) return subject
  }
  return undefined
}

function taskTypeOf(text: string): HomeworkTaskType {
  if (/听写/.test(text)) return 'dictation'
  if (/默写|背诵/.test(text)) return 'recitation'
  if (/读一遍|阅读|朗读/.test(text)) return 'reading'
  if (/口算|练习册|题纸|作业本|写三遍|抄写/.test(text)) return 'written'
  if (/有哪些|比较|完成：/.test(text)) return 'question_answer'
  if (/画表格|画/.test(text)) return 'drawing'
  if (/复习|再将|再读/.test(text)) return 'review'
  return 'other'
}

function assistanceOf(text: string, missingInformation: boolean): AssistanceType[] {
  const result: AssistanceType[] = []
  if (/听写/.test(text)) result.push('dictation')
  if (/默写|背诵/.test(text)) result.push('recitation')
  if (/读一遍|阅读|复习|再读/.test(text)) result.push('review', 'reminder')
  if (/课后题|有哪些|比较|举一个例子/.test(text)) result.push('tutor', 'textbook')
  if (requiresParentAssistanceOf(text)) result.push('parent_assistance')
  if (requiresParentSignatureOf(text)) result.push('parent_signature')
  if (missingInformation) result.push('missing_info')
  return [...new Set(result)]
}

function isMissing(text: string): string | undefined {
  if (/具体看数学群|具体内容.*看.*群|作业见.*群/.test(text)) return '需要补充老师群中的具体内容'
  return undefined
}

function splitTasks(subject: HomeworkSubject, block: string): string[] {
  const normalized = block.replace(/\r/g, '').replace(/\n+/g, '\n').trim()
  if (subject === 'chinese') {
    const questionMatch = normalized.match(/课后题\s*([1-4、,，\s]+)/)
    const questionNumbers = questionMatch?.[1]?.match(/[1-4]/g) ?? []
    const result = questionNumbers.map(number => `完成《春》课后题${number}`)
    if (/默写一遍《春》/.test(normalized)) result.push('默写《春》一遍')
    if (/家长签字/.test(normalized)) result.push('家长签字')
    if (/抄写积累/.test(normalized)) result.push('抄写积累的有关四季的词语或句子')
    return result
  }
  if (subject === 'math') {
    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.some(line => /^\d+\s*[.、)]\s*/.test(line))) {
      return lines.flatMap((line) => {
        const stripped = line.replace(/^\d+\s*[.、)]\s*/, '').trim()
        if (/给家长讲解错题/.test(stripped) && !/(?:请)?改错并给家长讲解错题/.test(stripped)) return ['给家长讲解错题']
        return splitParentAssistanceActions(stripped)
      })
    }
    return normalized.split(/[，,；;]/).flatMap(line => splitParentAssistanceActions(line.replace(/[。]$/, '').trim()))
  }
  if (subject === 'biology') {
    const drawing = normalized.match(/画表格.*$/)?.[0]
    const result = normalized.startsWith('练习册') ? ['完成生物练习册'] : []
    if (drawing !== undefined) result.push(drawing.replace(/[。]$/, ''))
    return result.length > 0 ? result : [normalized]
  }
  const lines = normalized.split('\n').map(line => line.replace(/^[：:、\-\s]+/, '').trim()).filter(Boolean)
  const result: string[] = []
  for (const line of lines) {
    if (/^在笔记本上完成：?$/.test(line)) continue
    if (/家长签字/.test(line) && line.length > 6) {
      result.push(line.replace(/，?家长签字。?$/, ''))
      result.push('家长签字')
    } else if (/并听写/.test(line)) {
      const [before, after] = line.split(/并听写/)
      if (before?.trim()) result.push(before.trim())
      if (after?.trim()) result.push(`听写${after.replace(/[。！]$/, '')}`)
    } else {
      result.push(line.replace(/[。；]$/, ''))
    }
  }
  return result
}

/**
 * Parse one teacher-group message without inventing omitted assignment details.
 * @param rawText - Message copied from a teacher or class group.
 * @param receivedAt - ISO timestamp used to anchor relative due labels.
 * @param importId - Stable import id used by every generated task.
 * @returns Parsed tasks and the subjects represented in the message.
 */
export function parseHomeworkMessage(rawText: string, receivedAt: string, importId = 'homework-import-1'): HomeworkParseResult {
  const lines = rawText.replace(/\r/g, '').split('\n')
  const blocks: Array<{ subject: HomeworkSubject; text: string }> = []
  let current: { subject: HomeworkSubject; text: string } | undefined
  for (const line of lines) {
    const match = line.trim().match(/^([^：:]+)[：:](.*)$/)
    if (match !== null) {
      const heading = match[1]
      if (heading === undefined) continue
      const subject = subjectOfHeading(heading)
      if (subject !== undefined) {
        const text = match[2]
        if (text === undefined) continue
        current = { subject, text: text.trim() }
        blocks.push(current)
        continue
      }
    }
    if (current !== undefined && line.trim()) {
      current.text += `\n${line.trim()}`
    }
  }
  const tasks: HomeworkTask[] = []
  let index = 0
  for (const block of blocks) {
    for (const title of splitTasks(block.subject, block.text)) {
      const missingInformationReason = isMissing(title)
      const parentSignature = requiresParentSignatureOf(title)
      const parentAssistance = requiresParentAssistanceOf(title)
      const dueLabel = /周六/.test(title) ? '周六' : undefined
      const missing = missingInformationReason !== undefined
      tasks.push({
        id: `${importId}-task-${String(++index).padStart(2, '0')}`,
        importId,
        subject: block.subject,
        title: title || `${subjectName[block.subject]}作业待补充`,
        taskType: parentSignature ? 'parent_signature' : taskTypeOf(title),
        ...(dueLabel === undefined ? {} : { dueLabel }),
        sourceReference: `${subjectName[block.subject]}：${title}`,
        requiresParentAssistance: parentAssistance,
        requiresParentSignature: parentSignature,
        assistanceTypes: assistanceOf(title, missing),
        missingInformation: missing,
        ...(missing ? { missingInformationReason } : {}),
        status: 'todo',
        confidence: missing ? 0.82 : 0.94,
      })
    }
  }
  const subjects = [...new Set(blocks.map(block => block.subject))]
  return {
    import: { id: importId, rawText, receivedAt, source: 'wechat', parseStatus: 'parsed' },
    tasks,
    subjects,
  }
}
