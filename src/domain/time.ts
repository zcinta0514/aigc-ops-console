/**
 * 日期边界一律以北京时间解释。禁止用 new Date('YYYY-MM-DD') 或本地时区方法
 * 推导边界，否则在不同时区的机器上，同一个筛选会得到不同的会话集合。
 */
export const BJ_OFFSET_MS = 8 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

export function dayStartMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) - BJ_OFFSET_MS
}

/** 该日期在北京时间的下一个零点，作为半开区间的上界。 */
export function dayEndMs(date: string): number {
  return dayStartMs(date) + DAY_MS
}

/** 绝对时间戳对应的北京日期，形如 2026-08-26。 */
export function beijingDateOf(ms: number): string {
  return new Date(ms + BJ_OFFSET_MS).toISOString().slice(0, 10)
}

/** 是否落在 [startDate, endDate] 的北京自然日范围内。 */
export function inDateRange(iso: string, startDate: string, endDate: string): boolean {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return false
  return ms >= dayStartMs(startDate) && ms < dayEndMs(endDate)
}

export function addDays(date: string, days: number): string {
  return beijingDateOf(dayStartMs(date) + days * DAY_MS)
}

/** 枚举 [start, end] 内的全部北京日期。 */
export function eachDate(startDate: string, endDate: string): string[] {
  const out: string[] = []
  for (let t = dayStartMs(startDate); t < dayEndMs(endDate); t += DAY_MS) {
    out.push(beijingDateOf(t))
  }
  return out
}

/** 校验 YYYY-MM-DD 且日历合法，用于拒绝 URL 中的无效日期。 */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return beijingDateOf(dayStartMs(value)) === value
}

/** 离线区间的终点：未恢复时以快照时间为界，保证区间始终可比。 */
export function intervalEnd(restoredAt: string | null, asOf: string): number {
  return restoredAt === null ? Date.parse(asOf) : Date.parse(restoredAt)
}
