import type { Dataset } from '../../src/domain/types'
import { p90 } from '../../src/domain/percentiles'
import { dateOf } from './time'

/**
 * 受控异常的实测值。生成器结束前必须逐条核对，任一未命中即让 data:generate 返回非零，
 * 不允许"生成完再看运气"。
 */
export type TargetCheck = {
  id: string
  label: string
  pass: boolean
  detail: string
}

type SiteDay = {
  ended: number
  success: number
  durations: number[]
  claimableSessions: number
  scannedSessions: number
  sharedSessions: number
}

function siteDayIndex(dataset: Dataset): Map<string, SiteDay> {
  const index = new Map<string, SiteDay>()
  const key = (siteId: string, date: string) => `${siteId}|${date}`
  const get = (siteId: string, date: string) => {
    const k = key(siteId, date)
    let v = index.get(k)
    if (!v) {
      v = { ended: 0, success: 0, durations: [], claimableSessions: 0, scannedSessions: 0, sharedSessions: 0 }
      index.set(k, v)
    }
    return v
  }

  const sessionById = new Map(dataset.sessions.map(s => [s.id, s]))
  const scannedTasks = new Set(dataset.scans.map(s => s.taskId))
  const sharedTasks = new Set(dataset.shares.map(s => s.taskId))
  const claimableBySession = new Map<string, boolean>()
  const scannedBySession = new Map<string, boolean>()
  const sharedBySession = new Map<string, boolean>()

  for (const t of dataset.tasks) {
    const session = sessionById.get(t.sessionId)
    if (!session) continue
    const date = dateOf(Date.parse(session.startedAt))
    const bucket = get(session.siteId, date)
    if (t.status === 'success' || t.status === 'failed' || t.status === 'timeout') bucket.ended++
    if (t.status === 'success') {
      bucket.success++
      if (t.finishedAt) bucket.durations.push((Date.parse(t.finishedAt) - Date.parse(t.submittedAt)) / 1000)
      if (t.moderationStatus === 'approved' && t.displayedAt !== null) {
        claimableBySession.set(session.id, true)
        if (scannedTasks.has(t.id)) scannedBySession.set(session.id, true)
        if (sharedTasks.has(t.id)) sharedBySession.set(session.id, true)
      }
    }
  }

  for (const s of dataset.sessions) {
    const date = dateOf(Date.parse(s.startedAt))
    const bucket = get(s.siteId, date)
    if (claimableBySession.get(s.id)) bucket.claimableSessions++
    if (scannedBySession.get(s.id)) bucket.scannedSessions++
    if (sharedBySession.get(s.id)) bucket.sharedSessions++
  }
  return index
}

