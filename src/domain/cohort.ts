import type { Cohort, Dataset, DatasetIndex, Filters } from './types'
import { inDateRange } from './time'

/**
 * 一次性建立关联索引。所有指标都基于索引工作，
 * 避免每张卡片对大数组重复做多层扫描。
 */
export function buildIndex(dataset: Dataset): DatasetIndex {
  const sessions = new Map(dataset.sessions.map(s => [s.id, s]))
  const tasks = new Map(dataset.tasks.map(t => [t.id, t]))
  const tasksBySession = new Map<string, typeof dataset.tasks>()
  const scansByTask = new Map<string, typeof dataset.scans>()
  const sharesByTask = new Map<string, typeof dataset.shares>()

  for (const t of dataset.tasks) {
    const list = tasksBySession.get(t.sessionId)
    if (list) list.push(t)
    else tasksBySession.set(t.sessionId, [t])
  }
  for (const e of dataset.scans) {
    const list = scansByTask.get(e.taskId)
    if (list) list.push(e)
    else scansByTask.set(e.taskId, [e])
  }
  for (const e of dataset.shares) {
    const list = sharesByTask.get(e.taskId)
    if (list) list.push(e)
    else sharesByTask.set(e.taskId, [e])
  }

  return { sessions, tasks, tasksBySession, scansByTask, sharesByTask }
}

/**
 * 业务集合 S：满足所选点位与参与日期范围的会话，以及挂在它们上面的任务、扫码与分享。
 *
 * 归属口径为"会话开始时间的北京自然日"。任务的完成、审核、展示与扫码/分享即使发生在
 * 所选日期之外，只要其会话开始于范围内且事件不晚于快照，就仍归属该批会话。
 */
export function selectCohort(dataset: Dataset, filters: Filters, index?: DatasetIndex): Cohort {
  const idx = index ?? buildIndex(dataset)
  const siteFilter = filters.siteIds.length === 0 ? null : new Set(filters.siteIds)

  const sessions = dataset.sessions.filter(s =>
    inDateRange(s.startedAt, filters.start, filters.end) &&
    (siteFilter === null || siteFilter.has(s.siteId)))

  const tasks: Cohort['tasks'] = []
  const scans: Cohort['scans'] = []
  const shares: Cohort['shares'] = []
  for (const s of sessions) {
    const own = idx.tasksBySession.get(s.id)
    if (!own) continue
    for (const t of own) {
      tasks.push(t)
      const sc = idx.scansByTask.get(t.id)
      if (sc) scans.push(...sc)
      const sh = idx.sharesByTask.get(t.id)
      if (sh) shares.push(...sh)
    }
  }

  return { dataset, index: idx, sessions, tasks, scans, shares, asOf: dataset.meta.asOf }
}

/** 任务是否已结束。排队中与生成中不计入成功率分母。 */
export function isEnded(task: { status: string }): boolean {
  return task.status === 'success' || task.status === 'failed' || task.status === 'timeout'
}
