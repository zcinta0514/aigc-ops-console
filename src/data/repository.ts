import type { Dataset } from '../domain/types'
import { createStaticSource, type DataSource } from './source'
import metaJson from '../../data/mock/v1/meta.json'
import sitesJson from '../../data/mock/v1/sites.json'
import devicesJson from '../../data/mock/v1/devices.json'
import sessionsJson from '../../data/mock/v1/sessions.json'
import tasksJson from '../../data/mock/v1/generation-tasks.json'
import scansJson from '../../data/mock/v1/scan-events.json'
import sharesJson from '../../data/mock/v1/share-events.json'
import incidentsJson from '../../data/mock/v1/device-incidents.json'

/**
 * 换数据源只需要改这一行。
 * 例如接后端：`export const dataSource = createFetchSource({ baseUrl: '/api/dashboard' })`
 * 领域计算与界面层完全不需要改动——它只认识 Dataset 这一种输入形状。
 */
export const dataSource: DataSource = createStaticSource(
  (): Dataset => ({
    meta: metaJson,
    sites: sitesJson,
    devices: devicesJson,
    sessions: sessionsJson,
    tasks: tasksJson,
    scans: scansJson,
    shares: sharesJson,
    incidents: incidentsJson,
  }) as Dataset,
  '构建时内联的模拟数据',
)

export function loadDataset(): Promise<Dataset> {
  return dataSource.load()
}
