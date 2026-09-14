/**
 * 固定演示范围。"最近 7 天 / 最近 30 天"一律相对数据集结束日计算，
 * 而不是电脑当天——否则换一台机器打开就会出现空数据。
 */
export const DEMO = {
  /** 数据集覆盖范围。 */
  fullStart: '2026-08-01',
  /** 数据集结束日，也就是观察截止所在的北京日期。 */
  end: '2026-08-30',
  /** 默认展示范围：最近 7 天。 */
  defaultStart: '2026-08-24',
  /** 观察截止时刻，设备快照与待审等待时长均以此为界。 */
  asOf: '2026-08-30T20:00:00+08:00',
} as const

export const DEFAULT_FILTERS = {
  start: DEMO.defaultStart,
  end: DEMO.end,
  siteIds: [] as string[],
} as const
