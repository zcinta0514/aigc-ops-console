<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { EChartsCoreOption } from 'echarts/core'
import { useDataset } from '../composables/useDataset'
import { useDashboardFilters } from '../composables/useDashboardFilters'
import { buildIndex, selectCohort } from '../domain/cohort'
import { computeHourlySeries, computeOverview } from '../domain/metrics'
import { getDeviceSnapshot } from '../domain/device-status'
import { deriveAnomalies, selectVisibleAnomalies } from '../domain/anomalies'
import { DEMO } from '../config/demo'
import { THRESHOLDS } from '../config/thresholds'
import { areaGradient, glowLine, palette } from '../styles/echarts-theme'
import { timestamp } from '../config/format'
import ChartContainer from '../components/ChartContainer.vue'
import ChartCanvas from '../components/ChartCanvas.vue'
import GlobalFilters from '../components/GlobalFilters.vue'
import OverviewMetrics from '../features/overview/OverviewMetrics.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TimeScrubber from '../features/live/TimeScrubber.vue'

const router = useRouter()
const { dataset, loading, error, reload } = useDataset()
const { filters, invalid, setRange, setSites, reset } = useDashboardFilters(
  () => dataset.value?.sites.map(s => s.id) ?? [],
)

/** 当日 = 数据集最后一天，也是快照所在的那一天。 */
const today = DEMO.end
const SNAPSHOT_ASOF = DEMO.asOf
const OPEN_MIN = 10 * 60
const CLOSE_MIN = 20 * 60

// ---------------------------------------------------------------- 时间回放

/**
 * 回放位置（当天第几分钟）。默认停在快照时刻，也就是真实交付状态。
 * 往回拖时，所有指标按那一刻重算：尚未开始的会话不出现，
 * 尚未完成的任务显示为生成中，尚未发生的审核与展示一律不可见。
 */
const replayMinute = ref(CLOSE_MIN)
const playing = ref(false)
const STEP_MINUTES = 2
const TICK_MS = 55
let timer: number | undefined

function stop() {
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined }
  playing.value = false
}

function togglePlay() {
  if (playing.value) { stop(); return }
  // 已经在末尾时再按播放，从头开始
  if (replayMinute.value >= CLOSE_MIN) replayMinute.value = OPEN_MIN
  playing.value = true
  timer = window.setInterval(() => {
    const next = replayMinute.value + STEP_MINUTES
    if (next >= CLOSE_MIN) { replayMinute.value = CLOSE_MIN; stop() }
    else replayMinute.value = next
  }, TICK_MS)
}

function toSnapshot() {
  stop()
  replayMinute.value = CLOSE_MIN
}

onBeforeUnmount(stop)

