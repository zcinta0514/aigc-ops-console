import type {
  Cohort, DailyPoint, FunnelMetrics, GenerationTask, HourlyPoint, OverviewMetrics, SiteMetrics,
} from './types'
import { THRESHOLDS } from '../config/thresholds'
import { p90 } from './percentiles'
import { beijingDateOf, eachDate } from './time'
import { selectCohort } from './cohort'
import type { Dataset, Filters } from './types'

const isEnded = (t: GenerationTask) => t.status === 'success' || t.status === 'failed' || t.status === 'timeout'

/** 任务是否已展示给用户：必须生成成功、审核通过且展示时间不晚于快照。 */
function isDisplayed(task: GenerationTask, asOfMs: number): boolean {
  if (task.status !== 'success' || task.moderationStatus !== 'approved' || task.displayedAt === null) return false
  return Date.parse(task.displayedAt) <= asOfMs
}

/** 成功任务的耗时样本，单位秒。均值与 P90 必须复用同一份样本，避免口径分叉。 */
export function successDurations(tasks: readonly GenerationTask[]): number[] {
  const out: number[] = []
  for (const t of tasks) {
    if (t.status !== 'success' || t.finishedAt === null) continue
    out.push((Date.parse(t.finishedAt) - Date.parse(t.submittedAt)) / 1000)
  }
  return out
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den)

/**
 * 会话级的两个转化指标。
 * 分子分母都按会话去重：一个会话有多个可领取结果或多次扫码/分享，都只计一次。
 * 扫码与分享互不包含——用户可能直接分享而不扫码，反之亦然。
 */
function conversionCohorts(cohort: Cohort) {
  const asOfMs = Date.parse(cohort.asOf)
  const displayedTasks = cohort.tasks.filter(t => isDisplayed(t, asOfMs))
  const displayedIds = new Set(displayedTasks.map(t => t.id))
  const taskSession = new Map(cohort.tasks.map(t => [t.id, t.sessionId]))

  const claimable = new Set<string>()
  for (const t of displayedTasks) claimable.add(t.sessionId)

  const scanned = new Set<string>()
  for (const e of cohort.scans) {
    if (displayedIds.has(e.taskId) && Date.parse(e.scannedAt) <= asOfMs) {
      scanned.add(taskSession.get(e.taskId)!)
    }
  }
  const shared = new Set<string>()
  for (const e of cohort.shares) {
    if (displayedIds.has(e.taskId) && Date.parse(e.sharedAt) <= asOfMs) {
      shared.add(taskSession.get(e.taskId)!)
    }
  }
  return { claimable, scanned, shared }
}

export function computeOverview(cohort: Cohort): OverviewMetrics {
  const asOfMs = Date.parse(cohort.asOf)
  const ended = cohort.tasks.filter(isEnded)
  const success = ended.filter(t => t.status === 'success')
  const durations = successDurations(cohort.tasks)
  const { claimable, scanned, shared } = conversionCohorts(cohort)

  const approved = success.filter(t => t.moderationStatus === 'approved').length
  const rejected = success.filter(t => t.moderationStatus === 'rejected').length
  const pending = success.filter(t => t.moderationStatus === 'pending')
  const overduePending = pending.filter(t =>
    t.finishedAt !== null &&
    (asOfMs - Date.parse(t.finishedAt)) / 60_000 > THRESHOLDS.moderationBacklog.waitMinutes).length

  return {
    participants: new Set(cohort.sessions.map(s => s.participantId)).size,
    sessions: cohort.sessions.length,
    success: success.length,
    ended: ended.length,
    queued: cohort.tasks.filter(t => t.status === 'queued').length,
    running: cohort.tasks.filter(t => t.status === 'running').length,
    successRate: ratio(success.length, ended.length),
    claimable: claimable.size,
    scanned: scanned.size,
    shared: shared.size,
    scanRate: ratio(scanned.size, claimable.size),
    shareRate: ratio(shared.size, claimable.size),
    averageSeconds: durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length,
    p90Seconds: p90(durations),
    durations,
    approved,
    rejected,
    pending: pending.length,
    rejectionRate: ratio(rejected, approved + rejected),
    overduePending,
  }
}

