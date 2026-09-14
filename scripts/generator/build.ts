import type {
  Dataset, Device, DeviceIncident, GenerationTask, ScanEvent, Session, ShareEvent, Site,
} from '../../src/domain/types'
import { createRng } from './prng'
import {
  BACKLOG_WINDOW, DEMO, DEVICES_PER_SITE, NEVER_REPORTED_DEVICE, NORMAL, OFFLINE_INCIDENTS,
  SITE_WEIGHT, SITES, UNFINISHED_QUOTA, WEEKEND_WEIGHT, WINDOW_OVERRIDES, type Profile,
} from './config'
import { bjAt, dateOf, dateRange, isWeekend, isoAt, msToIso, minutesOfDay } from './time'

const AS_OF_MS = Date.parse(DEMO.asOf)

export type GenerationResult = { dataset: Dataset; notes: string[] }

// ---------------------------------------------------------------- 设备与离线区间

function buildDevices(): Device[] {
  const devices: Device[] = []
  let n = 1
  for (const site of SITES) {
    for (let i = 0; i < DEVICES_PER_SITE; i++) {
      const id = `D${String(n).padStart(2, '0')}`
      devices.push({
        id,
        siteId: site.id,
        name: `${site.name}·${i + 1}号屏`,
        registeredAt: id === NEVER_REPORTED_DEVICE.id ? NEVER_REPORTED_DEVICE.registeredAt : '2026-07-25T09:00:00+08:00',
        lastHeartbeatAt: null,
      })
      n++
    }
  }
  // D11 离线未恢复，其最近心跳必须与离线事实一致；其余设备心跳贴近快照。
  for (const d of devices) {
    if (d.id === NEVER_REPORTED_DEVICE.id) continue
    d.lastHeartbeatAt = d.id === 'D11' ? '2026-08-30T18:09:30+08:00' : msToIso(AS_OF_MS - 30_000)
  }
  return devices
}

type Interval = { deviceId: string; start: number; end: number }

function buildIntervals(): Interval[] {
  return OFFLINE_INCIDENTS.map(inc => ({
    deviceId: inc.deviceId,
    start: Date.parse(inc.offlineAt),
    end: inc.restoredAt === null ? AS_OF_MS : Date.parse(inc.restoredAt),
  }))
}

/** 半开区间 [offlineAt, restoredAt)；未恢复时终点为快照。 */
function isOffline(intervals: Interval[], deviceId: string, ms: number): boolean {
  return intervals.some(i => i.deviceId === deviceId && ms >= i.start && ms < i.end)
}

// ---------------------------------------------------------------- 画像与分组

type ProfileRef = { profile: Profile; group: string }

/**
 * 画像分组键。配额按组施加：同组内用确定数量的记录命中目标，
 * 而不是让每条记录独立掷骰子——后者在小样本上会漂移，破坏异常剧本。
 */
function profileRefAt(siteId: string, date: string, minute: number): ProfileRef {
  for (let i = 0; i < WINDOW_OVERRIDES.length; i++) {
    const o = WINDOW_OVERRIDES[i]
    if (o.siteId === siteId && o.date === date && minute >= o.from && minute < o.to) {
      return { profile: { ...NORMAL, ...o.profile }, group: `${siteId}|${date}|w${i}` }
    }
  }
  return { profile: NORMAL, group: `${siteId}|${date}|normal` }
}

function volumeBoostAt(siteId: string, date: string): number {
  let boost = 1
  for (const o of WINDOW_OVERRIDES) {
    if (o.siteId === siteId && o.date === date && o.volumeBoost) boost = Math.max(boost, o.volumeBoost)
  }
  return boost
}

/** 按比例取整的配额，结果钳制在 [0, total]。 */
function quota(total: number, ratio: number): number {
  return Math.max(0, Math.min(total, Math.round(total * ratio)))
}

// ---------------------------------------------------------------- 会话配额

function closeMinuteOf(date: string): number {
  return date === DEMO.dateEnd ? 20 * 60 : DEMO.closeMinute
}

/**
 * 点位当天的可用截止时刻。只要该点位还有一台从不离线的设备，全天可用；
 * 否则（如 S06 在 8-30 只剩 D11，而 D11 于 18:10 离线）可用时段止于最早的离线开始时刻。
 * 会话时间必须落在该范围内，否则会被"离线期间不得新增现场会话"校验拦下。
 */
