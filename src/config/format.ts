const integerFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const integer = (value: number) => integerFormat.format(value)
export const decimal = (value: number | null) => value === null ? '—' : decimalFormat.format(value)
export const percent = (value: number | null) => value === null ? '—' : `${decimalFormat.format(value * 100)}%`
export const fraction = (numerator: number, denominator: number) => denominator ? `${integer(numerator)} / ${integer(denominator)}` : '暂无样本'
export function timestamp(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value))
}
export const taskLabels = { queued: '排队中', running: '生成中', success: '成功', failed: '失败', timeout: '超时' }
export const moderationLabels = { not_applicable: '不适用', pending: '待审核', approved: '已通过', rejected: '已拒绝' }
