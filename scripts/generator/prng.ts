/**
 * 确定性伪随机源。业务数据一律经此产生，禁止使用 Math.random 或 Date.now，
 * 否则同一固定种子无法复现出字节一致的数据文件。
 */
export type Rng = {
  next(): number
  int(minInclusive: number, maxInclusive: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: T[]): T[]
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 把固定种子字符串散列为 32 位整数，使 `seed` 配置项真正决定整条数据流。 */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function createRng(seed: string, channel: string): Rng {
  const next = mulberry32(hashSeed(`${seed}::${channel}`))
  const rng: Rng = {
    next,
    int(minInclusive, maxInclusive) {
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1))
    },
    pick(items) {
      return items[Math.floor(next() * items.length)]
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
      return items
    },
  }
  return rng
}