function siteUsableClose(list: Device[], intervals: Interval[], hardClose: number): number {
  if (list.length === 0) return 0
  if (list.some(d => !intervals.some(i => i.deviceId === d.id))) return hardClose
  const starts: number[] = []
  for (const d of list) {
    for (const i of intervals) {
      if (i.deviceId === d.id) starts.push(minutesOfDay(i.start))
    }
  }
  return starts.length === 0 ? hardClose : Math.min(hardClose, Math.min(...starts))
}

type Bucket = { date: string; siteId: string; count: number }

/** 最大余数法：权重决定分布，但总量精确等于固定规模。 */
function allocateSessions(forced: Map<string, number>): Bucket[] {
  const dates = dateRange(DEMO.dateStart, DEMO.dateEnd)
  const weights: Array<{ date: string; siteId: string; w: number }> = []
  let weightSum = 0
  for (const date of dates) {
    const dayFactor = (closeMinuteOf(date) - DEMO.openMinute) / (DEMO.closeMinute - DEMO.openMinute)
    for (const site of SITES) {
      const w = SITE_WEIGHT[site.id] * (isWeekend(date) ? WEEKEND_WEIGHT : 1) * dayFactor * volumeBoostAt(site.id, date)
      weights.push({ date, siteId: site.id, w })
      weightSum += w
    }
  }

  let forcedTotal = 0
  for (const c of forced.values()) forcedTotal += c
  const remaining = DEMO.sessionCount - forcedTotal

  const buckets = weights.map(x => {
    const raw = (x.w / weightSum) * remaining
    return { date: x.date, siteId: x.siteId, count: Math.floor(raw), frac: raw - Math.floor(raw) }
  })
  let assigned = buckets.reduce((s, b) => s + b.count, 0)
  const order = [...buckets].sort((a, b) =>
    b.frac - a.frac || (a.date < b.date ? -1 : a.date > b.date ? 1 : a.siteId < b.siteId ? -1 : 1))
  for (let i = 0; assigned < remaining; i++, assigned++) order[i % order.length].count++
  for (const b of buckets) b.count += forced.get(`${b.siteId}|${b.date}`) ?? 0
  return buckets.map(({ date, siteId, count }) => ({ date, siteId, count }))
}

// ---------------------------------------------------------------- 生成

type Slot = {
  session: Session
  profile: Profile
  group: string
  unfinished: boolean
  submittedMs: number
  durationSec: number
  templateId: string
  attemptCount: number
  status: GenerationTask['status']
  errorCode: string | null
  task?: GenerationTask
}

