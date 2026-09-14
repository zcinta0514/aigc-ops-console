/**
 * 分位数口径：对升序样本按 rank = (n - 1) × p 线性插值，与 NumPy 默认的
 * method='linear' 一致。不同工具（Excel、SQL、Python）默认算法不同，
 * 因此该口径必须在指标文档中写明，不能默认"分位数只有一种算法"。
 *
 * 注意：分位数不是线性统计量，合并两个点位时必须先合并原始样本再取分位数，
 * 不能对各点位的分位数取平均。
 */
export function percentileOfSorted(sortedAsc: readonly number[], p: number): number | null {
  const n = sortedAsc.length
  if (n === 0) return null
  if (n === 1) return sortedAsc[0]
  const rank = (n - 1) * p
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo])
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  return percentileOfSorted([...values].sort((a, b) => a - b), p)
}

export const p90 = (values: readonly number[]) => percentile(values, 0.9)
