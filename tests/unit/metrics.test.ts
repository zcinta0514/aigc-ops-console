import { describe, expect, it } from 'vitest'
import { buildIndex, selectCohort } from '../../src/domain/cohort'
import { computeFunnel, computeOverview, computeSiteComparison } from '../../src/domain/metrics'
import { at, device, makeDataset, session, site, task, scan, share } from '../fixtures/hand-calculated'

const overviewOf = (parts: Parameters<typeof makeDataset>[0]) =>
  computeOverview(selectCohort(makeDataset(parts), { start: '2026-08-25', end: '2026-08-25', siteIds: [] }))

const oneSession = (id: string, participantId = `P${id}`) =>
  session(id, participantId, 'S01', 'D01', '2026-08-25T10:00:00+08:00')

describe('生成成功率口径', () => {
  it('U01 分母只含已结束任务，排队与生成中单独计数', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => oneSession(`S${i + 1}`))
    const tasks = Array.from({ length: 10 }, (_, i) => {
      const id = `T${i + 1}`
      const s = `S${i + 1}`
      if (i < 7) return task(id, s)
      if (i === 7) return task(id, s, { status: 'failed', errorCode: 'MODEL_ERROR' })
      if (i === 8) return task(id, s, { status: 'timeout', errorCode: 'GEN_TIMEOUT' })
      return task(id, s, { status: 'running', finishedAt: null, moderationStatus: 'not_applicable', moderatedAt: null, displayedAt: null })
    })
    const m = overviewOf({ sessions, tasks })
    expect(m.ended).toBe(9)
    expect(m.success).toBe(7)
    // 手算：7 ÷ 9 = 77.78%
    expect(m.successRate).toBeCloseTo(7 / 9, 10)
    expect(m.running).toBe(1)
    expect(m.queued).toBe(0)
  })

  it('U02 重试成功仍是一条任务，不放大分母', () => {
    const m = overviewOf({
      sessions: [oneSession('S1')],
      tasks: [task('T1', 'S1', { attemptCount: 2 })],
    })
    expect(m.success).toBe(1)
    expect(m.ended).toBe(1)
    expect(m.successRate).toBe(1)
  })

  it('U11 零样本时比例与均值均为 null，而不是 0 或 NaN', () => {
    const m = overviewOf({ sessions: [], tasks: [] })
    expect(m.participants).toBe(0)
    expect(m.ended).toBe(0)
    expect(m.successRate).toBeNull()
    expect(m.averageSeconds).toBeNull()
    expect(m.p90Seconds).toBeNull()
    expect(m.scanRate).toBeNull()
    expect(m.rejectionRate).toBeNull()
  })
})

