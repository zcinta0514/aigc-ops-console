/**
 * 固定演示设定。全部数值为原型演示参数，不代表真实业务基准或生产 SLA。
 * 改动此处会改变数据指纹，必须同步重跑 data:generate 与 data:verify。
 */
export const DEMO = {
  datasetVersion: 'v1',
  seed: 'aigc-ops-demo-v1',
  activityId: 'ACT01',
  activityName: '光影共创体验',
  timezone: 'Asia/Shanghai',
  dateStart: '2026-08-01',
  dateEnd: '2026-08-30',
  asOf: '2026-08-30T20:00:00+08:00',
  schemaVersion: '1.0.0',
  rulesVersion: '2.0.0',
  sessionCount: 6000,
  participantCount: 4500,
  openMinute: 10 * 60,
  closeMinute: 22 * 60,
} as const

export const SITES = [
  { id: 'S01', name: '星河广场中庭', city: '演示市', addressLabel: '虚构点位 · 中庭主入口' },
  { id: 'S02', name: '云汀购物中心', city: '演示市', addressLabel: '虚构点位 · 三层连廊' },
  { id: 'S03', name: '长街光影馆', city: '演示市', addressLabel: '虚构点位 · 西区展陈厅' },
  { id: 'S04', name: '拾贝里街区', city: '演示市', addressLabel: '虚构点位 · 步行街北口' },
  { id: 'S05', name: '南岸艺术中心', city: '演示市', addressLabel: '虚构点位 · 一层大厅' },
  { id: 'S06', name: '曜石影城', city: '演示市', addressLabel: '虚构点位 · 影厅前厅' },
] as const

/** S01 对应 D01/D02，依次类推；S06 对应 D11/D12。 */
export const DEVICES_PER_SITE = 2

/** 历史与当前离线区间；restoredAt 为 null 表示截至快照仍未恢复。 */
export const OFFLINE_INCIDENTS = [
  { id: 'I0001', deviceId: 'D06', offlineAt: '2026-08-25T15:10:00+08:00', restoredAt: '2026-08-25T15:40:00+08:00', reasonCode: 'NETWORK_UNREACHABLE' },
  { id: 'I0002', deviceId: 'D11', offlineAt: '2026-08-30T18:10:00+08:00', restoredAt: null, reasonCode: 'POWER_LOST' },
] as const

/** D12 在快照前 10 分钟才注册且从未上报心跳，状态为未知。 */
export const NEVER_REPORTED_DEVICE = { id: 'D12', registeredAt: '2026-08-30T19:50:00+08:00' } as const

export type Profile = {
  /** 成功任务中"慢任务"的占比，用于制造长尾。 */
  slowShare: number
  slowMin: number
  slowMax: number
  fastMin: number
  fastMax: number
  successRate: number
  timeoutShareOfFailure: number
  scanRate: number
  shareRate: number
  /** 成功任务中审核被拒的比例。 */
  rejectedRate: number
  /** 成功任务中仍待审的比例。 */
  pendingRate: number
  /** 已通过审核但截至快照尚未展示的比例（设备离线时自然产生）。 */
  undisplayedRate: number
  /** 单条会话产生 2 个任务的比例。 */
  twoTaskShare: number
  /** 无任务会话比例。 */
  noTaskShare: number
}

export const NORMAL: Profile = {
  slowShare: 0.03,
  slowMin: 20,
  slowMax: 35,
  fastMin: 6,
  fastMax: 12,
  successRate: 0.97,
  timeoutShareOfFailure: 0.4,
  scanRate: 0.45,
  shareRate: 0.25,
  rejectedRate: 0.05,
  pendingRate: 0.06,
  undisplayedRate: 0.02,
  twoTaskShare: 0.07,
  noTaskShare: 0.08,
}

/** 各点位/日期的会话量权重，用于制造点位差异与周末高峰。 */
export const SITE_WEIGHT: Record<string, number> = {
  S01: 1.15, S02: 1.0, S03: 1.05, S04: 0.95, S05: 1.0, S06: 0.85,
}

export const WEEKEND_WEIGHT = 1.35

/**
 * 受控异常的时段画像。键为「点位|日期」，窗口为当天第几分钟的闭开区间 [from, to)。
 * 这些是配额而非概率：生成器按此构造记录，再由断言确认目标命中。
 */
export type WindowOverride = {
  siteId: string
  date: string
  from: number
  to: number
  profile: Partial<Profile>
  /** 该窗口的额外会话量倍数，用于把异常推到可检出的规模。 */
  volumeBoost?: number
}

export const WINDOW_OVERRIDES: WindowOverride[] = [
  // A01 生成失败与长尾耗时：S03 / 8-26 / 14:00—17:00。
  // 成功样本普遍进入 35—75 秒区间，使当日 P90 稳定高于 20 秒；平均耗时仍可能"看着正常"。
  {
    siteId: 'S03', date: '2026-08-26', from: 14 * 60, to: 17 * 60,
    profile: {
      successRate: 0.6,
      slowShare: 1.0,
      slowMin: 35,
      slowMax: 75,
      timeoutShareOfFailure: 0.8,
    },
    volumeBoost: 1.5,
  },
  // A02 扫码领取偏低：S02 / 8-24、8-27、8-29。生成与耗时保持正常，只压低领取率。
  ...['2026-08-24', '2026-08-27', '2026-08-29'].map(date => ({
    siteId: 'S02', date, from: 0, to: 24 * 60,
    profile: { scanRate: 0.12, shareRate: 0.2 },
    volumeBoost: 1.3,
  })),
  // A05 扫码正常但分享极低：S05 / 8-28。若两个指标合并，这条异常将不可见。
  {
    siteId: 'S05', date: '2026-08-28', from: 0, to: 24 * 60,
    profile: { scanRate: 0.45, shareRate: 0.02 },
    volumeBoost: 1.15,
  },
]

/**
 * 快照前的未完结任务配额。每个点位在观察截止前的一小段窗口内固定产生若干条
 * 仍在排队/生成中的任务——这正是"截至快照仍未结束"的真实形态。
 * 若不显式配额，任务总在几秒内完成，页面上就永远不会出现进行中的任务。
 */
export const UNFINISHED_QUOTA = { perSite: 4, windowMinutes: 25 } as const

/** A03 审核积压：S04 / 8-30 / 18:30—19:40 完成的成功任务截至快照仍待审。 */
export const BACKLOG_WINDOW = {
  siteId: 'S04',
  date: '2026-08-30',
  from: 18 * 60 + 30,
  to: 19 * 60 + 40,
  sessions: 20,
} as const

/** 快照前的未完结任务窗口：普通排队/生成中任务集中在此。 */
export const UNFINISHED_WINDOW_MINUTES = 25
