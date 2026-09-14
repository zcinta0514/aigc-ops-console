import { describe, expect, it } from 'vitest'
import type { Dataset } from '../../src/domain/types'
import { validateDataset } from '../../scripts/validation'

function fixture(): Dataset {
  return {
    meta: { datasetVersion: 'v1', seed: 'aigc-ops-demo-v1', activityId: 'ACT01', activityName: '光影共创体验', timezone: 'Asia/Shanghai', dateStart: '2026-08-01', dateEnd: '2026-08-30', asOf: '2026-08-30T20:00:00+08:00', schemaVersion: '1.0.0', rulesVersion: '2.0.0' },
    sites: [{ id: 'S01', name: '星河广场', city: '演示城市', addressLabel: '虚构点位' }],
    devices: [{ id: 'D01', siteId: 'S01', name: '设备01', registeredAt: '2026-08-01T09:00:00+08:00', lastHeartbeatAt: '2026-08-30T19:59:30+08:00' }],
    sessions: [{ id: 'S0001', participantId: 'P0001', siteId: 'S01', deviceId: 'D01', startedAt: '2026-08-25T15:00:00+08:00' }],
    tasks: [{ id: 'T0001', sessionId: 'S0001', templateId: 'TPL01', submittedAt: '2026-08-25T15:00:02+08:00', finishedAt: '2026-08-25T15:00:10+08:00', status: 'success', attemptCount: 1, errorCode: null, moderationStatus: 'approved', moderatedAt: '2026-08-25T15:00:11+08:00', moderationReasonCode: null, displayedAt: '2026-08-25T15:00:12+08:00' }],
    scans: [{ id: 'SC0001', taskId: 'T0001', scannedAt: '2026-08-25T15:00:13+08:00' }],
    shares: [{ id: 'SH0001', taskId: 'T0001', sharedAt: '2026-08-25T15:00:14+08:00', channel: 'wechat' }],
    incidents: [{ id: 'I0001', deviceId: 'D01', offlineAt: '2026-08-25T15:10:00+08:00', restoredAt: '2026-08-25T15:40:00+08:00', reasonCode: 'NETWORK_UNREACHABLE' }],
  }
}

function invalid(edit: (d: Dataset) => void, code: string) {
  const d = fixture()
  edit(d)
  expect(validateDataset(d, { enforceDemo: false }).errors.some(e => e.includes(code))).toBe(true)
}

