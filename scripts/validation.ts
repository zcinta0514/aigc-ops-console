import type { Dataset, Device } from '../src/domain/types'
import { datasetSchema, DEMO_SCALE } from '../src/domain/schemas'

export interface ValidationResult {
  errors: string[]
  data?: Dataset
}

/** 必须带显式时区偏移；无偏移字符串会随运行环境时区被解释，禁止进入数据集。 */
const INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

/** 解析为毫秒时间戳；格式、日历合法性或时区缺失任一不满足即返回 null。 */
export function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = INSTANT_RE.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  // Date 会把 2026-02-30 静默滚动到 3 月，必须先独立核对日历合法性
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function push(errors: string[], code: string, detail: string) {
  errors.push(`[${code}] ${detail}`)
}

function duplicates(rows: Array<{ id: string }>): string[] {
  const seen = new Set<string>()
  const dup: string[] = []
  for (const r of rows) {
    if (seen.has(r.id)) dup.push(r.id)
    else seen.add(r.id)
  }
  return dup
}

/** 设备离线区间，半开区间 [offlineAt, restoredAt)，未恢复时终点为 asOf。 */
function offlineIntervals(devices: Device[], incidents: Dataset['incidents'], asOf: number) {
  const byDevice = new Map<string, Array<[number, number]>>()
  for (const inc of incidents) {
    const start = parseInstant(inc.offlineAt)
    const end = inc.restoredAt === null ? asOf : parseInstant(inc.restoredAt)
    if (start === null || end === null) continue
    const list = byDevice.get(inc.deviceId) ?? []
    list.push([start, end])
    byDevice.set(inc.deviceId, list)
  }
  return byDevice
}

function inOffline(list: Array<[number, number]>, t: number | null): boolean {
  if (t === null) return false
  return list.some(([s, e]) => t >= s && t < e)
}