const replayLabel = computed(() => {
  const m = replayMinute.value
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

const isReplaying = computed(() => replayMinute.value < CLOSE_MIN)

/** 回放时刻的观察截止。未回放时就等于数据集快照时间。 */
const asOf = computed(() => {
  if (!isReplaying.value) return SNAPSHOT_ASOF
  return `${today}T${replayLabel.value}:00+08:00`
})

/** 营业时段内已产生数据的分钟区间，供轨道标注。 */
const activeFrom = OPEN_MIN
const activeTo = CLOSE_MIN

// ---------------------------------------------------------------- 计算

const index = computed(() => (dataset.value ? buildIndex(dataset.value) : undefined))

const todayCohort = computed(() =>
  dataset.value && index.value
    ? selectCohort(dataset.value, { start: today, end: today, siteIds: filters.value.siteIds, asOf: asOf.value }, index.value)
    : undefined)

const metrics = computed(() => (todayCohort.value ? computeOverview(todayCohort.value) : undefined))

/** 设备状态始终是快照口径，不参与回放——数据里只有最后一次心跳，没有心跳历史。 */
const devices = computed(() =>
  dataset.value ? getDeviceSnapshot(dataset.value, filters.value.siteIds, SNAPSHOT_ASOF) : undefined)

const hourly = computed(() =>
  dataset.value ? computeHourlySeries(dataset.value, today, filters.value.siteIds, asOf.value) : [])

const anomalies = computed(() =>
  dataset.value
    ? selectVisibleAnomalies(deriveAnomalies(dataset.value, asOf.value), { ...filters.value, start: today, end: today })
    : [])

const queue = computed(() => {
  const list = (todayCohort.value?.tasks ?? []).filter(t => t.status === 'queued' || t.status === 'running')
  return [...list].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
})

const pendingQueue = computed(() => {
  const asOfMs = Date.parse(asOf.value)
  return (todayCohort.value?.tasks ?? [])
    .filter(t => t.status === 'success' && t.moderationStatus === 'pending')
    .map(t => ({ ...t, waitMinutes: t.finishedAt ? Math.round((asOfMs - Date.parse(t.finishedAt)) / 60_000) : 0 }))
    .sort((a, b) => b.waitMinutes - a.waitMinutes)
    .slice(0, 12)
})

/**
 * 回放处在某个小时中间时，该小时只统计了一部分。
 * 若不标出来，折线上最后一段的「下跌」会被误读成参与人数骤降——
 * 而它只是这个小时还没走完。本看板存在的意义就是避免这类假异常。
 */
const partialHourLabel = computed(() => {
  if (!isReplaying.value) return null
  if (replayMinute.value % 60 === 0) return null
  const h = Math.floor(replayMinute.value / 60)
  return hourly.value.find(p => p.hour === `${String(h).padStart(2, '0')}:00`)?.label ?? null
})

const hourlyOption = computed<EChartsCoreOption>(() => ({
  grid: { left: 8, right: 14, top: 34, bottom: 4, containLabel: true },
  tooltip: { trigger: 'axis' },
  legend: { data: ['参与人数', '生成成功率', 'P90 时长'] },
  xAxis: { type: 'category', data: hourly.value.map(h => h.label), boundaryGap: false },
  yAxis: [
    { type: 'value', name: '人', nameTextStyle: { color: palette.weak } },
    { type: 'value', name: '%', min: 0, max: 100, nameTextStyle: { color: palette.weak }, splitLine: { show: false } },
  ],
  series: [
    {
      name: '参与人数', type: 'line', smooth: 0.35, yAxisIndex: 0,
      data: hourly.value.map(h => (h.participants > 0 ? h.participants : null)),
      connectNulls: false, lineStyle: glowLine(palette.primary),
      areaStyle: { color: areaGradient('rgba(78,168,255,0.22)') }, itemStyle: { color: palette.primary },
      markArea: partialHourLabel.value ? {
        silent: true,
        itemStyle: { color: 'rgba(78, 168, 255, 0.07)' },
        label: {
          show: true, position: 'insideTop' as const,
          formatter: '进行中', color: palette.weak, fontSize: 10,
        },
        data: [[{ xAxis: partialHourLabel.value }, { xAxis: partialHourLabel.value }]],
      } : undefined,
    },
    {
      name: '生成成功率', type: 'line', smooth: 0.35, yAxisIndex: 1,
      data: hourly.value.map(h => (h.successRate === null ? null : +(h.successRate * 100).toFixed(1))),
      connectNulls: false, lineStyle: glowLine(palette.success), itemStyle: { color: palette.success },
    },
    {
      name: 'P90 时长', type: 'line', smooth: 0.35, yAxisIndex: 0,
      data: hourly.value.map(h => (h.p90Seconds === null ? null : +h.p90Seconds.toFixed(1))),
      connectNulls: false, lineStyle: { ...glowLine(palette.warning), type: 'dashed' }, itemStyle: { color: palette.warning },
    },
  ],
}))

const hourlyEmpty = computed(() => hourly.value.every(h => h.sessions === 0))
const snapshotLabel = computed(() => SNAPSHOT_ASOF.slice(0, 16).replace('T', ' '))
const siteNames = computed(() => new Map((dataset.value?.sites ?? []).map(s => [s.id, s.name])))

function openTab(tab: string, status?: string) {
  const query: Record<string, string> = { start: today, end: today, tab }
  if (filters.value.siteIds.length > 0) query.sites = filters.value.siteIds.join(',')
  if (status) query.moderationStatus = status
  void router.push({ path: '/details', query })
}

// 手动拖动时停止自动播放，避免两股力量互相打架
watch(replayMinute, (v, old) => {
  if (playing.value && v < old) stop()
})
</script>

<template>
  <section class="page-head enter">
    <div>
      <h1>实时监控</h1>
      <p class="muted">
        观测日 {{ today }} · 快照 {{ snapshotLabel }}（北京时间）· 点位筛选已应用
      </p>
    </div>
    <p class="hint-inline">
      拖动下方时间轴可回放当天，观察指标如何一步步演变。
    </p>
  </section>

  <section class="enter" style="--stagger: 1">
    <TimeScrubber
      v-model="replayMinute" :min="OPEN_MIN" :max="CLOSE_MIN"
      :playing="playing" :active-from="activeFrom" :active-to="activeTo"
      @toggle="togglePlay" @reset="toSnapshot"
    />
  </section>

  <section v-if="isReplaying" class="replay-note fade-in" role="note">
    <span class="mark" aria-hidden="true">◷</span>
    <div>
      <strong>正在回放 {{ replayLabel }}，不是当前快照</strong>
      <p>
        该时刻之后才开始的会话、才完成的任务、才出结果的审核一律不可见——
        你看到的是"当时能看到的全部信息"。设备状态不参与回放，始终显示快照口径。
      </p>
    </div>
  </section>

  <section class="panel filter-panel enter" style="--stagger: 2">
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

  <template v-else-if="metrics && devices">
    <OverviewMetrics
      class="enter" style="--stagger: 3"
      :metrics="metrics" :devices="devices" :as-of="SNAPSHOT_ASOF" :replay-label="isReplaying ? replayLabel : undefined"
      @open="openTab"
    />

    <div class="grid-live enter" style="--stagger: 4">
      <ChartContainer
        class="span-2" title="当日逐小时"
        :subtitle="isReplaying ? `截至 ${replayLabel}；最后一段为进行中的小时，低于前几段属正常` : '完整营业时段'"
        :empty="hourlyEmpty"
        hint="左轴为人数与秒数，右轴为百分比，两个量纲各用各的轴。回放时尚未到来的小时绘制为缺口，而不是 0。"
      >
        <ChartCanvas :option="hourlyOption" :height="230" />
      </ChartContainer>

      <ChartContainer
        title="生成队列" :subtitle="`截至${isReplaying ? ' ' + replayLabel : '快照'}仍未结束 · ${queue.length} 条`"
        :empty="queue.length === 0"
        hint="排队中与生成中的任务。它们不计入生成成功率的分母，因此成功率卡片会单独列出这两个数量。回放时，比当前时刻更晚完成的任务会回到「生成中」。"
      >
        <ul class="queue">
          <li v-for="t in queue" :key="t.id">
            <StatusBadge :tone="t.status === 'queued' ? 'neutral' : 'warning'" :label="t.status === 'queued' ? '排队中' : '生成中'" />
            <span class="qid">{{ t.id }}</span>
            <span class="qsite">{{ siteNames.get(todayCohort?.index.sessions.get(t.sessionId)?.siteId ?? '') ?? '—' }}</span>
            <span class="qtime">{{ timestamp(t.submittedAt).slice(11, 19) }}</span>
          </li>
        </ul>
      </ChartContainer>
    </div>

    <div class="grid-live enter" style="--stagger: 5">
      <ChartContainer
        title="待审核队列" :subtitle="`按等待时长倒序 · 共 ${metrics.pending} 条`"
        :empty="pendingQueue.length === 0"
        hint="等待时长从生成完成时间算至当前观察时刻。内容已生成但未过审，用户当场拿不到结果，这是最直接影响现场体验的一类积压。"
      >
        <template #action>
          <button type="button" class="link" @click="openTab('moderation', 'pending')">全部待审 →</button>
        </template>
        <ul class="queue">
          <li v-for="t in pendingQueue" :key="t.id">
            <span class="qid">{{ t.id }}</span>
            <span class="qsite">{{ siteNames.get(todayCohort?.index.sessions.get(t.sessionId)?.siteId ?? '') ?? '—' }}</span>
            <span class="wait" :class="{ over: t.waitMinutes > THRESHOLDS.moderationBacklog.waitMinutes }">{{ t.waitMinutes }} 分钟</span>
          </li>
        </ul>
      </ChartContainer>

      <ChartContainer
        title="设备网格" :subtitle="`快照 ${snapshotLabel} · 不参与回放`"
        :empty="devices.devices.length === 0"
        hint="在线、离线、未知三态。未知指从未上报心跳，不冒充已确认离线。数据中只有每台设备的最后一次心跳，没有心跳历史，因此该面板固定为快照口径。"
      >
        <div class="device-grid">
          <button
            v-for="d in devices.devices" :key="d.id" type="button" class="device-cell"
            :class="d.status"
            @click="router.push({ path: '/details', query: { tab: 'devices' } })"
          >
            <span class="dot" aria-hidden="true" />
            <span class="dname">{{ d.id }}</span>
            <span class="dlabel">{{ d.status === 'online' ? '在线' : d.status === 'offline' ? '离线' : '未上报' }}</span>
          </button>
        </div>
      </ChartContainer>

      <ChartContainer
        title="当日异常" :subtitle="`${anomalies.length} 条`" :empty="anomalies.length === 0"
        hint="仅展示归属当日的异常。回放时按当前时刻重算：那时还不足以判定为异常的，不会提前出现。"
      >
        <template #action>
          <button type="button" class="link" @click="openTab('anomalies')">全部异常 →</button>
        </template>
        <ul class="anoms">
          <li v-for="a in anomalies.slice(0, 8)" :key="a.id" :class="a.severity">
            <span class="mark" aria-hidden="true">{{ a.severity === 'critical' ? '■' : a.severity === 'warning' ? '▲' : '○' }}</span>
            <span class="atitle">{{ a.title }}</span>
          </li>
        </ul>
      </ChartContainer>
    </div>
  </template>
</template>

<style scoped>
.page-head { margin-bottom: var(--space-3); display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; }
.page-head p { margin-top: 6px; }
.hint-inline { font-size: 11px; color: var(--text-weak); align-self: center; }
.filter-panel { padding: 12px 18px; margin: var(--space-4) 0; }

.replay-note {
  display: flex; gap: 13px; align-items: flex-start;
  margin-top: var(--space-3); padding: 12px 18px;
  border-radius: var(--radius-card);
  background: linear-gradient(90deg, rgba(78, 168, 255, 0.13), rgba(78, 168, 255, 0.02));
  border: 1px solid rgba(78, 168, 255, 0.28);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}
.replay-note strong { font-size: 12.5px; color: var(--text-primary); display: block; margin-bottom: 4px; }
.replay-note p { font-size: 11px; line-height: 1.7; color: var(--text-second); }
.replay-note .mark { color: var(--color-primary); font-size: 14px; margin-top: 2px; }

.grid-live { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); margin-top: var(--space-4); }
.span-2 { grid-column: span 2; }
.grid-live > :nth-child(3), .grid-live > :nth-child(4) { grid-column: span 2; }

.queue { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; max-height: 232px; overflow-y: auto; }
.queue li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; background: var(--bg-subtle); font-size: 11px; }
.qid { color: var(--color-primary); font-family: ui-monospace, monospace; font-size: 10.5px; }
.qsite { color: var(--text-second); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qtime, .wait { margin-left: auto; color: var(--text-weak); font-size: 10px; white-space: nowrap; }
.wait.over { color: var(--color-warning); font-weight: 600; }

.device-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.device-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 11px 4px; border-radius: 10px; border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-soft);
}
.device-cell:hover { transform: translateY(-2px); border-color: var(--glass-border-strong); }
.device-cell .dot { width: 7px; height: 7px; border-radius: 50%; }
.device-cell.online .dot { background: var(--color-success); box-shadow: 0 0 8px var(--color-success); }
.device-cell.offline .dot { background: var(--color-critical); box-shadow: 0 0 8px var(--color-critical); }
.device-cell.unknown .dot { background: transparent; border: 1.5px solid var(--color-unknown); }
.dname { font-size: 11px; color: var(--text-primary); }
.dlabel { font-size: 9px; color: var(--text-weak); }
.device-cell.online .dlabel { color: var(--color-success); }
.device-cell.offline .dlabel { color: var(--color-critical); }

.anoms { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; max-height: 232px; overflow-y: auto; }
.anoms li { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 8px; background: var(--bg-subtle); border-left: 2px solid var(--color-unknown); }
.anoms li.critical { border-left-color: var(--color-critical); }
.anoms li.warning { border-left-color: var(--color-warning); }
.mark { font-size: 8px; color: var(--color-unknown); }
.anoms li.critical .mark { color: var(--color-critical); }
.anoms li.warning .mark { color: var(--color-warning); }
.atitle { font-size: 11.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.link { border: none; background: none; color: var(--color-primary); font-size: 11px; padding: 2px 0; }
.link:hover { text-decoration: underline; }
.data-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px; }

@media (max-width: 1366px) { .device-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
