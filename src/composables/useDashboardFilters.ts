import { computed, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Filters } from '../domain/types'
import { DEFAULT_FILTERS } from '../config/demo'
import { isValidDate } from '../domain/time'

export type FilterState = {
  filters: ComputedRef<Filters>
  /** URL 中无法解释的参数，用于提示用户而不是默默展示错误结果。 */
  invalid: ComputedRef<string[]>
  setRange: (start: string, end: string) => void
  setSites: (siteIds: string[]) => void
  reset: () => void
}

const ALL = 'all'

/**
 * 筛选状态存放在 URL 中，刷新、前进后退以及从明细返回都能恢复同一范围。
 * 无效参数一律回退到默认值并记录原因，不静默使用。
 *
 * 已知点位以取值函数传入：数据集在页面挂载后才有值，不能在建表时快照。
 */
export function useDashboardFilters(knownSiteIds: () => readonly string[]): FilterState {
  const route = useRoute()
  const router = useRouter()

  const invalid = computed<string[]>(() => {
    const out: string[] = []
    const start = route.query.start
    const end = route.query.end
    if (start !== undefined && !isValidDate(String(start))) out.push(`日期参数 start 无效：${String(start)}`)
    if (end !== undefined && !isValidDate(String(end))) out.push(`日期参数 end 无效：${String(end)}`)
    const sites = route.query.sites
    if (sites !== undefined && String(sites) !== ALL) {
      const known = knownSiteIds()
      for (const id of String(sites).split(',').filter(Boolean)) {
        if (!known.includes(id)) out.push(`点位参数无效：${id}`)
      }
    }
    return out
  })

  const filters = computed<Filters>(() => {
    let start = String(route.query.start ?? '')
    let end = String(route.query.end ?? '')
    if (!isValidDate(start)) start = DEFAULT_FILTERS.start
    if (!isValidDate(end)) end = DEFAULT_FILTERS.end
    // 起止颠倒时按交换处理，而不是返回空范围
    if (start > end) [start, end] = [end, start]

    const known = knownSiteIds()
    const rawSites = route.query.sites === undefined ? ALL : String(route.query.sites)
    const siteIds = rawSites === ALL || rawSites === ''
      ? []
      : rawSites.split(',').filter(id => known.includes(id))

    return { start, end, siteIds }
  })

  const commit = (next: { start?: string; end?: string; sites?: string }) => {
    const query = { ...route.query, ...next }
    if (next.sites === ALL) delete (query as Record<string, unknown>).sites
    // 明细详情参数不属于当前范围时一并清除，避免打开不存在或越界的抽屉
    for (const key of ['taskId', 'anomalyId', 'deviceId']) delete (query as Record<string, unknown>)[key]
    void router.replace({ path: route.path, query })
  }

  return {
    filters,
    invalid,
    setRange: (start, end) => commit({ start, end }),
    setSites: (siteIds) => commit({ sites: siteIds.length === 0 ? ALL : siteIds.join(',') }),
    reset: () => commit({ start: DEFAULT_FILTERS.start, end: DEFAULT_FILTERS.end, sites: ALL }),
  }
}
