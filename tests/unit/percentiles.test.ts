import { describe, expect, it } from 'vitest'
import { percentile, percentileOfSorted, p90 } from '../../src/domain/percentiles'

describe('分位数口径', () => {
  it('U21 线性插值：rank = (n-1) × p', () => {
    // 期望值由 NumPy 独立核对：np.percentile([1..9,100], 90, method='linear') = 18.099999999999966
    // 零基秩 = (10 - 1) × 0.9 = 8.1，在索引 8（值 9）与索引 9（值 100）之间插值：9 + 0.1 × 91 = 18.1
    expect(percentileOfSorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 0.9)).toBeCloseTo(18.1, 10)
  })

  it('单元素与空样本', () => {
    expect(percentileOfSorted([7], 0.9)).toBe(7)
    expect(percentile([], 0.9)).toBeNull()
  })

  it('P90 落在整数秩上时直接取值', () => {
    // n = 11 时 (11 - 1) × 0.9 = 9，正好是索引 9
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    expect(percentileOfSorted(values, 0.9)).toBe(10)
  })

  it('U22 合并后的分位数不等于各组分位数的平均', () => {
    const a = [10, 10]
    const b = [100, 100]
    const merged = [...a, ...b]
    // 合并样本 4 个，零基秩 = 3 × 0.9 = 2.7，在索引 2 与 3 之间（都是 100）
    expect(p90(merged)).toBe(100)
    // 若错误地对两组分别取 P90 再平均，会得到 55
    const wrong = (p90(a)! + p90(b)!) / 2
    expect(wrong).toBe(55)
    expect(p90(merged)).not.toBe(wrong)
  })

  it('不修改传入数组的顺序', () => {
    const values = [5, 1, 3]
    percentile(values, 0.9)
    expect(values).toEqual([5, 1, 3])
  })
})
