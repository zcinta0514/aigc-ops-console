import { createHash } from 'node:crypto'
import type { Dataset } from '../../src/domain/types'
import { DEMO } from './config'

/** 数组文件按"每行一条记录"输出：既可逐行阅读，又避免整份文件挤在一行。 */
export function serializeArray(rows: unknown[]): string {
  if (rows.length === 0) return '[]\n'
  return `[\n${rows.map(r => JSON.stringify(r)).join(',\n')}\n]\n`
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 交付的数据文件内容。键顺序固定，保证同种子可复现出字节一致的结果。 */
export function buildFiles(dataset: Dataset): Map<string, string> {
  const files = new Map<string, string>()
  files.set('meta.json', `${JSON.stringify(dataset.meta, null, 2)}\n`)
  files.set('sites.json', serializeArray(dataset.sites))
  files.set('devices.json', serializeArray(dataset.devices))
  files.set('sessions.json', serializeArray(dataset.sessions))
  files.set('generation-tasks.json', serializeArray(dataset.tasks))
  files.set('scan-events.json', serializeArray(dataset.scans))
  files.set('share-events.json', serializeArray(dataset.shares))
  files.set('device-incidents.json', serializeArray(dataset.incidents))
  return files
}

/**
 * manifest 记录各文件的记录数与哈希，但不含自身哈希，
 * 也不写入电脑当前时间——否则每次生成都会变，复现检查将永远失败。
 */
export function buildManifest(dataset: Dataset, files: Map<string, string>) {
  const counts: Record<string, number> = {
    'meta.json': 1,
    'sites.json': dataset.sites.length,
    'devices.json': dataset.devices.length,
    'sessions.json': dataset.sessions.length,
    'generation-tasks.json': dataset.tasks.length,
    'scan-events.json': dataset.scans.length,
    'share-events.json': dataset.shares.length,
    'device-incidents.json': dataset.incidents.length,
  }
  return {
    datasetVersion: DEMO.datasetVersion,
    seed: DEMO.seed,
    schemaVersion: DEMO.schemaVersion,
    rulesVersion: DEMO.rulesVersion,
    asOf: DEMO.asOf,
    files: [...files.entries()].map(([name, text]) => ({
      name,
      records: counts[name] ?? 0,
      sha256: sha256(text),
    })),
  }
}

export const MANIFEST_NAME = 'manifest.json'
