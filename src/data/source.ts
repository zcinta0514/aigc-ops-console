import type { Dataset } from '../domain/types'

/**
 * 数据来源抽象。
 *
 * 本原型把模拟数据在构建时内联进产物，因此不需要任何后端即可运行。
 * 但真实项目不会这样——接入自己的接口时，只需要实现一个新的 DataSource
 * 并在 `repository.ts` 里换掉一处，领域计算层与界面层完全不需要改动。
 *
 * 关键在于：Dataset 是领域层唯一认可的输入形状，
 * 无论它来自内联 JSON、REST 接口还是一次性导出的静态文件。
 */
export interface DataSource {
  /** 供界面展示的数据来源说明，出现在错误提示与文档中。 */
  readonly label: string
  load(): Promise<Dataset>
}

/** 构建时内联的静态数据。单文件原型与静态托管都走这条路径。 */
export function createStaticSource(load: () => Dataset | Promise<Dataset>, label = '内联静态数据'): DataSource {
  let cached: Dataset | undefined
  return {
    label,
    async load() {
      if (!cached) cached = await load()
      return cached
    },
  }
}

export type FetchSourceOptions = {
  /** 接口基地址，留空表示同源。 */
  baseUrl?: string
  /** 各数据文件的路径，默认与 data/mock/v1 下的文件名一致。 */
  files?: Partial<Record<keyof Dataset, string>>
  label?: string
}

const DEFAULT_FILES: Record<keyof Dataset, string> = {
  meta: 'meta.json',
  sites: 'sites.json',
  devices: 'devices.json',
  sessions: 'sessions.json',
  tasks: 'generation-tasks.json',
  scans: 'scan-events.json',
  shares: 'share-events.json',
  incidents: 'device-incidents.json',
}

/**
 * 从 HTTP 接口读取数据。演示用的实现，接真实后端时可在此基础上
 * 增加鉴权、分页、增量更新与失败重试。
 */
export function createFetchSource(options: FetchSourceOptions = {}): DataSource {
  const base = (options.baseUrl ?? '').replace(/\/$/, '')
  const files = { ...DEFAULT_FILES, ...options.files }

  return {
    label: options.label ?? `${base || '同源'} 接口数据`,
    async load() {
      const keys = Object.keys(files) as Array<keyof Dataset>
      const responses = await Promise.all(keys.map(async key => {
        const url = `${base}/${files[key]}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`读取 ${url} 失败：HTTP ${res.status}`)
        return [key, await res.json()] as const
      }))
      return Object.fromEntries(responses) as unknown as Dataset
    },
  }
}