/**
 * 六段漏斗。前四段逐级收窄；第 5、6 段是自"结果可领取"分出的并列分支，
 * 二者互不包含，因此分享段可以大于扫码段——这是设计意图，不是数据错误。
 */
export function computeFunnel(cohort: Cohort): FunnelMetrics {
  const started = new Set(cohort.sessions.map(s => s.id))
  const submitted = new Set(cohort.tasks.map(t => t.sessionId))
  const succeeded = new Set(cohort.tasks.filter(t => t.status === 'success').map(t => t.sessionId))
  const { claimable, scanned, shared } = conversionCohorts(cohort)
  return {
    started: started.size,
    submitted: submitted.size,
    succeeded: succeeded.size,
    claimable: claimable.size,
    scanned: scanned.size,
    shared: shared.size,
  }
}

/**
 * 按参与日期展开的序列。一次遍历完成分桶，避免对每个日期都重新筛选一遍全量数据；
 * 各日期的比率同样由该日原始样本重算，不是对全局值做拆解。
 */
export function computeDailySeries(dataset: Dataset, filters: Filters): DailyPoint[] {
  const cohort = selectCohort(dataset, filters)
  const asOfMs = Date.parse(cohort.asOf)

  type Acc = {
    participants: Set<string>
    sessionCount: number
    tasks: GenerationTask[]
    claimable: Set<string>
    scanned: Set<string>
    shared: Set<string>
  }
  const byDate = new Map<string, Acc>()
  const touch = (d: string): Acc => {
    let v = byDate.get(d)
    if (!v) {
      v = { participants: new Set(), sessionCount: 0, tasks: [], claimable: new Set(), scanned: new Set(), shared: new Set() }
      byDate.set(d, v)
    }
    return v
  }

  for (const s of cohort.sessions) {
    const acc = touch(beijingDateOf(Date.parse(s.startedAt)))
    acc.participants.add(s.participantId)
    acc.sessionCount++
  }
  for (const t of cohort.tasks) {
    touch(beijingDateOf(Date.parse(cohort.index.sessions.get(t.sessionId)!.startedAt))).tasks.push(t)
  }
  const displayed = new Set(cohort.tasks.filter(t => isDisplayed(t, asOfMs)).map(t => t.id))
  for (const t of cohort.tasks) {
    if (!displayed.has(t.id)) continue
    touch(beijingDateOf(Date.parse(cohort.index.sessions.get(t.sessionId)!.startedAt))).claimable.add(t.sessionId)
  }
  const mark = (events: readonly { taskId: string; at: string }[], field: 'scanned' | 'shared') => {
    for (const e of events) {
      if (!displayed.has(e.taskId) || Date.parse(e.at) > asOfMs) continue
      const task = cohort.index.tasks.get(e.taskId)!
      const session = cohort.index.sessions.get(task.sessionId)!
      touch(beijingDateOf(Date.parse(session.startedAt)))[field].add(session.id)
    }
  }
  mark(cohort.scans.map(e => ({ taskId: e.taskId, at: e.scannedAt })), 'scanned')
  mark(cohort.shares.map(e => ({ taskId: e.taskId, at: e.sharedAt })), 'shared')

  return eachDate(filters.start, filters.end).map(date => {
    const acc = byDate.get(date)
    const tasks = acc?.tasks ?? []
    const ended = tasks.filter(isEnded)
    const success = ended.filter(t => t.status === 'success')
    const durations = successDurations(tasks)
    const claimable = acc?.claimable.size ?? 0
    return {
      date,
      participants: acc?.participants.size ?? 0,
      sessions: acc?.sessionCount ?? 0,
      successRate: ratio(success.length, ended.length),
      averageSeconds: durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length,
      p90Seconds: p90(durations),
      scanRate: ratio(acc?.scanned.size ?? 0, claimable),
      shareRate: ratio(acc?.shared.size ?? 0, claimable),
    }
  })
}

/**
 * 当日逐小时序列。用于实时视图：小时是运营在当日唯一有行动意义的粒度，
 * 按天看不出"下午三点开始变慢"这类现场问题。
 */
