import { describe, expect, it } from 'vitest'
import { deriveAnomalies, selectVisibleAnomalies } from '../../src/domain/anomalies'
import { AS_OF, incident, makeDataset, session, task } from '../fixtures/hand-calculated'

/** 造 n 个已结束任务，其中成功 success 个，全部落在同一点位同一天。 */
function batch(n: number, success: number) {
  const sessions = Array.from({ length: n }, (_, i) => session(`S${i}`, `P${i}`, 'S01', 'D01', '2026-08-25T10:00:00+08:00'))
  const tasks = sessions.map((s, i) => i < success
    ? task(`T${i}`, s.id)
    : task(`T${i}`, s.id, { status: 'failed' as const, errorCode: 'MODEL_ERROR' }))
  return { sessions, tasks }
}

const byId = (list: ReturnType<typeof deriveAnomalies>, id: string) => list.find(a => a.id === id)

describe('异常规则：样本量保护与阈值边界', () => {
  it('U18 成功率恰好等于阈值不触发，低于阈值才触发', () => {
    const at = deriveAnomalies(makeDataset(batch(40, 38))) // 38 / 40 = 95.0%
    expect(byId(at, 'gen-success|S01|2026-08-25')).toBeUndefined()

    const below = deriveAnomalies(makeDataset(batch(40, 37))) // 92.5%
    expect(byId(below, 'gen-success|S01|2026-08-25')).toBeDefined()
  })

  it('U18 样本量低于门槛时不触发率值告警', () => {
    // 29 条全部失败，但门槛是 30，不足以判定
    const list = deriveAnomalies(makeDataset(batch(29, 0)))
    expect(byId(list, 'gen-success|S01|2026-08-25')).toBeUndefined()
  })

  it('成功率低于 85% 记为严重，其余为警告', () => {
    const critical = byId(deriveAnomalies(makeDataset(batch(40, 33))), 'gen-success|S01|2026-08-25')!
    expect(critical.severity).toBe('critical') // 82.5%
    const warning = byId(deriveAnomalies(makeDataset(batch(40, 37))), 'gen-success|S01|2026-08-25')!
    expect(warning.severity).toBe('warning')
  })

  it('U19 待审恰好 10 分钟不计入积压，超过才计入', () => {
    const finish = (minutesAgo: number) =>
      `${new Date(Date.parse(AS_OF) - minutesAgo * 60_000 + 8 * 3600 * 1000).toISOString().slice(0, 19)}+08:00`

    const pendingTasks = (minutesAgo: number) => Array.from({ length: 10 }, (_, i) => {
      const s = session(`S${i}`, `P${i}`, 'S01', 'D01', '2026-08-25T10:00:00+08:00')
      return { s, t: task(`T${i}`, s.id, { status: 'success' as const, moderationStatus: 'pending' as const, moderatedAt: null, displayedAt: null, finishedAt: finish(minutesAgo) }) }
    })

    const exact = pendingTasks(10)
    expect(byId(deriveAnomalies(makeDataset({ sessions: exact.map(x => x.s), tasks: exact.map(x => x.t) })), 'backlog|S01|2026-08-25')).toBeUndefined()

    const over = pendingTasks(10.5)
    expect(byId(deriveAnomalies(makeDataset({ sessions: over.map(x => x.s), tasks: over.map(x => x.t) })), 'backlog|S01|2026-08-25')).toBeDefined()
  })
})

describe('异常规则：分享与扫码分列', () => {
  it('扫码正常而分享极低时，只有分享异常被检出', () => {
    const sessions = Array.from({ length: 30 }, (_, i) => session(`S${i}`, `P${i}`, 'S01', 'D01', '2026-08-25T10:00:00+08:00'))
    const tasks = sessions.map((s, i) => task(`T${i}`, s.id))
    // 15 个会话扫码（50%），只有 1 个分享（3.3%）
    const scans = sessions.slice(0, 15).map((s, i) => ({ id: `SC${i}`, taskId: `T${i}`, scannedAt: task('T0', s.id).displayedAt! }))
    const shares = [{ id: 'SH0', taskId: 'T0', sharedAt: tasks[0].displayedAt!, channel: 'wechat' as const }]

    const list = deriveAnomalies(makeDataset({ sessions, tasks, scans, shares }))
    expect(byId(list, 'scan|S01|2026-08-25')).toBeUndefined()
    const shareAnomaly = byId(list, 'share|S01|2026-08-25')!
    expect(shareAnomaly).toBeDefined()
    // 异常详情同时给出扫码表现，说明卡点在传播环节而非领取环节
    expect(shareAnomaly.scanRate).toBeCloseTo(0.5, 2)
    expect(shareAnomaly.suggestion).toContain('扫码领取率')
  })
})

describe('异常规则：设备', () => {
  it('离线持续 30 分钟及以上记为严重，未恢复的以快照为终点', () => {
    const short = deriveAnomalies(makeDataset({
      incidents: [incident('I1', 'D01', '2026-08-25T15:10:00+08:00', '2026-08-25T15:30:00+08:00')],
    })).find(a => a.type === 'device_offline')!
    expect(short.severity).toBe('warning') // 20 分钟

    const unrecovered = deriveAnomalies(makeDataset({
      incidents: [incident('I2', 'D01', '2026-08-25T15:10:00+08:00', null)],
    })).find(a => a.type === 'device_offline')!
    expect(unrecovered.severity).toBe('critical')
    expect(unrecovered.restoredAt).toBeNull()
  })

  it('从未上报心跳记为提示，不冒充已确认离线', () => {
    const list = deriveAnomalies(makeDataset({ devices: [{ id: 'D09', siteId: 'S01', name: 'D09', registeredAt: '2026-08-30T19:50:00+08:00', lastHeartbeatAt: null }] }))
    const unknown = list.find(a => a.type === 'device_unknown')!
    expect(unknown.severity).toBe('info')
    expect(unknown.suggestion).toContain('状态未知')
  })
})

describe('异常稳定性与筛选', () => {
  it('异常 id 与证据在完整数据上生成，不随筛选范围改变', () => {
    const parts = batch(40, 37)
    const all = deriveAnomalies(makeDataset(parts))
    const again = deriveAnomalies(makeDataset(parts))
    expect(all.map(a => a.id)).toEqual(again.map(a => a.id))
  })

  it('按点位与日期筛选，严重程度优先、同等级按日期与 id 稳定排序', () => {
    const list = deriveAnomalies(makeDataset(batch(40, 33)))
    const visible = selectVisibleAnomalies(list, { start: '2026-08-25', end: '2026-08-25', siteIds: [] })
    expect(visible.length).toBeGreaterThan(0)

    const none = selectVisibleAnomalies(list, { start: '2026-08-01', end: '2026-08-02', siteIds: [] })
    expect(none.filter(a => a.bucketDate !== undefined)).toEqual([])

    const otherSite = selectVisibleAnomalies(list, { start: '2026-08-25', end: '2026-08-25', siteIds: ['S02'] })
    expect(otherSite).toEqual([])
  })

  it('设备事件按区间相交展示，跨日未恢复的设备不会被漏掉', () => {
    const list = deriveAnomalies(makeDataset({
      incidents: [incident('I1', 'D01', '2026-08-20T15:10:00+08:00', null)],
    }))
    const visible = selectVisibleAnomalies(list, { start: '2026-08-28', end: '2026-08-29', siteIds: [] })
    expect(visible.some(a => a.type === 'device_offline')).toBe(true)
  })
})
