import type { Anomaly, Dataset, Filters, GenerationTask, Severity } from './types'
import { THRESHOLDS } from '../config/thresholds'
import { p90 } from './percentiles'
import { beijingDateOf, eachDate } from './time'
import { deviceStatusOf } from './device-status'

/**
 * 异常一律从原始记录推导，不预先写入 anomalies.json。
 * 规则先在完整数据上按「点位 × 参与日期」分桶生成稳定结果，
 * 再按当前筛选展示——否则同一个异常在 7 天和 30 天筛选下会变成不同的东西。
 */

type Bucket = {
  siteId: string
  date: string
  ended: number
  success: number
  durations: number[]
  claimable: Set<string>
  scanned: Set<string>
  shared: Set<string>
  pendingOverdue: GenerationTask[]
  pendingTaskIds: string[]
  sessions: string[]
  taskIds: string[]
}

function buildBuckets(dataset: Dataset): Map<string, Bucket> {
  const asOfMs = Date.parse(dataset.meta.asOf)
  const taskById = new Map(dataset.tasks.map(t => [t.id, t]))
  const buckets = new Map<string, Bucket>()

  const touch = (siteId: string, date: string): Bucket => {
    const key = `${siteId}|${date}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        siteId, date, ended: 0, success: 0, durations: [],
        claimable: new Set(), scanned: new Set(), shared: new Set(),
        pendingOverdue: [], pendingTaskIds: [], sessions: [], taskIds: [],
      }
      buckets.set(key, b)
    }
    return b
  }

  const dateOfSession = new Map<string, { date: string; siteId: string }>()
  for (const s of dataset.sessions) {
    const info = { date: beijingDateOf(Date.parse(s.startedAt)), siteId: s.siteId }
    dateOfSession.set(s.id, info)
    touch(s.siteId, info.date).sessions.push(s.id)
  }

  const displayed = new Set<string>()
  for (const t of dataset.tasks) {
    const info = dateOfSession.get(t.sessionId)
    if (!info) continue
    const b = touch(info.siteId, info.date)
    b.taskIds.push(t.id)
    if (t.status === 'success' || t.status === 'failed' || t.status === 'timeout') b.ended++
    if (t.status !== 'success') continue
    b.success++
    if (t.finishedAt) b.durations.push((Date.parse(t.finishedAt) - Date.parse(t.submittedAt)) / 1000)
    if (t.moderationStatus === 'approved' && t.displayedAt !== null && Date.parse(t.displayedAt) <= asOfMs) {
      displayed.add(t.id)
      b.claimable.add(t.sessionId)
    }
    if (t.moderationStatus === 'pending' && t.finishedAt !== null
      && (asOfMs - Date.parse(t.finishedAt)) / 60_000 > THRESHOLDS.moderationBacklog.waitMinutes) {
      b.pendingOverdue.push(t)
      b.pendingTaskIds.push(t.id)
    }
  }
  for (const e of dataset.scans) {
    if (!displayed.has(e.taskId)) continue
    const t = taskById.get(e.taskId)
    if (!t) continue
    const info = dateOfSession.get(t.sessionId)
    if (info) touch(info.siteId, info.date).scanned.add(t.sessionId)
  }
  for (const e of dataset.shares) {
    if (!displayed.has(e.taskId)) continue
    const t = taskById.get(e.taskId)
    if (!t) continue
    const info = dateOfSession.get(t.sessionId)
    if (info) touch(info.siteId, info.date).shared.add(t.sessionId)
  }
  return buckets
}

const f1 = (v: number) => v.toFixed(1)

function makeAnomaly(a: Omit<Anomaly, 'id'> & { id: string }): Anomaly {
  return a
}

export function deriveAnomalies(dataset: Dataset): Anomaly[] {
  const T = THRESHOLDS
  const out: Anomaly[] = []
  const siteName = new Map(dataset.sites.map(s => [s.id, s.name]))
  const buckets = buildBuckets(dataset)

  for (const key of [...buckets.keys()].sort()) {
    const b = buckets.get(key)!
    const site = siteName.get(b.siteId) ?? b.siteId
    const base = { siteId: b.siteId, bucketDate: b.date, observedAt: dataset.meta.asOf, taskIds: b.taskIds, sessionIds: b.sessions }
    const label = `${site} ${b.date}`

    // 生成成功率低
    if (b.ended >= T.generationSuccess.minSample) {
      const rate = b.success / b.ended
      if (rate < T.generationSuccess.rate) {
        out.push(makeAnomaly({
          ...base,
          id: `gen-success|${b.siteId}|${b.date}`,
          type: 'generation_success',
          title: `${label} 生成成功率 ${f1(rate * 100)}%`,
          severity: rate < T.generationSuccess.criticalRate ? 'critical' : 'warning',
          rule: `已结束任务 ≥ ${T.generationSuccess.minSample} 且成功率 < ${T.generationSuccess.rate * 100}%`,
          actual: rate, threshold: T.generationSuccess.rate,
          numerator: b.success, denominator: b.ended, sampleSize: b.ended,
          suggestion: '下钻查看失败任务的错误码分布：超时集中则核查上游排队与超时配置，模型报错集中则核查服务可用性。',
        }))
      }
    }

    // 生成耗时高（以 P90 判定，平均值会被大量正常样本稀释而掩盖长尾）
    if (b.success >= T.generationDuration.minSample) {
      const p = p90(b.durations)
      if (p !== null && p > T.generationDuration.p90Seconds) {
        const avg = b.durations.reduce((a, c) => a + c, 0) / b.durations.length
        out.push(makeAnomaly({
          ...base,
          id: `gen-duration|${b.siteId}|${b.date}`,
          type: 'generation_duration',
          title: `${label} P90 生成耗时 ${f1(p)} 秒`,
          severity: p > T.generationDuration.criticalP90Seconds ? 'critical' : 'warning',
          rule: `成功任务 ≥ ${T.generationDuration.minSample} 且 P90 生成耗时 > ${T.generationDuration.p90Seconds} 秒`,
          actual: p, threshold: T.generationDuration.p90Seconds,
          numerator: Math.round(p * 10), denominator: 10, sampleSize: b.success,
          suggestion: `平均耗时 ${f1(avg)} 秒仍在正常区间，但尾部已明显恶化，建议核查该时段的重试与排队情况，不要只看均值。`,
        }))
      }
    }

    // 扫码领取率低
    if (b.claimable.size >= T.scanConversion.minSample) {
      const rate = b.scanned.size / b.claimable.size
      if (rate < T.scanConversion.rate) {
        out.push(makeAnomaly({
          ...base,
          id: `scan|${b.siteId}|${b.date}`,
          type: 'scan_conversion',
          title: `${label} 扫码领取率 ${f1(rate * 100)}%`,
          severity: 'warning',
          rule: `可领取会话 ≥ ${T.scanConversion.minSample} 且领取率 < ${T.scanConversion.rate * 100}%`,
          actual: rate, threshold: T.scanConversion.rate,
          numerator: b.scanned.size, denominator: b.claimable.size, sampleSize: b.claimable.size,
          suggestion: '生成与耗时若同时正常，问题更可能在现场环节：核查二维码可扫性、引导文案与摆放位置。',
        }))
      }
    }

    // 分享转化率低（与扫码分列，避免一个指标的高值把另一个异常拉平）
    if (b.claimable.size >= T.shareConversion.minSample) {
      const rate = b.shared.size / b.claimable.size
      if (rate < T.shareConversion.rate) {
        const scanRate = b.scanned.size / b.claimable.size
        out.push(makeAnomaly({
          ...base,
          id: `share|${b.siteId}|${b.date}`,
          type: 'share_conversion',
          title: `${label} 分享转化率 ${f1(rate * 100)}%`,
          severity: 'warning',
          rule: `可领取会话 ≥ ${T.shareConversion.minSample} 且分享转化率 < ${T.shareConversion.rate * 100}%`,
          actual: rate, threshold: T.shareConversion.rate,
          numerator: b.shared.size, denominator: b.claimable.size, sampleSize: b.claimable.size,
          scanRate, shareRate: rate,
          suggestion: scanRate >= T.scanConversion.rate
            ? `同期扫码领取率 ${f1(scanRate * 100)}% 正常，说明结果本身被领取了，卡点在传播环节：核查分享入口、分享文案与可分享形式。`
            : '扫码与分享同时偏低，问题更可能在上游的结果展示或现场引导，建议先核查领取环节。',
        }))
      }
    }

    // 审核积压
    if (b.pendingOverdue.length >= T.moderationBacklog.minSample) {
      const waits = b.pendingOverdue.map(t => (Date.parse(dataset.meta.asOf) - Date.parse(t.finishedAt!)) / 60_000)
      const maxWait = Math.max(...waits)
      out.push(makeAnomaly({
        ...base,
        id: `backlog|${b.siteId}|${b.date}`,
        type: 'moderation_backlog',
        title: `${label} 审核积压 ${b.pendingOverdue.length} 条`,
        severity: 'warning',
        rule: `等待超过 ${T.moderationBacklog.waitMinutes} 分钟的待审任务 ≥ ${T.moderationBacklog.minSample} 条`,
        actual: b.pendingOverdue.length, threshold: T.moderationBacklog.minSample,
        numerator: b.pendingOverdue.length, denominator: b.ended, sampleSize: b.ended,
        taskIds: b.pendingTaskIds,
        suggestion: `最长已等待 ${Math.round(maxWait)} 分钟。核查审核队列是否停滞；内容已生成但未过审，用户当场拿不到结果。`,
      }))
    }
  }

  // 设备离线：来自实际离线区间，未恢复的以快照为终点
  const deviceName = new Map(dataset.devices.map(d => [d.id, d.name]))
  for (const inc of [...dataset.incidents].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const device = dataset.devices.find(d => d.id === inc.deviceId)
    if (!device) continue
    const start = Date.parse(inc.offlineAt)
    const end = inc.restoredAt === null ? Date.parse(dataset.meta.asOf) : Date.parse(inc.restoredAt)
    const minutes = (end - start) / 60_000
    out.push(makeAnomaly({
      id: `offline|${inc.deviceId}|${inc.offlineAt}`,
      type: 'device_offline',
      title: `${deviceName.get(inc.deviceId) ?? inc.deviceId} ${inc.restoredAt === null ? '离线未恢复' : '历史离线'}`,
      severity: minutes >= THRESHOLDS.deviceOffline.criticalMinutes ? 'critical' : 'warning',
      siteId: device.siteId, deviceId: inc.deviceId,
      offlineAt: inc.offlineAt, restoredAt: inc.restoredAt,
      observedAt: dataset.meta.asOf,
      rule: `存在有效离线事件；持续 ≥ ${THRESHOLDS.deviceOffline.criticalMinutes} 分钟记为严重`,
      actual: Math.round(minutes), threshold: THRESHOLDS.deviceOffline.criticalMinutes,
      numerator: Math.round(minutes), denominator: 0, sampleSize: 0,
      taskIds: [], sessionIds: [], incidentId: inc.id,
      suggestion: inc.restoredAt === null
        ? '该点位离线期间无法展示结果，联系现场核查网络与供电。恢复前不要据该点位数据判断投放效果。'
        : '历史离线已恢复。若同时段领取率异常，可结合该区间一并核查。',
    }))
  }

  // 设备未知：从未上报心跳，属状态未知，不得冒充已确认故障
  for (const d of [...dataset.devices].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (deviceStatusOf(d.lastHeartbeatAt, dataset.meta.asOf) !== 'unknown') continue
    if (d.lastHeartbeatAt === null && dataset.incidents.some(i => i.deviceId === d.id)) continue
    out.push(makeAnomaly({
      id: `unknown|${d.id}`,
      type: 'device_unknown',
      title: `${d.name} 未上报心跳`,
      severity: 'info',
      siteId: d.siteId, deviceId: d.id,
      observedAt: dataset.meta.asOf,
      rule: '截至快照没有任何心跳记录，状态未知',
      actual: 0, threshold: 0, numerator: 0, denominator: 0, sampleSize: 0,
      taskIds: [], sessionIds: [],
      suggestion: '该设备从未上报心跳，属状态未知而非已确认离线。先确认是否完成激活与配网。',
    }))
  }

  return out
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** 按当前筛选展示，但异常本身仍来自完整数据，定义与证据不随筛选改变。 */
export function selectVisibleAnomalies(anomalies: readonly Anomaly[], filters: Filters): Anomaly[] {
  const siteFilter = filters.siteIds.length === 0 ? null : new Set(filters.siteIds)
  const dates = new Set(eachDate(filters.start, filters.end))
  const startMs = Date.parse(`${filters.start}T00:00:00+08:00`)
  const endMs = Date.parse(`${filters.end}T00:00:00+08:00`) + 86_400_000

  return anomalies
    .filter(a => {
      if (siteFilter !== null && !siteFilter.has(a.siteId)) return false
      if (a.bucketDate !== undefined) return dates.has(a.bucketDate)
      // 设备事件按区间是否与所选日期相交，而非只看起始日
      if (a.offlineAt !== undefined) {
        const from = Date.parse(a.offlineAt)
        const to = a.restoredAt === null || a.restoredAt === undefined ? Date.parse(a.observedAt) : Date.parse(a.restoredAt)
        return from < endMs && to > startMs
      }
      return true // 设备未知属快照信息，只跟随点位筛选
    })
    .sort((a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.bucketDate ?? '').localeCompare(b.bucketDate ?? '') ||
      a.id.localeCompare(b.id)) // 同等级同日期用稳定 id 兜底，避免顺序抖动
}
