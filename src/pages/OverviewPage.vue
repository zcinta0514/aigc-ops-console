<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataset } from '../composables/useDataset'
import { useDashboardFilters } from '../composables/useDashboardFilters'
import { buildIndex, selectCohort } from '../domain/cohort'
import { computeDailySeries, computeFunnel, computeOverview, computeSiteComparison } from '../domain/metrics'
import { getDeviceSnapshot } from '../domain/device-status'
import { deriveAnomalies, selectVisibleAnomalies } from '../domain/anomalies'
import GlobalFilters from '../components/GlobalFilters.vue'
import AnomalyBanner from '../components/AnomalyBanner.vue'
import OverviewMetrics from '../features/overview/OverviewMetrics.vue'
import TrendChart from '../features/overview/TrendChart.vue'
import ConversionFunnel from '../features/overview/ConversionFunnel.vue'
import SiteComparisonTable from '../features/overview/SiteComparisonTable.vue'
import ModerationSummary from '../features/overview/ModerationSummary.vue'
import DeviceSummary from '../features/overview/DeviceSummary.vue'
import ChartContainer from '../components/ChartContainer.vue'
import AnomalyTable from '../features/details/AnomalyTable.vue'
import type { Anomaly, SiteMetrics } from '../domain/types'

const router = useRouter()
const { dataset, loading, error, reload } = useDataset()

const { filters, invalid, setRange, setSites, reset } = useDashboardFilters(
  () => dataset.value?.sites.map(s => s.id) ?? [],
)

const index = computed(() => (dataset.value ? buildIndex(dataset.value) : undefined))
const cohort = computed(() =>
  dataset.value && index.value ? selectCohort(dataset.value, filters.value, index.value) : undefined)

const metrics = computed(() => (cohort.value ? computeOverview(cohort.value) : undefined))
const funnel = computed(() => (cohort.value ? computeFunnel(cohort.value) : undefined))
const daily = computed(() => (dataset.value ? computeDailySeries(dataset.value, filters.value) : []))
const devices = computed(() =>
  dataset.value ? getDeviceSnapshot(dataset.value, filters.value.siteIds, dataset.value.meta.asOf) : undefined)

const anomalies = computed(() =>
  dataset.value ? selectVisibleAnomalies(deriveAnomalies(dataset.value), filters.value) : [])

/** 异常数回填到点位表，避免点位组件反向依赖异常层。 */
const sites = computed<SiteMetrics[]>(() => {
  if (!dataset.value) return []
  const counts = new Map<string, number>()
  for (const a of anomalies.value) counts.set(a.siteId, (counts.get(a.siteId) ?? 0) + 1)
  return computeSiteComparison(dataset.value, filters.value)
    .map(row => ({ ...row, anomalies: counts.get(row.siteId) ?? 0 }))
})

const siteNames = computed(() => new Map((dataset.value?.sites ?? []).map(s => [s.id, s.name])))
const deviceNames = computed(() => new Map((dataset.value?.devices ?? []).map(d => [d.id, d.name])))

const isEmpty = computed(() => cohort.value !== undefined && cohort.value.sessions.length === 0)

function openTab(tab: string, status?: string) {
  const query: Record<string, string> = { start: filters.value.start, end: filters.value.end, tab }
  if (filters.value.siteIds.length > 0) query.sites = filters.value.siteIds.join(',')
  if (status) query.moderationStatus = status
  void router.push({ path: '/details', query })
}

function openSite(siteId: string) {
  void router.push({
    path: '/details',
    query: { start: filters.value.start, end: filters.value.end, tab: 'anomalies', sites: siteId },
  })
}

function openAnomaly(a: Anomaly) {
  void router.push({
    path: '/details',
    query: {
      start: filters.value.start, end: filters.value.end, tab: 'anomalies', anomalyId: a.id,
      ...(a.deviceId ? { deviceId: a.deviceId } : {}),
    },
  })
}
</script>

<template>
  <section class="page-head enter">
    <div>
      <h1>运营总览</h1>
      <p class="muted">
        统计范围 {{ filters.start }} 至 {{ filters.end }}，按参与日期归属；设备状态为快照，不随日期变化。
      </p>
    </div>
    <GlobalFilters
      :start="filters.start" :end="filters.end" :site-ids="filters.siteIds"
      :sites="dataset?.sites ?? []" :invalid="invalid"
      @range="setRange" @sites="setSites" @reset="reset"
    />
  </section>

  <ElSkeleton v-if="loading" animated :rows="6" class="panel" />

  <section v-else-if="error" class="panel data-state">
    <strong>加载失败</strong><p class="muted">{{ error }}</p>
    <ElButton size="small" @click="reload">重试</ElButton>
  </section>

  <template v-else-if="metrics && funnel && devices">
    <AnomalyBanner
      v-if="anomalies.length" class="enter" :anomalies="anomalies"
      @open="openTab('anomalies')"
    />

    <OverviewMetrics
      class="enter" style="--stagger: 1"
      :metrics="metrics" :devices="devices" :as-of="dataset!.meta.asOf" @open="openTab"
    />

    <p v-if="isEmpty" class="panel empty-note enter">
      当前范围没有参与记录。业务指标显示为无样本；设备快照仍然有效，因为它截至固定快照，与业务日期无关。
    </p>

    <div class="grid">
      <TrendChart class="span-2 enter" style="--stagger: 2" :series="daily" />
      <ConversionFunnel class="enter" style="--stagger: 3" :funnel="funnel" />
      <ModerationSummary class="enter" style="--stagger: 4" :metrics="metrics" @open="openTab('moderation', 'pending')" />

      <SiteComparisonTable class="span-2 enter" style="--stagger: 5" :rows="sites" @pick="openSite" />
      <DeviceSummary class="enter" style="--stagger: 6" :devices="devices" :as-of="dataset!.meta.asOf" @open="openTab('devices')" />

      <ChartContainer
        class="enter" style="--stagger: 7"
        title="异常摘要" :subtitle="`按严重程度排序 · ${anomalies.length} 条`"
        :empty="anomalies.length === 0"
        hint="仅列出当前范围内优先级最高的若干条，完整列表与证据核对在异常与明细页。"
      >
        <template #action>
          <button type="button" class="link" @click="openTab('anomalies')">全部 →</button>
        </template>
        <AnomalyTable
          :anomalies="anomalies" :site-names="siteNames" :device-names="deviceNames"
          :limit="6" @open="openAnomaly"
        />
      </ChartContainer>
    </div>
  </template>
</template>

<style scoped>
/* 首行把标题与筛选并排，省下一整行高度，让 KPI 卡更靠上 */
.page-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--space-5); flex-wrap: wrap; margin-bottom: var(--space-4);
}
.page-head > div:first-child { min-width: 260px; }
.page-head p { margin-top: 5px; }

.data-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px; }
.empty-note { margin-top: var(--space-4); font-size: 12px; color: var(--text-second); }

/* 四列栅格：趋势与点位表各占两列，右侧留出两个窄卡，整页填满不留大片空白 */
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); margin-top: var(--space-4); }
.span-2 { grid-column: span 2; }
.grid > * { display: block; }
.link { border: none; background: none; color: var(--color-primary); font-size: 11px; padding: 2px 0; }
.link:hover { text-decoration: underline; }

/* KPI 卡与异常横幅之间留出呼吸，其余卡片靠栅格间距 */
.grid > :first-child { grid-column: span 2; }

@media (max-width: 1366px) {
  .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
}
</style>