export function computeHourlySeries(
  dataset: Dataset,
  date: string,
  siteIds: readonly string[],
  asOf?: string,
): HourlyPoint[] {
  const cohort = selectCohort(dataset, { start: date, end: date, siteIds: [...siteIds], asOf })
  const asOfMs = Date.parse(cohort.asOf)
  const siteFilter = siteIds.length === 0 ? null : new Set(siteIds)
  const hourOf = (ms: number) => new Date(ms + 8 * 3600 * 1000).getUTCHours()

  type Acc = { participants: Set<string>; sessions: number; tasks: GenerationTask[]; claimable: Set<string>; scanned: Set<string>; shared: Set<string> }
  const byHour = new Map<number, Acc>()
  const touch = (h: number): Acc => {
    let v = byHour.get(h)
    if (!v) { v = { participants: new Set(), sessions: 0, tasks: [], claimable: new Set(), scanned: new Set(), shared: new Set() }; byHour.set(h, v) }
    return v
  }

  const sessionHour = new Map<string, number>()
  for (const s of cohort.sessions) {
    const h = hourOf(Date.parse(s.startedAt))
    sessionHour.set(s.id, h)
    const acc = touch(h)
    acc.participants.add(s.participantId)
    acc.sessions++
  }
  for (const t of cohort.tasks) {
    const h = sessionHour.get(t.sessionId)
    if (h !== undefined) touch(h).tasks.push(t)
  }
  const displayed = new Set(cohort.tasks.filter(t => isDisplayed(t, asOfMs)).map(t => t.id))
  for (const t of cohort.tasks) {
    const h = sessionHour.get(t.sessionId)
    if (h !== undefined && displayed.has(t.id)) touch(h).claimable.add(t.sessionId)
  }
  const mark = (events: readonly { taskId: string; at: string }[], field: 'scanned' | 'shared') => {
    for (const e of events) {
      if (!displayed.has(e.taskId) || Date.parse(e.at) > asOfMs) continue
      const task = cohort.index.tasks.get(e.taskId)!
      const h = sessionHour.get(task.sessionId)
      if (h !== undefined) touch(h)[field].add(task.sessionId)
    }
  }
  mark(cohort.scans.map(e => ({ taskId: e.taskId, at: e.scannedAt })), 'scanned')
  mark(cohort.shares.map(e => ({ taskId: e.taskId, at: e.sharedAt })), 'shared')

  const hours: HourlyPoint[] = []
  for (let h = 10; h <= 21; h++) {
    const acc = byHour.get(h)
    if (h > 20 && acc === undefined) continue
    const tasks = acc?.tasks ?? []
    const ended = tasks.filter(isEnded)
    const success = ended.filter(t => t.status === 'success')
    const durations = successDurations(tasks)
    const claimable = acc?.claimable.size ?? 0
    hours.push({
      hour: `${String(h).padStart(2, '0')}:00`,
      label: `${h}:00`,
      participants: acc?.participants.size ?? 0,
      sessions: acc?.sessions ?? 0,
      ended: ended.length,
      successRate: ratio(success.length, ended.length),
      averageSeconds: durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length,
      p90Seconds: p90(durations),
      scanRate: ratio(acc?.scanned.size ?? 0, claimable),
      shareRate: ratio(acc?.shared.size ?? 0, claimable),
    })
  }
  void siteFilter
  return hours
}

/**
 * 点位对比。比率与均值都从该点位自己的原始样本重算，
 * 绝不通过对全局结果做平均得到——全局人数也不能由各点位人数相加。
 */
export function computeSiteComparison(dataset: Dataset, filters: Filters): SiteMetrics[] {
  return dataset.sites
    .filter(s => filters.siteIds.length === 0 || filters.siteIds.includes(s.id))
    .map(site => {
      const cohort = selectCohort(dataset, { ...filters, siteIds: [site.id] })
      const m = computeOverview(cohort)
      return {
        siteId: site.id,
        siteName: site.name,
        participants: m.participants,
        sessions: m.sessions,
        successRate: m.successRate,
        scanRate: m.scanRate,
        shareRate: m.shareRate,
        averageSeconds: m.averageSeconds,
        p90Seconds: m.p90Seconds,
        anomalies: 0, // 由异常层回填，避免此处反向依赖
      }
    })
}
