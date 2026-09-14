export interface Meta { datasetVersion: string; seed: string; activityId: string; activityName: string; timezone: string; dateStart: string; dateEnd: string; asOf: string; schemaVersion: string; rulesVersion: string }
export interface Site { id: string; name: string; city: string; addressLabel: string }
export interface Device { id: string; siteId: string; name: string; registeredAt: string; lastHeartbeatAt: string | null }
export interface Session { id: string; participantId: string; siteId: string; deviceId: string; startedAt: string }
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'timeout'
export type ModerationStatus = 'not_applicable' | 'pending' | 'approved' | 'rejected'
export interface GenerationTask { id: string; sessionId: string; templateId: string; submittedAt: string; finishedAt: string | null; status: TaskStatus; attemptCount: number; errorCode: string | null; moderationStatus: ModerationStatus; moderatedAt: string | null; moderationReasonCode: string | null; displayedAt: string | null }
export interface ScanEvent { id: string; taskId: string; scannedAt: string }
export interface ShareEvent { id: string; taskId: string; sharedAt: string; channel: 'wechat' | 'moments' | 'copy_link' | 'other' }
export interface DeviceIncident { id: string; deviceId: string; offlineAt: string; restoredAt: string | null; reasonCode: string }
export interface Dataset { meta: Meta; sites: Site[]; devices: Device[]; sessions: Session[]; tasks: GenerationTask[]; scans: ScanEvent[]; shares: ShareEvent[]; incidents: DeviceIncident[] }
export interface Filters {
  start: string
  end: string
  siteIds: string[]
  /**
   * 观察截止时刻。省略时取数据集快照时间。
   * 时间回放传入某一刻，会话与任务会按该时刻「当时的样子」重算：
   * 尚未提交的任务不出现，尚未完成的任务显示为生成中，
   * 尚未发生的审核与展示结果一律不可见。
   */
  asOf?: string
}
export interface DatasetIndex { sessions: Map<string, Session>; tasks: Map<string, GenerationTask>; tasksBySession: Map<string, GenerationTask[]>; scansByTask: Map<string, ScanEvent[]>; sharesByTask: Map<string, ShareEvent[]> }
export interface Cohort { dataset: Dataset; index: DatasetIndex; sessions: Session[]; tasks: GenerationTask[]; scans: ScanEvent[]; shares: ShareEvent[]; asOf: string }
export interface OverviewMetrics { participants: number; sessions: number; success: number; ended: number; queued: number; running: number; successRate: number | null; claimable: number; scanned: number; shared: number; scanRate: number | null; shareRate: number | null; averageSeconds: number | null; p90Seconds: number | null; durations: number[]; approved: number; rejected: number; pending: number; rejectionRate: number | null; overduePending: number }
export interface FunnelMetrics { started: number; submitted: number; succeeded: number; claimable: number; scanned: number; shared: number }

/** 按参与日期展开的序列点。零样本的比例与时长一律为 null，由展示层渲染为 —。 */
export interface DailyPoint {
  date: string
  participants: number
  sessions: number
  successRate: number | null
  averageSeconds: number | null
  p90Seconds: number | null
  scanRate: number | null
  shareRate: number | null
}

/** 小时级序列点，用于当日实时视图。零样本的小时同样为 null 而非 0。 */
export interface HourlyPoint {
  hour: string
  label: string
  participants: number
  sessions: number
  ended: number
  successRate: number | null
  averageSeconds: number | null
  p90Seconds: number | null
  scanRate: number | null
  shareRate: number | null
}

export interface SiteMetrics {
  siteId: string
  siteName: string
  participants: number
  sessions: number
  successRate: number | null
  scanRate: number | null
  shareRate: number | null
  averageSeconds: number | null
  p90Seconds: number | null
  anomalies: number
}
export type DeviceStatus = 'online' | 'offline' | 'unknown'
export interface DeviceSnapshot { online: number; offline: number; unknown: number; devices: Array<Device & { status: DeviceStatus }> }
export type AnomalyType = 'generation_success' | 'generation_duration' | 'scan_conversion' | 'share_conversion' | 'moderation_backlog' | 'device_offline' | 'device_unknown'
export type Severity = 'critical' | 'warning' | 'info'
export interface Anomaly { id: string; type: AnomalyType; title: string; severity: 'critical' | 'warning' | 'info'; siteId: string; deviceId?: string; bucketDate?: string; offlineAt?: string; restoredAt?: string | null; observedAt: string; rule: string; actual: number; threshold: number; numerator: number; denominator: number; sampleSize: number; taskIds: string[]; sessionIds: string[]; incidentId?: string; suggestion: string; scanRate?: number | null; shareRate?: number | null }