describe('转化口径', () => {
  it('U03 扫码领取率按会话去重，重复事件不重复计数', () => {
    const sessions = ['S1', 'S2', 'S3', 'S4'].map(id => oneSession(id))
    // 4 个会话都有可领取结果；其中 S1、S2 发生扫码，S1 被扫了两次
    const tasks = sessions.map((s, i) => task(`T${i + 1}`, s.id))
    const scans = [
      scan('SC1', 'T1', at('2026-08-25T10:00:00+08:00', 20)),
      scan('SC2', 'T1', at('2026-08-25T10:00:00+08:00', 30)),
      scan('SC3', 'T2', at('2026-08-25T10:00:00+08:00', 25)),
    ]
    const m = overviewOf({ sessions, tasks, scans })
    expect(m.claimable).toBe(4)
    expect(m.scanned).toBe(2)
    // 手算：2 ÷ 4 = 50.0%
    expect(m.scanRate).toBe(0.5)
  })

  it('U04 一个会话有多个可领取结果时，分子分母各只贡献一次', () => {
    const tasks = [task('T1', 'S1'), task('T2', 'S1')]
    const scans = [
      scan('SC1', 'T1', at('2026-08-25T10:00:00+08:00', 20)),
      scan('SC2', 'T2', at('2026-08-25T10:00:00+08:00', 21)),
    ]
    const m = overviewOf({ sessions: [oneSession('S1')], tasks, scans })
    expect(m.claimable).toBe(1)
    expect(m.scanned).toBe(1)
    expect(m.scanRate).toBe(1)
  })

  it('U24 重复分享同样按会话去重', () => {
    const sessions = ['S1', 'S2'].map(id => oneSession(id))
    const tasks = [task('T1', 'S1'), task('T2', 'S2')]
    const shares = [
      share('SH1', 'T1', at('2026-08-25T10:00:00+08:00', 20)),
      share('SH2', 'T1', at('2026-08-25T10:00:00+08:00', 40)),
      share('SH3', 'T1', at('2026-08-25T10:00:00+08:00', 60)),
    ]
    const m = overviewOf({ sessions, tasks, shares })
    expect(m.shared).toBe(1)
    expect(m.shareRate).toBe(0.5)
  })

  it('U08 生成成功但审核被拒，进入成功分子但不进入可领取集合', () => {
    const m = overviewOf({
      sessions: [oneSession('S1')],
      tasks: [task('T1', 'S1', { moderationStatus: 'rejected', moderationReasonCode: 'POLICY_SENSITIVE', displayedAt: null })],
    })
    expect(m.success).toBe(1)
    expect(m.rejected).toBe(1)
    expect(m.claimable).toBe(0)
    expect(m.scanRate).toBeNull()
  })

  it('U09 审核通过但尚未展示，不进入扫码分母', () => {
    const m = overviewOf({
      sessions: [oneSession('S1')],
      tasks: [task('T1', 'S1', { displayedAt: null })],
    })
    expect(m.success).toBe(1)
    expect(m.approved).toBe(1)
    expect(m.claimable).toBe(0)
  })

  it('U23 扫码与分享是并列分支，允许只发生其一', () => {
    const sessions = ['S1', 'S2'].map(id => oneSession(id))
    // S1 只扫码，S2 只分享
    const m = overviewOf({
      sessions,
      tasks: [task('T1', 'S1'), task('T2', 'S2')],
      scans: [scan('SC1', 'T1', at('2026-08-25T10:00:00+08:00', 20))],
      shares: [share('SH1', 'T2', at('2026-08-25T10:00:00+08:00', 21))],
    })
    expect(m.claimable).toBe(2)
    expect(m.scanned).toBe(1)
    expect(m.shared).toBe(1)
    expect(m.scanRate).toBe(0.5)
    expect(m.shareRate).toBe(0.5)
  })
})

