import type { Dataset, DeviceSnapshot, DeviceStatus } from './types'
import { THRESHOLDS } from '../config/thresholds'

/**
 * 设备当前状态是"截至快照"的判定结果，不随业务日期变化。
 * 心跳为空是"未知"（从未上报），不能与"已确认离线"混为一谈。
 */
export function deviceStatusOf(lastHeartbeatAt: string | null, asOf: string): DeviceStatus {
  if (lastHeartbeatAt === null) return 'unknown'
  const gap = Date.parse(asOf) - Date.parse(lastHeartbeatAt)
  // 心跳晚于快照属数据非法，不能算作在线
  if (!Number.isFinite(gap) || gap < 0) return 'unknown'
  return gap <= THRESHOLDS.heartbeatOnlineSeconds * 1000 ? 'online' : 'offline'
}

export function getDeviceSnapshot(dataset: Dataset, siteIds: readonly string[], asOf: string): DeviceSnapshot {
  const filter = siteIds.length === 0 ? null : new Set(siteIds)
  const devices = dataset.devices
    .filter(d => filter === null || filter.has(d.siteId))
    .map(d => ({ ...d, status: deviceStatusOf(d.lastHeartbeatAt, asOf) }))

  return {
    online: devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
    unknown: devices.filter(d => d.status === 'unknown').length,
    devices,
  }
}

export type DeviceInterval = {
  id: string
  deviceId: string
  offlineAt: string
  restoredAt: string | null
  reasonCode: string
}

/**
 * 历史离线事件按区间与所选日期是否相交筛选。
 * 区间取半开 [offlineAt, restoredAt)，未恢复时终点为快照；
 * 只检查离线起始日会漏掉跨日仍在离线的设备。
 */
export function selectVisibleIncidents(
  dataset: Dataset,
  siteIds: readonly string[],
  startMs: number,
  endMs: number,
): DeviceInterval[] {
  const deviceSite = new Map(dataset.devices.map(d => [d.id, d.siteId]))
  const filter = siteIds.length === 0 ? null : new Set(siteIds)
  const asOfMs = Date.parse(dataset.meta.asOf)

  return dataset.incidents.filter(inc => {
    const site = deviceSite.get(inc.deviceId)
    if (!site) return false
    if (filter !== null && !filter.has(site)) return false
    const from = Date.parse(inc.offlineAt)
    const to = inc.restoredAt === null ? asOfMs : Date.parse(inc.restoredAt)
    return from < endMs && to > startMs
  }).map(({ id, deviceId, offlineAt, restoredAt, reasonCode }) => ({ id, deviceId, offlineAt, restoredAt, reasonCode }))
}
