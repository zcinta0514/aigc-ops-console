/**
 * 北京时间工具。生成器不依赖运行机器的时区，所有换算显式以 +08:00 完成，
 * 否则在不同时区的机器上会产出不同的数据文件。
 */
export const BJ_OFFSET_MS = 8 * 60 * 60 * 1000

export function bjDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** 由北京日期与"当天第几分钟(可含小数)"得到绝对毫秒时间戳。 */
export function bjAt(date: string, minutesOfDay: number): number {
  return bjDate(date) - BJ_OFFSET_MS + Math.round(minutesOfDay * 60_000)
}

export function msToIso(ms: number): string {
  const d = new Date(ms + BJ_OFFSET_MS)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+08:00`
  )
}

export function isoAt(date: string, minutesOfDay: number): string {
  return msToIso(bjAt(date, minutesOfDay))
}

export function minutesOfDay(ms: number): number {
  const d = new Date(ms + BJ_OFFSET_MS)
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60
}

export function dateOf(ms: number): string {
  return msToIso(ms).slice(0, 10)
}

export function isWeekend(date: string): boolean {
  const dow = new Date(bjDate(date)).getUTCDay()
  return dow === 0 || dow === 6
}

/** 生成 [start, end] 的连续日期序列。 */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = bjDate(start); t <= bjDate(end); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}
