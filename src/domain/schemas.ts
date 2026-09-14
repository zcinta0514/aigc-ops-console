import { z } from 'zod'

/**
 * 结构校验（SCHEMA）只负责字段类型与枚举取值。
 * 时间语义（时区、日历合法性、事件顺序）由 scripts/validation.ts 的不变式层负责，
 * 报错码为 TIME_FORMAT 等，两者分工不得混淆。
 */
const text = z.string()

export const metaSchema = z.object({
  datasetVersion: text,
  seed: text,
  activityId: text,
  activityName: text,
  timezone: text,
  dateStart: text,
  dateEnd: text,
  asOf: text,
  schemaVersion: text,
  rulesVersion: text,
})

export const siteSchema = z.object({
  id: text,
  name: text,
  city: text,
  addressLabel: text,
})

export const deviceSchema = z.object({
  id: text,
  siteId: text,
  name: text,
  registeredAt: text,
  lastHeartbeatAt: text.nullable(),
})

export const sessionSchema = z.object({
  id: text,
  participantId: text,
  siteId: text,
  deviceId: text,
  startedAt: text,
})

export const taskSchema = z.object({
  id: text,
  sessionId: text,
  templateId: text,
  submittedAt: text,
  finishedAt: text.nullable(),
  status: z.enum(['queued', 'running', 'success', 'failed', 'timeout']),
  attemptCount: z.number().int().min(1),
  errorCode: text.nullable(),
  moderationStatus: z.enum(['not_applicable', 'pending', 'approved', 'rejected']),
  moderatedAt: text.nullable(),
  moderationReasonCode: text.nullable(),
  displayedAt: text.nullable(),
})

export const scanSchema = z.object({
  id: text,
  taskId: text,
  scannedAt: text,
})

export const shareSchema = z.object({
  id: text,
  taskId: text,
  sharedAt: text,
  channel: z.enum(['wechat', 'moments', 'copy_link', 'other']),
})

export const incidentSchema = z.object({
  id: text,
  deviceId: text,
  offlineAt: text,
  restoredAt: text.nullable(),
  reasonCode: text,
})

export const datasetSchema = z.object({
  meta: metaSchema,
  sites: z.array(siteSchema),
  devices: z.array(deviceSchema),
  sessions: z.array(sessionSchema),
  tasks: z.array(taskSchema),
  scans: z.array(scanSchema),
  shares: z.array(shareSchema),
  incidents: z.array(incidentSchema),
})

/** 固定演示规模：schemas 只描述形状，规模约束在不变式层以 DEMO_SCALE 报出。 */
export const DEMO_SCALE = {
  sites: 6,
  devices: 12,
  sessions: 6000,
  participants: 4500,
} as const
