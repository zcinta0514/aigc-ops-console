import { describe, expect, it } from 'vitest'
import { deviceStatusOf, getDeviceSnapshot, selectVisibleIncidents } from '../../src/domain/device-status'
import { AS_OF, device, incident, makeDataset } from '../fixtures/hand-calculated'

const before = (seconds: number) =>
  `${new Date(Date.parse(AS_OF) - seconds * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 19)}+08:00`

describe('设备在线判定', () => {
  it('U15 阈值 120 秒为闭区间，心跳为空是未知而非离线', () => {
    // 手算边界：119 秒与 120 秒在线，121 秒离线
    expect(deviceStatusOf(before(119), AS_OF)).toBe('online')
    expect(deviceStatusOf(before(120), AS_OF)).toBe('online')
    expect(deviceStatusOf(before(121), AS_OF)).toBe('offline')
    expect(deviceStatusOf(null, AS_OF)).toBe('unknown')
  })

  it('心跳晚于快照属数据非法，不能算作在线', () => {
    const future = `${new Date(Date.parse(AS_OF) + 60_000 + 8 * 3600 * 1000).toISOString().slice(0, 19)}+08:00`
    expect(deviceStatusOf(future, AS_OF)).toBe('unknown')
  })

  it('快照只随点位变化，不受参与日期影响', () => {
    const dataset = makeDataset({
      sites: [
        { id: 'S01', name: 'S01', city: 'c', addressLabel: 'a' },
        { id: 'S02', name: 'S02', city: 'c', addressLabel: 'a' },
      ],
      devices: [
        device('D01', 'S01'),
        device('D02', 'S02', { lastHeartbeatAt: before(600) }),
        device('D03', 'S02', { lastHeartbeatAt: null }),
      ],
    })
    const all = getDeviceSnapshot(dataset, [], AS_OF)
    expect([all.online, all.offline, all.unknown]).toEqual([1, 1, 1])

    const onlyS02 = getDeviceSnapshot(dataset, ['S02'], AS_OF)
    expect([onlyS02.online, onlyS02.offline, onlyS02.unknown]).toEqual([0, 1, 1])
  })
})

describe('历史离线事件筛选', () => {
  const dataset = makeDataset({
    sites: [{ id: 'S01', name: 'S01', city: 'c', addressLabel: 'a' }, { id: 'S02', name: 'S02', city: 'c', addressLabel: 'a' }],
    devices: [device('D01', 'S01'), device('D02', 'S02')],
    incidents: [
      incident('I1', 'D01', '2026-08-20T15:10:00+08:00', '2026-08-20T15:40:00+08:00'),
      incident('I2', 'D01', '2026-08-25T18:10:00+08:00', null),
      incident('I3', 'D02', '2026-08-22T09:00:00+08:00', '2026-08-22T09:30:00+08:00'),
    ],
  })
  const DAY = 86_400_000
  const span = (start: string, days: number) => [Date.parse(`${start}T00:00:00+08:00`), Date.parse(`${start}T00:00:00+08:00`) + days * DAY] as const

  it('U16 离线开始于筛选之前、恢复于筛选期间，仍应被命中', () => {
    const [from, to] = span('2026-08-25', 3)
    const ids = selectVisibleIncidents(dataset, [], from, to).map(i => i.id)
    // I2 从 8-25 起一直未恢复，与 8-25 起的窗口相交
    expect(ids).toContain('I2')
  })

  it('未恢复事件一直延续到快照，跨日仍可见', () => {
    const [from, to] = span('2026-08-29', 2)
    expect(selectVisibleIncidents(dataset, [], from, to).map(i => i.id)).toEqual(['I2'])
  })

  it('只检查离线起始日会漏掉跨日未恢复的设备，本实现按区间相交判断', () => {
    const [from, to] = span('2026-08-27', 2)
    // I2 起始于 8-25，若只看起始日就会漏掉
    expect(selectVisibleIncidents(dataset, [], from, to).map(i => i.id)).toEqual(['I2'])
  })

  it('点位筛选同时作用于离线事件', () => {
    const [from, to] = span('2026-08-22', 1)
    expect(selectVisibleIncidents(dataset, ['S02'], from, to).map(i => i.id)).toEqual(['I3'])
    expect(selectVisibleIncidents(dataset, ['S01'], from, to)).toEqual([])
  })
})
