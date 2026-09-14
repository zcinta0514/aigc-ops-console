import type { Dataset } from '../domain/types'
import metaJson from '../../data/mock/v1/meta.json'
import sitesJson from '../../data/mock/v1/sites.json'
import devicesJson from '../../data/mock/v1/devices.json'
import sessionsJson from '../../data/mock/v1/sessions.json'
import tasksJson from '../../data/mock/v1/generation-tasks.json'
import scansJson from '../../data/mock/v1/scan-events.json'
import sharesJson from '../../data/mock/v1/share-events.json'
import incidentsJson from '../../data/mock/v1/device-incidents.json'

/**
 * 数据在构建时内联进产物，不通过运行时 fetch 读取。
 * 因此常规构建与单文件构建都不需要 HTTP 服务，也不存在跨域或相对路径问题；
 * 代价是产物自带全部数据（当前约 2.9 MB 源数据）。
 *
 * 校验与复现由 scripts/ 下的脚本直接读取 data/mock/v1 完成，不经过此处。
 */
let cached: Dataset | undefined

export function loadDataset(): Promise<Dataset> {
  if (!cached) {
    cached = {
      meta: metaJson,
      sites: sitesJson,
      devices: devicesJson,
      sessions: sessionsJson,
      tasks: tasksJson,
      scans: scansJson,
      shares: sharesJson,
      incidents: incidentsJson,
    } as Dataset
  }
  return Promise.resolve(cached)
}