describe('聚合口径', () => {
  it('U05 同一人跨日期跨点位参加，全局按人去重只算一人', () => {
    const parts = {
      sites: [site('S01'), site('S02')],
      devices: [device('D01', 'S01'), device('D02', 'S02')],
      sessions: [
        session('S1', 'P1', 'S01', 'D01', '2026-08-25T10:00:00+08:00'),
        session('S2', 'P1', 'S02', 'D02', '2026-08-26T10:00:00+08:00'),
      ],
    }
    const global = computeOverview(selectCohort(makeDataset(parts), { start: '2026-08-25', end: '2026-08-26', siteIds: [] }))
    expect(global.participants).toBe(1)
    expect(global.sessions).toBe(2)
    // 各日期分别只有一人，相加会得到 2，正是要避免的错误
    const d1 = computeOverview(selectCohort(makeDataset(parts), { start: '2026-08-25', end: '2026-08-25', siteIds: [] }))
    const d2 = computeOverview(selectCohort(makeDataset(parts), { start: '2026-08-26', end: '2026-08-26', siteIds: [] }))
    expect(d1.participants + d2.participants).toBe(2)
    expect(global.participants).not.toBe(d1.participants + d2.participants)
  })

  it('U06 合并成功率由合并后的分子分母算出，不是平均两个百分比', () => {
    const parts = {
      sites: [site('S01'), site('S02')],
      devices: [device('D01', 'S01'), device('D02', 'S02')],
      sessions: [
        session('A1', 'PA', 'S01', 'D01', '2026-08-25T10:00:00+08:00'),
        ...Array.from({ length: 9 }, (_, i) => session(`B${i}`, `PB${i}`, 'S02', 'D02', '2026-08-25T11:00:00+08:00')),
      ],
      tasks: [
        task('TA', 'A1'),
        task('TB0', 'B0'),
        ...Array.from({ length: 8 }, (_, i) => task(`TB${i + 1}`, `B${i + 1}`, { status: 'failed' as const, errorCode: 'MODEL_ERROR' })),
      ],
    }
    const global = computeOverview(selectCohort(makeDataset(parts), { start: '2026-08-25', end: '2026-08-25', siteIds: [] }))
    // 手算：2 ÷ 10 = 20.0%；平均两个点位百分比会得到 (100% + 11.1%) / 2 ≈ 55.6%
    expect(global.success).toBe(2)
    expect(global.ended).toBe(10)
    expect(global.successRate).toBeCloseTo(0.2, 10)
  })

  it('U07 平均生成时长只用成功任务，失败任务的耗时不计入', () => {
    const m = overviewOf({
      sessions: [oneSession('S1'), oneSession('S2'), oneSession('S3')],
      tasks: [
        task('T1', 'S1', { finishedAt: at('2026-08-25T10:00:00+08:00', 10) }),
        task('T2', 'S2', { finishedAt: at('2026-08-25T10:00:00+08:00', 20) }),
        task('T3', 'S3', { status: 'failed', errorCode: 'MODEL_ERROR', finishedAt: at('2026-08-25T10:00:00+08:00', 60) }),
      ],
    })
    // 手算：(10 + 20) ÷ 2 = 15 秒
    expect(m.averageSeconds).toBe(15)
  })

  it('U10 审核三项之和等于成功任务数，拒绝率排除待审', () => {
    const m = overviewOf({
      sessions: [oneSession('S1'), oneSession('S2'), oneSession('S3')],
      tasks: [
        task('T1', 'S1'),
        task('T2', 'S2', { moderationStatus: 'rejected', moderationReasonCode: 'X', displayedAt: null }),
        task('T3', 'S3', { moderationStatus: 'pending', moderatedAt: null, displayedAt: null }),
      ],
    })
    expect(m.approved + m.rejected + m.pending).toBe(m.success)
    // 手算：1 ÷ (1 + 1) = 50%，待审不参与
    expect(m.rejectionRate).toBe(0.5)
  })

  it('点位对比的各项比率由该点位自己的样本重算', () => {
    const parts = {
      sites: [site('S01'), site('S02')],
      devices: [device('D01', 'S01'), device('D02', 'S02')],
      sessions: [
        session('A1', 'PA', 'S01', 'D01', '2026-08-25T10:00:00+08:00'),
        session('B1', 'PB', 'S02', 'D02', '2026-08-25T11:00:00+08:00'),
        session('B2', 'PC', 'S02', 'D02', '2026-08-25T12:00:00+08:00'),
      ],
      tasks: [task('TA', 'A1'), task('TB1', 'B1'), task('TB2', 'B2', { status: 'failed' as const, errorCode: 'E' })],
    }
    const rows = computeSiteComparison(makeDataset(parts), { start: '2026-08-25', end: '2026-08-25', siteIds: [] })
    const s01 = rows.find(r => r.siteId === 'S01')!
    const s02 = rows.find(r => r.siteId === 'S02')!
    expect(s01.successRate).toBe(1)
    expect(s02.successRate).toBe(0.5)
  })
})

