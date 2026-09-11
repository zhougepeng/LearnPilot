/** Registers the student homework workspace into the existing shell overlay. */
/* oxlint-disable @stylistic/max-len -- remote method wiring stays aligned with the Host API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useSyncExternalStore } from 'react'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { HomeworkAnalysis, HomeworkAnalyzeChapterRequest, HomeworkCoachRequest, HomeworkCoachResult, HomeworkDay, HomeworkDaySummary, HomeworkChapterView, HomeworkConfirmImportRequest, HomeworkAnalyzeRequest, HomeworkGetChapterRequest, HomeworkSaveTextbookRequest, HomeworkStartSubjectSessionRequest, HomeworkUpdateChapterProgressRequest, HomeworkUpdateSubjectSessionRequest } from '@deepseek-ai/dsh-education-homework-controller/types'
export type { HomeworkAnalysis, HomeworkChapterView } from '@deepseek-ai/dsh-education-homework-controller/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { EducationShell } from './EducationShell.tsx'
import { en, zh, type EducationKey } from './locales.ts'

/** Loading state for the daily homework snapshot. */
export type HomeworkLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly day: HomeworkDay }
  | { readonly status: 'error'; readonly message: string }

/** Client operations exposed by the education shell overlay. */
export interface HomeworkClient {
  readonly useHomework: () => HomeworkLoadState
  readonly listHistory: () => Promise<readonly HomeworkDaySummary[]>
  readonly getDay: (dateKey: string) => Promise<HomeworkDay>
  readonly confirmImport: (request: HomeworkConfirmImportRequest) => Promise<HomeworkDay>
  readonly updateTaskStatus: (dateKey: string, taskId: string, status: 'todo' | 'in_progress' | 'done') => Promise<HomeworkDay>
  readonly startSubjectSession: (request: HomeworkStartSubjectSessionRequest) => Promise<HomeworkDay>
  readonly pauseSubjectSession: (request: HomeworkUpdateSubjectSessionRequest) => Promise<HomeworkDay>
  readonly finishSubjectSession: (request: HomeworkUpdateSubjectSessionRequest) => Promise<HomeworkDay>
  readonly saveTextbook: (request: HomeworkSaveTextbookRequest) => Promise<HomeworkDay>
  readonly analyze: (request: HomeworkAnalyzeRequest) => Promise<HomeworkAnalysis>
  readonly coach: (request: HomeworkCoachRequest) => Promise<HomeworkCoachResult>
  readonly getChapter: (request: HomeworkGetChapterRequest) => Promise<HomeworkChapterView>
  readonly analyzeChapter: (request: HomeworkAnalyzeChapterRequest) => Promise<HomeworkChapterView>
  readonly updateChapterProgress: (request: HomeworkUpdateChapterProgressRequest) => Promise<HomeworkChapterView | undefined>
  /** Open the standard DSH Models modal at its model-management page. */
  readonly openModelSettings: () => void
  /** Refresh the durable daily homework snapshot after a recoverable read failure. */
  readonly retry: () => void
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { education: EducationKey }
}
/** Runtime props supplied by the shell slot. */
export type EducationShellProps = {
  readonly homework: HomeworkClient
  readonly t: (key: EducationKey, params?: Record<string, unknown>) => string
}
export const inject = ['slots', 'locale', 'remote', 'remote.homework', 'settingsNavigation']
export function apply(ctx: Context): void {
  let state: HomeworkLoadState = { status: 'loading' }
  const listeners = new Set<() => void>()
  const dateKey = new Date().toISOString().slice(0, 10)
  const notify = () => { for (const listener of listeners) listener() }
  const unwrap = <T>(response: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message?: string } }): T => {
    if (response.ok) return response.value
    throw new Error(response.error.message ?? '作业服务请求失败')
  }
  const load = (): void => {
    state = { status: 'loading' }
    notify()
    void ctx.remote.homework.getToday(dateKey).then((value) => {
      state = { status: 'ready', day: unwrap(value) }
      notify()
    }).catch((reason: unknown) => {
      state = { status: 'error', message: reason instanceof Error ? reason.message : '无法读取今日作业' }
      notify()
    })
  }
  load()
  const homework: HomeworkClient = {
    useHomework: () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state),
    listHistory: async () => unwrap(await ctx.remote.homework.listHistory()),
    getDay: async key => unwrap(await ctx.remote.homework.getToday(key)),
    confirmImport: async (request) => { const value = unwrap(await ctx.remote.homework.confirmImport(request)); state = { status: 'ready', day: value }; notify(); return value },
    updateTaskStatus: async (key, taskId, status) => { const value = unwrap(await ctx.remote.homework.updateTaskStatus({ dateKey: key, taskId, status })); if (state.status === 'ready' && state.day.dateKey === key) { state = { status: 'ready', day: value }; notify() } return value },
    startSubjectSession: async (request) => { const value = unwrap(await ctx.remote.homework.startSubjectSession(request)); if (state.status === 'ready' && state.day.dateKey === request.dateKey) { state = { status: 'ready', day: value }; notify() } return value },
    pauseSubjectSession: async (request) => { const value = unwrap(await ctx.remote.homework.pauseSubjectSession(request)); if (state.status === 'ready' && state.day.dateKey === request.dateKey) { state = { status: 'ready', day: value }; notify() } return value },
    finishSubjectSession: async (request) => { const value = unwrap(await ctx.remote.homework.finishSubjectSession(request)); if (state.status === 'ready' && state.day.dateKey === request.dateKey) { state = { status: 'ready', day: value }; notify() } return value },
    saveTextbook: async (request) => { const value = unwrap(await ctx.remote.homework.saveTextbook(request)); state = { status: 'ready', day: value }; notify(); return value },
    analyze: async request => unwrap(await ctx.remote.homework.analyze(request)),
    coach: async request => unwrap(await ctx.remote.homework.coach(request)),
    getChapter: async request => unwrap(await ctx.remote.homework.getChapter(request)),
    analyzeChapter: async request => unwrap(await ctx.remote.homework.analyzeChapter(request)),
    updateChapterProgress: async request => unwrap(await ctx.remote.homework.updateChapterProgress(request)),
    openModelSettings: () => { ctx.settingsNavigation.open('models') },
    retry: load,
  }
  ctx.effect(() => ctx.locale.register('education', { zh, en }), 'ui-education: dictionaries')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'education-homework', locale: 'education' }, props => createElement(EducationShell, { ...props, homework })))
}