export function generateDataset(): GenerationResult {
  const notes: string[] = []
  const rng = createRng(DEMO.seed, 'core')
  const sites: Site[] = SITES.map(s => ({ ...s }))
  const devices = buildDevices()
  const intervals = buildIntervals()

  // D12 从未上报心跳，不参与现场互动，因此不进入任何点位的可选设备
  const devicesOfSite = new Map<string, Device[]>()
  for (const d of devices) {
    if (d.id === NEVER_REPORTED_DEVICE.id) continue
    const list = devicesOfSite.get(d.siteId) ?? []
    list.push(d)
    devicesOfSite.set(d.siteId, list)
  }

  const forced = new Map<string, number>([[`${BACKLOG_WINDOW.siteId}|${BACKLOG_WINDOW.date}`, BACKLOG_WINDOW.sessions]])
  const buckets = allocateSessions(forced)

  const sessions: Session[] = []
  const backlogSessionIds = new Set<string>()
  const unfinishedSessionIds = new Set<string>()
  let sessionSeq = 0

  for (const bucket of buckets) {
    const list = devicesOfSite.get(bucket.siteId) ?? []
    const close = closeMinuteOf(bucket.date)
    const isLastDay = bucket.date === DEMO.dateEnd
    const isBacklogBucket = bucket.siteId === BACKLOG_WINDOW.siteId && bucket.date === BACKLOG_WINDOW.date
    const usableClose = siteUsableClose(list, intervals, close)
    const span = Math.max(1, usableClose - DEMO.openMinute - (isLastDay ? 3 : 0))

    // 快照前的尾窗：这些会话的任务将停在排队/生成中，不会在快照前完成
    const tailCount = isLastDay ? Math.min(UNFINISHED_QUOTA.perSite, bucket.count) : 0

    for (let i = 0; i < bucket.count; i++) {
      const isBacklog = isBacklogBucket && i < BACKLOG_WINDOW.sessions
      const isTail = !isBacklog && i < tailCount
      const minute = isBacklog
        ? BACKLOG_WINDOW.from + (BACKLOG_WINDOW.to - BACKLOG_WINDOW.from) * ((i + 0.5) / BACKLOG_WINDOW.sessions)
        : isTail
          ? usableClose - UNFINISHED_QUOTA.windowMinutes
            + ((i + 0.5) / tailCount) * (UNFINISHED_QUOTA.windowMinutes - 1)
          : DEMO.openMinute + rng.next() * span

      const available = list.filter(d => !isOffline(intervals, d.id, bjAt(bucket.date, minute)))
      if (available.length === 0) continue

      sessionSeq++
      const id = `S${String(sessionSeq).padStart(5, '0')}`
      if (isBacklog) backlogSessionIds.add(id)
      if (isTail) unfinishedSessionIds.add(id)
      sessions.push({
        id,
        participantId: '',
        siteId: bucket.siteId,
        deviceId: rng.pick(available).id,
        startedAt: isoAt(bucket.date, minute),
      })
    }
  }

  // 参与者：先保证 4,500 人各出现一次，再把多余会话分配给随机重复者，
  // 从而自然形成跨日、跨点位的回头参与。
  const participants = Array.from({ length: DEMO.participantCount }, (_, i) => `P${String(i + 1).padStart(4, '0')}`)
  const participantSlots: string[] = [...participants]
  for (let i = 0; i < sessions.length - participants.length; i++) {
    participantSlots.push(participants[rng.int(0, participants.length - 1)])
  }
  rng.shuffle(participantSlots)
  sessions.forEach((s, i) => { s.participantId = participantSlots[i] })

  // ------------------------------------------------------------ 任务槽

  const taskRng = createRng(DEMO.seed, 'tasks')
  const TEMPLATES = ['TPL_FUTURE_SELF', 'TPL_CITY_POSTER', 'TPL_LIGHT_POEM', 'TPL_DUAL_PORTRAIT']
  const planned: Slot[] = []

  for (const session of sessions) {
    const startedMs = Date.parse(session.startedAt)
    const ref = profileRefAt(session.siteId, dateOf(startedMs), minutesOfDay(startedMs))
    const isBacklog = backlogSessionIds.has(session.id)

    if (!isBacklog && taskRng.next() < ref.profile.noTaskShare) continue // 无任务会话

    const taskCount = !isBacklog && taskRng.next() < ref.profile.twoTaskShare ? 2 : 1
    const forcedUnfinished = unfinishedSessionIds.has(session.id)
    for (let k = 0; k < taskCount; k++) {
      const submittedMs = Math.min(startedMs + taskRng.int(2, 25) * 1000 + k * taskRng.int(30, 90) * 1000, AS_OF_MS)
      const slow = taskRng.next() < ref.profile.slowShare
      const durationSec = Math.round((slow
        ? ref.profile.slowMin + taskRng.next() * (ref.profile.slowMax - ref.profile.slowMin)
        : ref.profile.fastMin + taskRng.next() * (ref.profile.fastMax - ref.profile.fastMin)) * 10) / 10
      planned.push({
        session,
        profile: ref.profile,
        group: ref.group,
        unfinished: forcedUnfinished || submittedMs + durationSec * 1000 > AS_OF_MS,
        submittedMs,
        durationSec,
        templateId: taskRng.pick(TEMPLATES),
        attemptCount: 1,
        status: 'success',
        errorCode: null,
      })
    }
  }

  // ------------------------------------------------------------ 配额分配生成状态
  // A03 的积压槽单独成池：全部成功、全部停在待审，不参与常规配额。
  const backlogSlots = planned.filter(s => backlogSessionIds.has(s.session.id))
  const normalSlots = planned.filter(s => !backlogSessionIds.has(s.session.id))

  for (const slot of backlogSlots) {
    slot.unfinished = false
    slot.status = 'success'
  }

  const byGroup = new Map<string, Slot[]>()
  for (const slot of normalSlots) {
    const list = byGroup.get(slot.group) ?? []
    list.push(slot)
    byGroup.set(slot.group, list)
  }

  for (const key of [...byGroup.keys()].sort()) {
    const items = byGroup.get(key)!
    const p = items[0].profile
    const unfinished = items.filter(s => s.unfinished)
    const rest = items.filter(s => !s.unfinished)
    for (const s of unfinished) {
      s.status = taskRng.next() < 0.6 ? 'queued' : 'running'
      s.durationSec = 0
    }

    // 同组内按固定数量分配成功/失败/超时，使每个点位×日期的成功率精确可控
    const successQuota = quota(rest.length, p.successRate)
    const shuffled = taskRng.shuffle([...rest])
    shuffled.forEach((slot, i) => {
      if (i < successQuota) {
        slot.status = 'success'
        slot.attemptCount = taskRng.next() < 0.06 ? 2 : 1 // 重试成功仍是同一条任务，不增加分母
        return
      }
      const isTimeout = taskRng.next() < p.timeoutShareOfFailure
      slot.status = isTimeout ? 'timeout' : 'failed'
      slot.attemptCount = taskRng.next() < 0.25 ? 2 : 1
      slot.errorCode = isTimeout ? 'GEN_TIMEOUT' : taskRng.pick(['MODEL_ERROR', 'UPSTREAM_5XX', 'NETWORK_RESET'])
    })
  }

  // ------------------------------------------------------------ 建立任务记录

  const tasks: GenerationTask[] = []
  planned.forEach((slot, i) => {
    const finishedMs = slot.unfinished ? null : slot.submittedMs + slot.durationSec * 1000
    const task: GenerationTask = {
      id: `T${String(i + 1).padStart(5, '0')}`,
      sessionId: slot.session.id,
      templateId: slot.templateId,
      submittedAt: msToIso(slot.submittedMs),
      finishedAt: finishedMs === null ? null : msToIso(finishedMs),
      status: slot.status,
      attemptCount: slot.attemptCount,
      errorCode: slot.errorCode,
      moderationStatus: 'not_applicable',
      moderatedAt: null,
      moderationReasonCode: null,
      displayedAt: null,
    }
    slot.task = task
    tasks.push(task)
  })

  // ------------------------------------------------------------ 审核

  const modRng = createRng(DEMO.seed, 'moderation')

  for (const slot of backlogSlots) {
    slot.task!.moderationStatus = 'pending' // 等待时长由快照反推，必然超过 10 分钟
  }

  const successByGroup = new Map<string, Slot[]>()
  for (const slot of normalSlots) {
    if (slot.status !== 'success' || slot.unfinished) continue
    const list = successByGroup.get(slot.group) ?? []
    list.push(slot)
    successByGroup.set(slot.group, list)
  }

  for (const key of [...successByGroup.keys()].sort()) {
    const items = successByGroup.get(key)!
    const p = items[0].profile
    const shuffled = modRng.shuffle([...items])
    const rejectedQ = quota(items.length, p.rejectedRate)
    const pendingQ = quota(items.length, p.pendingRate)
    shuffled.forEach((slot, i) => {
      const task = slot.task!
      const finishedMs = Date.parse(task.finishedAt!)
      if (i < rejectedQ) {
        task.moderationStatus = 'rejected'
        task.moderationReasonCode = modRng.pick(['POLICY_SENSITIVE', 'COPYRIGHT_RISK', 'PORTRAIT_RISK'])
        task.moderatedAt = msToIso(finishedMs + modRng.int(1, 4) * 1000)
        return
      }
      if (i < rejectedQ + pendingQ) {
        // 普通待审必须较新，避免出现一个月前仍在排队的记录
        const day = dateOf(finishedMs)
        if (day >= '2026-08-29') {
          task.moderationStatus = 'pending'
          task.moderatedAt = null
          return
        }
      }
      task.moderationStatus = 'approved'
      task.moderatedAt = msToIso(finishedMs + modRng.int(1, 4) * 1000)
    })
  }

  // ------------------------------------------------------------ 展示
  // 设备离线时结果留在队列，恢复后再展示；D11 未恢复，故其积压长期未展示。

  const claimableBySession = new Map<string, GenerationTask[]>()
  for (const slot of [...planned].sort((a, b) => (a.task!.id < b.task!.id ? -1 : 1))) {
    const task = slot.task!
    if (task.moderationStatus !== 'approved' || task.moderatedAt === null) continue
    const displayMs = Date.parse(task.moderatedAt) + modRng.int(1, 3) * 1000
    const undisplayed = modRng.next() < slot.profile.undisplayedRate
      || isOffline(intervals, slot.session.deviceId, displayMs)
      || displayMs > AS_OF_MS
    if (undisplayed) continue
    task.displayedAt = msToIso(displayMs)
    const list = claimableBySession.get(slot.session.id) ?? []
    list.push(task)
    claimableBySession.set(slot.session.id, list)
  }

  // ------------------------------------------------------------ 扫码与分享（按组配额）
  // 配额施加在"可领取会话"上而非任务上：一个会话有多个结果时只贡献一次，
  // 这样会话级的扫码领取率与分享转化率才精确可控。

  const eventRng = createRng(DEMO.seed, 'events')
  const scans: ScanEvent[] = []
  const shares: ShareEvent[] = []
  const sessionsByGroup = new Map<string, Session[]>()
  for (const slot of planned) {
    if (!claimableBySession.has(slot.session.id)) continue
    const list = sessionsByGroup.get(slot.group) ?? []
    if (!list.includes(slot.session)) list.push(slot.session)
    sessionsByGroup.set(slot.group, list)
  }

  let scanSeq = 0
  let shareSeq = 0
  for (const key of [...sessionsByGroup.keys()].sort()) {
    const pool = sessionsByGroup.get(key)!
    const p = normalSlots.find(s => s.group === key)?.profile ?? backlogSlots[0]?.profile ?? NORMAL
    const chosen = eventRng.shuffle([...pool])

    const emit = (session: Session, kind: 'scan' | 'share') => {
      const results = claimableBySession.get(session.id)!
      const task = eventRng.pick(results)
      const base = Date.parse(task.displayedAt!)
      const repeats = eventRng.next() < 0.12 ? 2 : 1 // 重复事件只按会话去重
      for (let i = 0; i < repeats; i++) {
        const at = base + eventRng.int(kind === 'scan' ? 2 : 3, kind === 'scan' ? 40 : 60) * 1000 + i * 6000
        if (at > AS_OF_MS) break
        if (kind === 'scan') {
          scanSeq++
          scans.push({ id: `SC${String(scanSeq).padStart(5, '0')}`, taskId: task.id, scannedAt: msToIso(at) })
        } else {
          shareSeq++
          shares.push({
            id: `SH${String(shareSeq).padStart(5, '0')}`,
            taskId: task.id,
            sharedAt: msToIso(at),
            channel: eventRng.pick(['wechat', 'moments', 'copy_link', 'other'] as const),
          })
        }
      }
    }

    const scanQuota = quota(chosen.length, p.scanRate)
    const shareQuota = quota(chosen.length, p.shareRate)
    // 扫码与分享是自"可领取结果"分出的并列分支，同一会话可以两者都有
    for (let i = 0; i < scanQuota; i++) emit(chosen[i], 'scan')
    for (let i = 0; i < shareQuota; i++) emit(chosen[i], 'share')
  }

  const incidents: DeviceIncident[] = OFFLINE_INCIDENTS.map(i => ({ ...i }))

  const dataset: Dataset = {
    meta: {
      datasetVersion: DEMO.datasetVersion,
      seed: DEMO.seed,
      activityId: DEMO.activityId,
      activityName: DEMO.activityName,
      timezone: DEMO.timezone,
      dateStart: DEMO.dateStart,
      dateEnd: DEMO.dateEnd,
      asOf: DEMO.asOf,
      schemaVersion: DEMO.schemaVersion,
      rulesVersion: DEMO.rulesVersion,
    },
    sites, devices, sessions, tasks, scans, shares, incidents,
  }

  notes.push(`会话 ${sessions.length} 条，参与者 ${new Set(sessions.map(s => s.participantId)).size} 人`)
  notes.push(`任务 ${tasks.length} 条，扫码事件 ${scans.length} 条，分享事件 ${shares.length} 条`)
  return { dataset, notes }
}

export { AS_OF_MS, isOffline }