export function validateDataset(
  input: unknown,
  options: { enforceDemo?: boolean } = {},
): ValidationResult {
  const enforceDemo = options.enforceDemo ?? true
  const errors: string[] = []

  const parsed = datasetSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 30)) {
      push(errors, 'SCHEMA', `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    return { errors }
  }
  const data = parsed.data as Dataset
  const { meta, sites, devices, sessions, tasks, scans, shares, incidents } = data

  const asOf = parseInstant(meta.asOf)
  if (asOf === null) push(errors, 'TIME_FORMAT', `meta.asOf 不是带时区的合法时间: ${meta.asOf}`)

  // 1. 主键唯一
  for (const [table, rows] of Object.entries<Array<{ id: string }>>({
    sites, devices, sessions, tasks, scans, shares, incidents,
  })) {
    for (const id of duplicates(rows)) push(errors, 'DUPLICATE_ID', `${table} 中 id 重复: ${id}`)
  }

  // 2. 时间可解析
  const timeTargets: Array<[string, string | null | undefined]> = [
    ...sessions.map((r): [string, string] => [`session ${r.id}.startedAt`, r.startedAt]),
    ...devices.map((r): [string, string | null] => [`device ${r.id}.registeredAt`, r.registeredAt]),
    ...devices.map((r): [string, string | null] => [`device ${r.id}.lastHeartbeatAt`, r.lastHeartbeatAt]),
    ...tasks.map((r): [string, string | null] => [`task ${r.id}.submittedAt`, r.submittedAt]),
    ...tasks.map((r): [string, string | null] => [`task ${r.id}.finishedAt`, r.finishedAt]),
    ...tasks.map((r): [string, string | null] => [`task ${r.id}.moderatedAt`, r.moderatedAt]),
    ...tasks.map((r): [string, string | null] => [`task ${r.id}.displayedAt`, r.displayedAt]),
    ...scans.map((r): [string, string] => [`scan ${r.id}.scannedAt`, r.scannedAt]),
    ...shares.map((r): [string, string] => [`share ${r.id}.sharedAt`, r.sharedAt]),
    ...incidents.map((r): [string, string] => [`incident ${r.id}.offlineAt`, r.offlineAt]),
    ...incidents.map((r): [string, string | null] => [`incident ${r.id}.restoredAt`, r.restoredAt]),
  ]
  const parsedTime = new Map<string, number>()
  for (const [label, value] of timeTargets) {
    if (value === null || value === undefined) continue
    const ms = parseInstant(value)
    if (ms === null) push(errors, 'TIME_FORMAT', `${label} 缺少时区或不是合法时间: ${String(value)}`)
    else {
      parsedTime.set(label, ms)
      if (asOf !== null && ms > asOf) push(errors, 'FUTURE_TIME', `${label} 晚于快照 ${meta.asOf}`)
    }
  }

  // 3. 外键
  const siteIds = new Set(sites.map(s => s.id))
  const deviceById = new Map(devices.map(d => [d.id, d]))
  const sessionById = new Map(sessions.map(s => [s.id, s]))
  const taskById = new Map(tasks.map(t => [t.id, t]))

  for (const d of devices) if (!siteIds.has(d.siteId)) push(errors, 'FOREIGN_KEY', `device ${d.id}.siteId 不存在: ${d.siteId}`)
  for (const s of sessions) {
    if (!siteIds.has(s.siteId)) push(errors, 'FOREIGN_KEY', `session ${s.id}.siteId 不存在: ${s.siteId}`)
    if (!deviceById.has(s.deviceId)) push(errors, 'FOREIGN_KEY', `session ${s.id}.deviceId 不存在: ${s.deviceId}`)
  }
  for (const t of tasks) if (!sessionById.has(t.sessionId)) push(errors, 'FOREIGN_KEY', `task ${t.id}.sessionId 不存在: ${t.sessionId}`)
  for (const sc of scans) if (!taskById.has(sc.taskId)) push(errors, 'FOREIGN_KEY', `scan ${sc.id}.taskId 不存在: ${sc.taskId}`)
  for (const sh of shares) if (!taskById.has(sh.taskId)) push(errors, 'FOREIGN_KEY', `share ${sh.id}.taskId 不存在: ${sh.taskId}`)
  for (const inc of incidents) if (!deviceById.has(inc.deviceId)) push(errors, 'FOREIGN_KEY', `incident ${inc.id}.deviceId 不存在: ${inc.deviceId}`)

  // 4. 设备与会话的点位一致，且会话不得早于设备注册
  for (const s of sessions) {
    const d = deviceById.get(s.deviceId)
    if (!d) continue
    if (d.siteId !== s.siteId) {
      push(errors, 'DEVICE_SITE', `session ${s.id} 的 siteId(${s.siteId}) 与 device ${d.id} 的 siteId(${d.siteId}) 不一致`)
    }
    const started = parseInstant(s.startedAt)
    const registered = parseInstant(d.registeredAt)
    if (started !== null && registered !== null && started < registered) {
      push(errors, 'BEFORE_REGISTRATION', `session ${s.id} 早于 device ${d.id} 的注册时间`)
    }
  }

  // 5. 离线区间：顺序与不重叠
  const intervals = offlineIntervals(devices, incidents, asOf ?? Number.POSITIVE_INFINITY)
  for (const inc of incidents) {
    const s = parseInstant(inc.offlineAt)
    const e = inc.restoredAt === null ? null : parseInstant(inc.restoredAt)
    if (s !== null && e !== null && e < s) push(errors, 'INCIDENT_ORDER', `incident ${inc.id} 的恢复时间早于离线开始时间`)
  }
  for (const [deviceId, list] of intervals) {
    const sorted = [...list].sort((a, b) => a[0] - b[0])
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][0] < sorted[i - 1][1]) {
        push(errors, 'INCIDENT_OVERLAP', `device ${deviceId} 的离线区间重叠`)
        break
      }
    }
  }

  // 6. 离线期间不得产生新的现场会话、提交或展示
  for (const s of sessions) {
    if (inOffline(intervals.get(s.deviceId) ?? [], parseInstant(s.startedAt))) {
      push(errors, 'OFFLINE_SESSION', `session ${s.id} 开始于 device ${s.deviceId} 的离线区间内`)
    }
  }

  // 7. 任务时序与状态
  for (const t of tasks) {
    const session = sessionById.get(t.sessionId)
    const submitted = parseInstant(t.submittedAt)
    const finished = t.finishedAt === null ? null : parseInstant(t.finishedAt)

    if (session) {
      const started = parseInstant(session.startedAt)
      if (started !== null && submitted !== null && submitted < started) {
        push(errors, 'TASK_ORDER', `task ${t.id} 的提交时间早于所属会话开始时间`)
      }
      if (inOffline(intervals.get(session.deviceId) ?? [], submitted)) {
        push(errors, 'OFFLINE_SUBMISSION', `task ${t.id} 提交于 device ${session.deviceId} 的离线区间内`)
      }
      // 已完成的云端任务可以在设备离线后结束；仅"展示"要求设备可用
      if (inOffline(intervals.get(session.deviceId) ?? [], t.displayedAt === null ? null : parseInstant(t.displayedAt))) {
        push(errors, 'OFFLINE_DISPLAY', `task ${t.id} 在 device ${session.deviceId} 离线期间被展示`)
      }
    }
    if (finished !== null && submitted !== null && finished < submitted) {
      push(errors, 'TASK_ORDER', `task ${t.id} 的完成时间早于提交时间`)
    }

    const ended = t.status === 'success' || t.status === 'failed' || t.status === 'timeout'
    if (ended && t.finishedAt === null) push(errors, 'FINISH_STATE', `task ${t.id} 状态为 ${t.status} 但没有完成时间`)
    if (!ended && t.finishedAt !== null) push(errors, 'FINISH_STATE', `task ${t.id} 状态为 ${t.status} 但存在完成时间`)

    // 审核与展示
    if (t.status !== 'success') {
      if (t.moderationStatus !== 'not_applicable' || t.moderatedAt !== null || t.displayedAt !== null) {
        push(errors, 'NON_SUCCESS_STATE', `task ${t.id} 非成功状态却带有审核或展示信息`)
      }
    } else {
      if (t.moderationStatus === 'not_applicable') {
        push(errors, 'SUCCESS_MODERATION', `task ${t.id} 已成功但审核状态为 not_applicable`)
      }
      if (t.moderationStatus === 'pending' && t.moderatedAt !== null) {
        push(errors, 'PENDING_DECISION', `task ${t.id} 仍待审但已有审核决定时间`)
      }
      if (t.moderationStatus === 'rejected' && t.displayedAt !== null) {
        push(errors, 'REJECTED_DISPLAY', `task ${t.id} 审核被拒却已展示`)
      }
    }

    const moderated = t.moderatedAt === null ? null : parseInstant(t.moderatedAt)
    const displayed = t.displayedAt === null ? null : parseInstant(t.displayedAt)
    if (moderated !== null && finished !== null && moderated < finished) {
      push(errors, 'MODERATION_ORDER', `task ${t.id} 的审核决定时间早于生成完成时间`)
    }
    if (displayed !== null && moderated !== null && displayed < moderated) {
      push(errors, 'DISPLAY_ORDER', `task ${t.id} 的展示时间早于审核通过时间`)
    }
  }

  // 8. 扫码与分享必须挂在已展示的可领取结果上
  const claimable = (taskId: string) => {
    const t = taskById.get(taskId)
    if (!t) return null
    if (t.status !== 'success' || t.moderationStatus !== 'approved' || t.displayedAt === null) return null
    return parseInstant(t.displayedAt)
  }
  const checkEvent = (kind: 'SCAN' | 'SHARE', id: string, taskId: string, at: unknown) => {
    const t = taskById.get(taskId)
    if (!t) return
    const shown = claimable(taskId)
    if (shown === null) {
      push(errors, `INVALID_${kind}`, `${kind.toLowerCase()} ${id} 关联的任务 ${taskId} 不是已展示的审核通过结果`)
      return
    }
    const when = parseInstant(at)
    if (when !== null && when < shown) {
      push(errors, 'EVENT_ORDER', `${kind.toLowerCase()} ${id} 发生在结果展示之前`)
    }
  }
  for (const sc of scans) checkEvent('SCAN', sc.id, sc.taskId, sc.scannedAt)
  for (const sh of shares) checkEvent('SHARE', sh.id, sh.taskId, sh.sharedAt)

  // 9. 固定演示规模
  if (enforceDemo) {
    const participants = new Set(sessions.map(s => s.participantId)).size
    if (sites.length !== DEMO_SCALE.sites) push(errors, 'DEMO_SCALE', `点位数量应为 ${DEMO_SCALE.sites}，实际 ${sites.length}`)
    if (devices.length !== DEMO_SCALE.devices) push(errors, 'DEMO_SCALE', `设备数量应为 ${DEMO_SCALE.devices}，实际 ${devices.length}`)
    if (sessions.length !== DEMO_SCALE.sessions) push(errors, 'DEMO_SCALE', `会话数量应为 ${DEMO_SCALE.sessions}，实际 ${sessions.length}`)
    if (participants !== DEMO_SCALE.participants) push(errors, 'DEMO_SCALE', `去重参与者应为 ${DEMO_SCALE.participants}，实际 ${participants}`)
  }

  return { errors, data }
}
