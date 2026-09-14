import type {
  Dataset, Device, DeviceIncident, GenerationTask, ScanEvent, Session, ShareEvent, Site,
} from '../../src/domain/types'

/**
 * 手工构造的小样本。所有期望值都在测试里独立手算后写出，
 * 不得通过调用被测生产函数反算得到。
 */

export const AS_OF = '2026-08-30T20:00:00+08:00'

export function makeMeta(asOf = AS_OF) {
  return {
    datasetVersion: 'test', seed: 'test', activityId: 'ACT', activityName: '测试活动',
    timezone: 'Asia/Shanghai', dateStart: '2026-08-01', dateEnd: '2026-08-30',
    asOf, schemaVersion: '1.0.0', rulesVersion: '2.0.0',
  }
}

export function site(id: string, name = id): Site {
  return { id, name, city: '演示市', addressLabel: '虚构点位' }
}

export function device(id: string, siteId: string, over: Partial<Device> = {}): Device {
  return { id, siteId, name: id, registeredAt: '2026-08-01T00:00:00+08:00', lastHeartbeatAt: '2026-08-30T19:59:30+08:00', ...over }
}

export function session(id: string, participantId: string, siteId: string, deviceId: string, startedAt: string): Session {
  return { id, participantId, siteId, deviceId, startedAt }
}

const T0 = '2026-08-25T10:00:00+08:00'
const sec = (n: number) => new Date(Date.parse(T0) + n * 1000).toISOString().replace(/\.\d{3}Z$/, s => s)

/** 以 base 为起点加 n 秒，输出北京时间字符串。 */
export function at(baseIso: string, seconds: number): string {
  const d = new Date(Date.parse(baseIso) + seconds * 1000 + 8 * 3600 * 1000)
  return `${d.toISOString().slice(0, 19)}+08:00`
}

export function task(id: string, sessionId: string, over: Partial<GenerationTask> = {}): GenerationTask {
  return {
    id,
    sessionId,
    templateId: 'TPL',
    submittedAt: T0,
    finishedAt: at(T0, 10),
    status: 'success',
    attemptCount: 1,
    errorCode: null,
    moderationStatus: 'approved',
    moderatedAt: at(T0, 11),
    moderationReasonCode: null,
    displayedAt: at(T0, 12),
    ...over,
  }
}

export function scan(id: string, taskId: string, scannedAt: string): ScanEvent {
  return { id, taskId, scannedAt }
}

export function share(id: string, taskId: string, sharedAt: string): ShareEvent {
  return { id, taskId, sharedAt, channel: 'wechat' }
}

export function incident(id: string, deviceId: string, offlineAt: string, restoredAt: string | null, reasonCode = 'TEST'): DeviceIncident {
  return { id, deviceId, offlineAt, restoredAt, reasonCode }
}

export function makeDataset(parts: Partial<Dataset> & { asOf?: string }): Dataset {
  const { asOf, ...rest } = parts
  return {
    meta: makeMeta(asOf ?? AS_OF),
    sites: rest.sites ?? [site('S01')],
    devices: rest.devices ?? [device('D01', 'S01')],
    sessions: rest.sessions ?? [],
    tasks: rest.tasks ?? [],
    scans: rest.scans ?? [],
    shares: rest.shares ?? [],
    incidents: rest.incidents ?? [],
  }
}

export { T0, sec }