describe('日期归属', () => {
  it('U13 任务与扫码发生在所选日期之外，仍归属会话开始的那一天', () => {
    // 会话开始于 8-26 23:59，完成与扫码都落在 8-27
    const parts = {
      sessions: [session('S1', 'P1', 'S01', 'D01', '2026-08-26T23:59:00+08:00')],
      tasks: [task('T1', 'S1', {
        submittedAt: '2026-08-26T23:59:02+08:00',
        finishedAt: '2026-08-27T00:00:05+08:00',
        moderatedAt: '2026-08-27T00:00:06+08:00',
        displayedAt: '2026-08-27T00:00:08+08:00',
      })],
      scans: [scan('SC1', 'T1', '2026-08-27T00:00:20+08:00')],
    }
    const dataset = makeDataset(parts)
    const on26 = computeOverview(selectCohort(dataset, { start: '2026-08-26', end: '2026-08-26', siteIds: [] }))
    expect(on26.sessions).toBe(1)
    expect(on26.success).toBe(1)
    expect(on26.scanned).toBe(1)

    const on27 = computeOverview(selectCohort(dataset, { start: '2026-08-27', end: '2026-08-27', siteIds: [] }))
    expect(on27.sessions).toBe(0)
    expect(on27.success).toBe(0)
  })
})

describe('漏斗', () => {
  it('U14 六段计数正确，且扫码与分享自可领取处分叉', () => {
    const parts = {
      sessions: ['S1', 'S2', 'S3', 'S4', 'S5'].map(id => oneSession(id)),
      // S1 成功并领取扫码；S2 成功且被拒审；S3 失败；S4 有任务但未展示；S5 无任务
      tasks: [
        task('T1', 'S1'),
        task('T2', 'S2', { moderationStatus: 'rejected', moderationReasonCode: 'X', displayedAt: null }),
        task('T3', 'S3', { status: 'failed', errorCode: 'E' }),
        task('T4', 'S4', { moderationStatus: 'pending', moderatedAt: null, displayedAt: null }),
      ],
      scans: [scan('SC1', 'T1', at('2026-08-25T10:00:00+08:00', 20))],
      shares: [share('SH1', 'T1', at('2026-08-25T10:00:00+08:00', 25))],
    }
    const f = computeFunnel(selectCohort(makeDataset(parts), { start: '2026-08-25', end: '2026-08-25', siteIds: [] }))
    expect(f.started).toBe(5)
    expect(f.submitted).toBe(4)
    expect(f.succeeded).toBe(3)
    expect(f.claimable).toBe(1)
    expect(f.scanned).toBe(1)
    expect(f.shared).toBe(1)
    // 前四段逐级不增
    expect(f.started).toBeGreaterThanOrEqual(f.submitted)
    expect(f.submitted).toBeGreaterThanOrEqual(f.succeeded)
    expect(f.succeeded).toBeGreaterThanOrEqual(f.claimable)
  })

  it('U23 分享段可以大于扫码段，二者不是包含关系', () => {
    const parts = {
      sessions: ['S1', 'S2', 'S3'].map(id => oneSession(id)),
      tasks: [task('T1', 'S1'), task('T2', 'S2'), task('T3', 'S3')],
      scans: [scan('SC1', 'T1', at('2026-08-25T10:00:00+08:00', 20))],
      shares: [
        share('SH1', 'T1', at('2026-08-25T10:00:00+08:00', 21)),
        share('SH2', 'T2', at('2026-08-25T10:00:00+08:00', 22)),
        share('SH3', 'T3', at('2026-08-25T10:00:00+08:00', 23)),
      ],
    }
    const f = computeFunnel(selectCohort(makeDataset(parts), { start: '2026-08-25', end: '2026-08-25', siteIds: [] }))
    expect(f.claimable).toBe(3)
    expect(f.scanned).toBe(1)
    expect(f.shared).toBe(3)
    expect(f.shared).toBeGreaterThan(f.scanned)
  })
})

describe('索引', () => {
  it('索引把任务、扫码、分享挂到正确的会话上', () => {
    const dataset = makeDataset({
      sessions: [oneSession('S1'), oneSession('S2')],
      tasks: [task('T1', 'S1'), task('T2', 'S2')],
      scans: [scan('SC1', 'T1', at('2026-08-25T10:00:00+08:00', 20))],
    })
    const idx = buildIndex(dataset)
    expect(idx.tasksBySession.get('S1')?.map(t => t.id)).toEqual(['T1'])
    expect(idx.scansByTask.get('T1')?.length).toBe(1)
    expect(idx.scansByTask.get('T2')).toBeUndefined()
  })
})