export function checkTargets(dataset: Dataset): TargetCheck[] {
  const index = siteDayIndex(dataset)
  const at = (siteId: string, date: string) =>
    index.get(`${siteId}|${date}`) ?? { ended: 0, success: 0, durations: [], claimableSessions: 0, scannedSessions: 0, sharedSessions: 0 }
  const checks: TargetCheck[] = []

  const rate = (num: number, den: number) => (den === 0 ? null : num / den)

  // A01 生成失败与长尾耗时
  {
    const b = at('S03', '2026-08-26')
    const sr = rate(b.success, b.ended)
    const p = p90(b.durations)
    checks.push({
      id: 'A01', label: 'S03 / 08-26 生成失败与长尾耗时',
      pass: b.ended >= 30 && sr !== null && sr < 0.95 && b.success >= 20 && p !== null && p > 20,
      detail: `已结束 ${b.ended}（≥30）、成功率 ${sr === null ? '—' : (sr * 100).toFixed(1) + '%'}（<95%）、成功样本 ${b.success}（≥20）、P90 ${p === null ? '—' : p.toFixed(1) + 's'}（>20s）`,
    })
  }

  // A02 扫码领取偏低，但生成与耗时正常
  {
    const parts = ['2026-08-24', '2026-08-27', '2026-08-29'].map(date => {
      const b = at('S02', date)
      const sr = rate(b.success, b.ended)
      const scan = rate(b.scannedSessions, b.claimableSessions)
      const avg = b.durations.length ? b.durations.reduce((a, c) => a + c, 0) / b.durations.length : null
      const ok = b.claimableSessions >= 20 && scan !== null && scan < 0.2
        && sr !== null && sr >= 0.95 && avg !== null && avg >= 6 && avg <= 12
      return { date, ok, detail: `${date.slice(5)} 可领取 ${b.claimableSessions}、领取率 ${scan === null ? '—' : (scan * 100).toFixed(1) + '%'}、成功率 ${sr === null ? '—' : (sr * 100).toFixed(1) + '%'}、均耗时 ${avg === null ? '—' : avg.toFixed(1) + 's'}` }
    })
    checks.push({
      id: 'A02', label: 'S02 / 08-24·27·29 扫码领取偏低',
      pass: parts.every(p => p.ok),
      detail: parts.map(p => p.detail).join('；'),
    })
  }

  // A03 审核积压
  {
    const from = Date.parse('2026-08-30T18:30:00+08:00')
    const to = Date.parse('2026-08-30T19:40:00+08:00')
    const asOf = Date.parse(dataset.meta.asOf)
    const sessionById = new Map(dataset.sessions.map(s => [s.id, s]))
    const pending = dataset.tasks.filter(t => {
      const s = sessionById.get(t.sessionId)
      if (!s || s.siteId !== 'S04' || t.status !== 'success' || t.moderationStatus !== 'pending') return false
      const fin = t.finishedAt ? Date.parse(t.finishedAt) : NaN
      return Number.isFinite(fin) && fin >= from && fin <= to && (asOf - fin) / 60000 > 10
    })
    checks.push({
      id: 'A03', label: 'S04 / 08-30 18:30—19:40 审核积压',
      pass: pending.length >= 15,
      detail: `等待超过 10 分钟的待审任务 ${pending.length}（≥15）`,
    })
  }

  // A04 设备离线未恢复
  {
    const inc = dataset.incidents.find(i => i.deviceId === 'D11' && i.restoredAt === null)
    const offlineMs = inc ? Date.parse(inc.offlineAt) : NaN
    const after = dataset.sessions.filter(s => s.deviceId === 'D11' && Date.parse(s.startedAt) >= offlineMs)
    const d11 = dataset.devices.find(d => d.id === 'D11')
    checks.push({
      id: 'A04', label: 'D11 / 08-30 18:10 起离线未恢复',
      pass: Boolean(inc) && after.length === 0 && Boolean(d11?.lastHeartbeatAt) && Date.parse(d11!.lastHeartbeatAt!) < offlineMs,
      detail: `未恢复离线事件 ${inc ? '存在' : '缺失'}、离线后新增会话 ${after.length}（=0）、最后心跳 ${d11?.lastHeartbeatAt ?? '—'}`,
    })
  }

  // A05 扫码正常但分享极低
  {
    const b = at('S05', '2026-08-28')
    const scan = rate(b.scannedSessions, b.claimableSessions)
    const share = rate(b.sharedSessions, b.claimableSessions)
    const sr = rate(b.success, b.ended)
    checks.push({
      id: 'A05', label: 'S05 / 08-28 扫码正常但分享极低',
      pass: b.claimableSessions >= 20 && scan !== null && scan >= 0.35 && scan <= 0.6
        && share !== null && share < 0.05 && sr !== null && sr >= 0.95,
      detail: `可领取 ${b.claimableSessions}（≥20）、领取率 ${scan === null ? '—' : (scan * 100).toFixed(1) + '%'}（35%—60%）、分享转化率 ${share === null ? '—' : (share * 100).toFixed(1) + '%'}（<5%）、成功率 ${sr === null ? '—' : (sr * 100).toFixed(1) + '%'}（≥95%）`,
    })
  }

  return checks
}
