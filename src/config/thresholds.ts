/**
 * 原型演示阈值，不是生产 SLA，也不是行业基准。
 * 全部集中于此，便于评审时逐条质疑与调整。
 */
export const THRESHOLDS = {
  /** 心跳距快照不超过该秒数视为在线。 */
  heartbeatOnlineSeconds: 120,

  generationSuccess: { minSample: 30, rate: 0.95, criticalRate: 0.85 },

  /**
   * 耗时异常以 P90 判定而非平均值。生成时长是长尾分布，平均值会被大量正常样本稀释：
   * 在 25% 的时段里把耗时推高数倍，日均值往往仍不越界，而 P90 能如实反映尾部恶化。
   */
  generationDuration: { minSample: 20, p90Seconds: 20, criticalP90Seconds: 40 },

  scanConversion: { minSample: 20, rate: 0.2 },

  shareConversion: { minSample: 20, rate: 0.1 },

  moderationBacklog: { minSample: 10, waitMinutes: 10 },

  deviceOffline: { criticalMinutes: 30 },
} as const

export type Thresholds = typeof THRESHOLDS
