import type { Cohort, Dataset, DatasetIndex, Filters, GenerationTask } from './types'
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
 * 把一条任务还原成「在 asOf 那一刻的样子」。
 *
 * 时间回放依赖这个函数：拖动到 14:30 时，15:00 才提交的任务不该出现，
 * 15:00 才完成的任务在当时仍是生成中，审核与展示结果更是尚未发生。
 * 不做这层还原，回放出来的就只是"当前状态配上不同的时间标签"，是假的。
 *
 * 当 asOf 等于数据集快照时间时，这个函数是恒等变换——所有事件本就都在快照之前。
 */
export function projectTaskAt(task: GenerationTask, asOfMs: number): GenerationTask | null {
  const submittedMs = Date.parse(task.submittedAt)
  if (!Number.isFinite(submittedMs) || submittedMs > asOfMs) return null // 当时还没提交

  const finishedMs = task.finishedAt === null ? null : Date.parse(task.finishedAt)
  const stillRunning = finishedMs === null || finishedMs > asOfMs
  if (stillRunning) {
    return {
      ...task,
      finishedAt: null,
      status: task.status === 'queued' ? 'queued' : 'running',
      errorCode: null,
      moderationStatus: 'not_applicable',
      moderatedAt: null,
      moderationReasonCode: null,
      displayedAt: null,
    }
  }

  const moderatedMs = task.moderatedAt === null ? null : Date.parse(task.moderatedAt)
  const decisionMade = moderatedMs !== null && moderatedMs <= asOfMs
  const displayedMs = task.displayedAt === null ? null : Date.parse(task.displayedAt)

  return {
    ...task,
    // 审核尚未出结论时，该任务在当时仍是待审
    moderationStatus: decisionMade ? task.moderationStatus : 'pending',
    moderatedAt: decisionMade ? task.moderatedAt : null,
    moderationReasonCode: decisionMade ? task.moderationReasonCode : null,
    displayedAt: displayedMs !== null && displayedMs <= asOfMs ? task.displayedAt : null,
  }
}

/**
 * 业务集合 S：满足所选点位与参与日期范围的会话，以及挂在它们上面的任务、扫码与分享。
 *
 * 归属口径为"会话开始时间的北京自然日"。任务的完成、审核、展示与扫码/分享即使发生在
 * 所选日期之外，只要其会话开始于范围内且事件不晚于观察截止，就仍归属该批会话。
 *
 * 传入 filters.asOf 可把整个集合按该时刻重算，供时间回放使用。
 */
export function selectCohort(dataset: Dataset, filters: Filters, index?: DatasetIndex): Cohort {
  const idx = index ?? buildIndex(dataset)
  const siteFilter = filters.siteIds.length === 0 ? null : new Set(filters.siteIds)
  const asOf = filters.asOf ?? dataset.meta.asOf
  const asOfMs = Date.parse(asOf)
  // 快照时刻下所有事件本就早于截止，无需逐条还原
  const needsProjection = asOf !== dataset.meta.asOf

  const sessions = dataset.sessions.filter(s =>
    inDateRange(s.startedAt, filters.start, filters.end) &&
    (siteFilter === null || siteFilter.has(s.siteId)) &&
    // 回放时尚未开始的会话不该出现，否则人数会提前"透支"到未来
    (!needsProjection || Date.parse(s.startedAt) <= asOfMs))

  const tasks: Cohort['tasks'] = []
  const scans: Cohort['scans'] = []
  const shares: Cohort['shares'] = []

  for (const s of sessions) {
    const own = idx.tasksBySession.get(s.id)
    if (!own) continue
    for (const raw of own) {
      const task = needsProjection ? projectTaskAt(raw, asOfMs) : raw
      if (!task) continue
      tasks.push(task)
      const sc = idx.scansByTask.get(task.id)
      if (sc) for (const e of sc) if (!needsProjection || Date.parse(e.scannedAt) <= asOfMs) scans.push(e)
      const sh = idx.sharesByTask.get(task.id)
      if (sh) for (const e of sh) if (!needsProjection || Date.parse(e.sharedAt) <= asOfMs) shares.push(e)
    }
  }

  return { dataset, index: idx, sessions, tasks, scans, shares, asOf }
}

/** 任务是否已结束。排队中与生成中不计入成功率分母。 */
export function isEnded(task: { status: string }): boolean {
  return task.status === 'success' || task.status === 'failed' || task.status === 'timeout'
}