describe('raw dataset invariants, independently constructed records', () => {
  it('accepts a valid complete result', () => expect(validateDataset(fixture(), { enforceDemo: false }).errors).toEqual([]))
  it('rejects future time', () => invalid(d => { d.shares[0].sharedAt = '2026-08-31T10:00:00+08:00' }, 'FUTURE_TIME'))
  it('rejects missing timezone', () => invalid(d => { d.sessions[0].startedAt = '2026-08-25T15:00:00' }, 'TIME_FORMAT'))
  it('rejects impossible calendar date', () => invalid(d => { d.sessions[0].startedAt = '2026-02-30T15:00:00+08:00' }, 'TIME_FORMAT'))
  it('rejects duplicate IDs in every table', () => {
    for (const key of ['sites', 'devices', 'sessions', 'tasks', 'scans', 'shares', 'incidents'] as const) {
      const d = fixture()
      ;(d[key] as unknown[]).push(structuredClone(d[key][0]))
      expect(validateDataset(d, { enforceDemo: false }).errors.some(e => e.includes('DUPLICATE_ID'))).toBe(true)
    }
  })
  it('rejects missing foreign keys', () => invalid(d => { d.tasks[0].sessionId = 'missing' }, 'FOREIGN_KEY'))
  it('rejects device site mismatch', () => invalid(d => { d.sessions[0].siteId = 'S02' }, 'DEVICE_SITE'))
  it('rejects sessions before registration', () => invalid(d => { d.devices[0].registeredAt = '2026-08-26T10:00:00+08:00' }, 'BEFORE_REGISTRATION'))
  it('rejects new offline sessions', () => invalid(d => { d.sessions[0].startedAt = '2026-08-25T15:20:00+08:00' }, 'OFFLINE_SESSION'))
  it('rejects new offline submissions', () => invalid(d => { d.tasks[0].submittedAt = '2026-08-25T15:20:00+08:00' }, 'OFFLINE_SUBMISSION'))
  it('rejects offline displays', () => invalid(d => { d.tasks[0].displayedAt = '2026-08-25T15:20:00+08:00' }, 'OFFLINE_DISPLAY'))
  it('accepts cloud completion while offline and display on recovery boundary', () => {
    const d = fixture()
    d.tasks[0].finishedAt = '2026-08-25T15:20:00+08:00'
    d.tasks[0].moderatedAt = '2026-08-25T15:20:01+08:00'
    d.tasks[0].displayedAt = '2026-08-25T15:40:00+08:00'
    d.scans = []; d.shares = []
    expect(validateDataset(d, { enforceDemo: false }).errors).toEqual([])
  })
  it('rejects task submission before session', () => invalid(d => { d.tasks[0].submittedAt = '2026-08-25T14:59:59+08:00' }, 'TASK_ORDER'))
  it('rejects task finish before submission', () => invalid(d => { d.tasks[0].finishedAt = '2026-08-25T14:59:59+08:00' }, 'TASK_ORDER'))
  it.each(['success', 'failed', 'timeout'] as const)('requires finish for %s', status => invalid(d => { d.tasks[0].status = status; d.tasks[0].finishedAt = null }, 'FINISH_STATE'))
  it.each(['queued', 'running'] as const)('forbids finish for %s', status => invalid(d => { d.tasks[0].status = status }, 'FINISH_STATE'))
  it('forbids non-success moderation and display', () => invalid(d => { d.tasks[0].status = 'failed' }, 'NON_SUCCESS_STATE'))
  it('requires success moderation state', () => invalid(d => { d.tasks[0].moderationStatus = 'not_applicable' }, 'SUCCESS_MODERATION'))
  it('forbids pending decisions', () => invalid(d => { d.tasks[0].moderationStatus = 'pending' }, 'PENDING_DECISION'))
  it('forbids rejected result display', () => invalid(d => { d.tasks[0].moderationStatus = 'rejected' }, 'REJECTED_DISPLAY'))
  it('requires moderation after finish', () => invalid(d => { d.tasks[0].moderatedAt = '2026-08-25T15:00:01+08:00' }, 'MODERATION_ORDER'))
  it('requires display after approval', () => invalid(d => { d.tasks[0].displayedAt = '2026-08-25T15:00:10+08:00' }, 'DISPLAY_ORDER'))
  it('rejects invalid share', () => invalid(d => { d.tasks[0].displayedAt = null }, 'INVALID_SHARE'))
  it('rejects share before display', () => invalid(d => { d.shares[0].sharedAt = '2026-08-25T15:00:11+08:00' }, 'EVENT_ORDER'))
  it('rejects invalid scan', () => invalid(d => { d.scans[0].taskId = 'missing' }, 'FOREIGN_KEY'))
  it('rejects reversed incident', () => invalid(d => { d.incidents[0].restoredAt = '2026-08-25T15:09:59+08:00' }, 'INCIDENT_ORDER'))
  it('rejects overlapping incidents', () => invalid(d => { d.incidents.push({ ...d.incidents[0], id: 'I0002', offlineAt: '2026-08-25T15:30:00+08:00' }) }, 'INCIDENT_OVERLAP'))
  it('rejects integer attempt counts below one', () => invalid(d => { d.tasks[0].attemptCount = 0 }, 'SCHEMA'))
  it('enforces fixed demo scale when requested', () => expect(validateDataset(fixture()).errors.some(e => e.includes('DEMO_SCALE'))).toBe(true))
})
