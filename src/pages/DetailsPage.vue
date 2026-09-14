<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataset } from '../composables/useDataset'
import { useDashboardFilters } from '../composables/useDashboardFilters'
import { buildIndex, selectCohort } from '../domain/cohort'
import { deriveAnomalies, selectVisibleAnomalies } from '../domain/anomalies'
import { getDeviceSnapshot, selectVisibleIncidents } from '../domain/device-status'
import GlobalFilters from '../components/GlobalFilters.vue'
import StatusBadge from '../components/StatusBadge.vue'
import AnomalyTable from '../features/details/AnomalyTable.vue'
import AnomalyDetailDrawer from '../features/details/AnomalyDetailDrawer.vue'
import TaskDetailDrawer from '../features/details/TaskDetailDrawer.vue'
import DeviceDetailDrawer from '../features/details/DeviceDetailDrawer.vue'
import type { Anomaly, GenerationTask, TaskStatus } from '../domain/types'
import { decimal, integer, moderationLabels, taskLabels, timestamp } from '../config/format'

const route = useRoute()
const router = useRouter()
const { dataset, loading, error, reload } = useDataset()

const { filters, invalid, setRange, setSites, reset } = useDashboardFilters(
  () => dataset.value?.sites.map(s => s.id) ?? [],
)

const index = computed(() => (dataset.value ? buildIndex(dataset.value) : undefined))
const cohort = computed(() =>
  dataset.value && index.value ? selectCohort(dataset.value, filters.value, index.value) : undefined)

const TAB_KEYS = ['anomalies', 'generation', 'moderation', 'devices'] as const
type TabKey = typeof TAB_KEYS[number]
const tab = computed<TabKey>(() => {
  const raw = String(route.query.tab ?? 'anomalies')
  return (TAB_KEYS as readonly string[]).includes(raw) ? (raw as TabKey) : 'anomalies'
})

const siteNames = computed(() => new Map((dataset.value?.sites ?? []).map(s => [s.id, s.name])))
const deviceNames = computed(() => new Map((dataset.value?.devices ?? []).map(d => [d.id, d.name])))

const allAnomalies = computed(() => (dataset.value ? deriveAnomalies(dataset.value) : []))
const anomalies = computed(() => selectVisibleAnomalies(allAnomalies.value, filters.value))

// ---------------------------------------------------------------- 生成记录

const taskStatus = computed<TaskStatus | 'all'>(() => {
  const raw = String(route.query.taskStatus ?? 'all')
  return (['queued', 'running', 'success', 'failed', 'timeout'] as string[]).includes(raw) ? (raw as TaskStatus) : 'all'
})

const generationRows = computed(() => {
  const list = [...(cohort.value?.tasks ?? [])]
  list.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
  return taskStatus.value === 'all' ? list : list.filter(t => t.status === taskStatus.value)
})

const generationPage = ref(1)
const PAGE_SIZE = 12
const pagedGeneration = computed(() =>
  generationRows.value.slice((generationPage.value - 1) * PAGE_SIZE, generationPage.value * PAGE_SIZE))

// ---------------------------------------------------------------- 审核记录

const moderationStatus = computed(() => String(route.query.moderationStatus ?? 'all'))
const moderationRows = computed(() => {
  const asOfMs = Date.parse(dataset.value?.meta.asOf ?? '')
  const list = (cohort.value?.tasks ?? []).filter(t => t.status === 'success')
  const filtered = moderationStatus.value === 'all' ? list : list.filter(t => t.moderationStatus === moderationStatus.value)
  return [...filtered].sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    .map(t => ({
      ...t,
      waitMinutes: t.moderationStatus === 'pending' && t.finishedAt
        ? Math.round((asOfMs - Date.parse(t.finishedAt)) / 60_000)
        : null,
    }))
})
const moderationPage = ref(1)
const pagedModeration = computed(() =>
  moderationRows.value.slice((moderationPage.value - 1) * PAGE_SIZE, moderationPage.value * PAGE_SIZE))

// ---------------------------------------------------------------- 设备

const deviceSnapshot = computed(() =>
  dataset.value ? getDeviceSnapshot(dataset.value, filters.value.siteIds, dataset.value.meta.asOf) : undefined)

const incidents = computed(() => {
  if (!dataset.value) return []
  const startMs = Date.parse(`${filters.value.start}T00:00:00+08:00`)
  const endMs = Date.parse(`${filters.value.end}T00:00:00+08:00`) + 86_400_000
  return selectVisibleIncidents(dataset.value, filters.value.siteIds, startMs, endMs)
})

// ---------------------------------------------------------------- 抽屉

const openAnomaly = ref<Anomaly | null>(null)
const openTaskId = ref<string | null>(null)
const openDeviceId = ref<string | null>(null)

const taskForDrawer = computed<GenerationTask | null>(() => {
  if (!dataset.value) return null
  if (openTaskId.value) return dataset.value.tasks.find(t => t.id === openTaskId.value) ?? null
  if (openAnomaly.value?.taskIds.length) {
    return dataset.value.tasks.find(t => t.id === openAnomaly.value!.taskIds[0]) ?? null
  }
  return null
})

const sessionForTask = computed(() =>
  taskForDrawer.value && dataset.value
    ? dataset.value.sessions.find(s => s.id === taskForDrawer.value!.sessionId)
    : undefined)

const scansForTask = computed(() => {
  const t = taskForDrawer.value
  return t ? (cohort.value?.scans ?? []).filter(s => s.taskId === t.id) : []
})
const sharesForTask = computed(() => {
  const t = taskForDrawer.value
  return t ? (cohort.value?.shares ?? []).filter(s => s.taskId === t.id) : []
})

/**
 * 设备抽屉只由 openDeviceId 驱动。
 * 不能回退到「当前异常关联的设备」——否则点开一条设备类异常时，
 * 异常抽屉与设备抽屉会同时弹出，用户看到两个遮罩叠在一起。
 * 异常里的设备要主动点「相关设备」才打开。
 */
const deviceForDrawer = computed(() => {
  if (!dataset.value || !openDeviceId.value) return null
  return dataset.value.devices.find(d => d.id === openDeviceId.value) ?? null
})
const deviceStatusForDrawer = computed(() => {
  const d = deviceForDrawer.value
  return d ? deviceSnapshot.value?.devices.find(x => x.id === d.id)?.status ?? null : null
})

function setTab(next: TabKey) {
  const query: Record<string, string> = { ...route.query as Record<string, string>, tab: next }
  delete query.taskId
  delete query.anomalyId
  delete query.deviceId
  void router.replace({ path: '/details', query })
}

// 筛选变化后回到第一页，否则会停在越界的页码上
watch([filters, taskStatus, moderationStatus], () => {
  generationPage.value = 1
  moderationPage.value = 1
})
</script>

<template>
  <section class="page-head enter">
    <div>
      <h1>异常与明细</h1>
      <p class="muted">
        异常由原始记录按规则推导，可下钻到具体任务与设备事件核对证据。
        统计范围 {{ filters.start }} 至 {{ filters.end }}。
      </p>
    </div>
  </section>

  <section class="panel filter-panel enter" style="--stagger: 1">
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

  <template v-else>
    <div class="tabs enter" style="--stagger: 2" role="tablist">
      <button
        v-for="t in ([['anomalies','异常'],['generation','生成记录'],['moderation','审核记录'],['devices','设备']] as const)"
        :key="t[0]" type="button" role="tab" :aria-selected="tab === t[0]"
        :class="{ active: tab === t[0] }" @click="setTab(t[0])"
      >{{ t[1] }}</button>
    </div>

    <!-- 异常 -->
    <section v-if="tab === 'anomalies'" class="panel enter" style="--stagger: 3">
      <AnomalyTable
        :anomalies="anomalies" :site-names="siteNames" :device-names="deviceNames"
        @open="openAnomaly = $event"
      />
    </section>

    <!-- 生成记录 -->
    <section v-else-if="tab === 'generation'" class="panel enter" style="--stagger: 3">
      <div class="table-head">
        <h2>生成记录 <span class="count">{{ integer(generationRows.length) }} 条</span></h2>
        <div class="status-filter">
          <button
            v-for="s in ([['all','全部'],['success','成功'],['failed','失败'],['timeout','超时'],['queued','排队中'],['running','生成中']] as const)"
            :key="s[0]" type="button" :class="{ active: taskStatus === s[0] }"
            @click="router.replace({ path: '/details', query: { ...route.query, tab: 'generation', taskStatus: s[0] } })"
          >{{ s[1] }}</button>
        </div>
      </div>
      <ElTable :data="pagedGeneration" size="small" style="width: 100%" @row-click="(r: GenerationTask) => (openTaskId = r.id)">
        <ElTableColumn prop="id" label="任务 ID" width="94" />
        <ElTableColumn label="参与时间" width="150">
          <template #default="{ row }">{{ timestamp(row.submittedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="点位" width="130">
          <template #default="{ row }">{{ siteNames.get(cohort?.index.sessions.get(row.sessionId)?.siteId ?? '') ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="80">
          <template #default="{ row }">
            <StatusBadge
              :tone="row.status === 'success' ? 'success' : row.status === 'failed' || row.status === 'timeout' ? 'critical' : 'warning'"
              :label="taskLabels[row.status as TaskStatus]" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="重试" width="60">
          <template #default="{ row }">{{ row.attemptCount }}</template>
        </ElTableColumn>
        <ElTableColumn label="耗时" width="80">
          <template #default="{ row }">
            {{ row.finishedAt ? decimal((Date.parse(row.finishedAt) - Date.parse(row.submittedAt)) / 1000) + 's' : '—' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="错误码">
          <template #default="{ row }">{{ row.errorCode ?? '—' }}</template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="generationPage" layout="prev, pager, next" :page-size="PAGE_SIZE"
        :total="generationRows.length" class="pager" background
      />
    </section>

    <!-- 审核记录 -->
    <section v-else-if="tab === 'moderation'" class="panel enter" style="--stagger: 3">
      <div class="table-head">
        <h2>审核记录 <span class="count">{{ integer(moderationRows.length) }} 条</span></h2>
        <div class="status-filter">
          <button
            v-for="s in ([['all','全部'],['pending','待审核'],['approved','已通过'],['rejected','已拒绝']] as const)"
            :key="s[0]" type="button" :class="{ active: moderationStatus === s[0] }"
            @click="router.replace({ path: '/details', query: { ...route.query, tab: 'moderation', moderationStatus: s[0] } })"
          >{{ s[1] }}</button>
        </div>
      </div>
      <ElTable :data="pagedModeration" size="small" style="width: 100%" @row-click="(r: GenerationTask) => (openTaskId = r.id)">
        <ElTableColumn prop="id" label="关联任务" width="94" />
        <ElTableColumn label="审核状态" width="90">
          <template #default="{ row }">
            <StatusBadge
              :tone="row.moderationStatus === 'approved' ? 'success' : row.moderationStatus === 'rejected' ? 'critical' : 'warning'"
              :label="moderationLabels[row.moderationStatus as keyof typeof moderationLabels]" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="原因" width="140">
          <template #default="{ row }">{{ row.moderationReasonCode ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="生成完成" width="150">
          <template #default="{ row }">{{ timestamp(row.finishedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="等待时长" width="100">
          <template #default="{ row }">
            <span :class="{ 'text-warning': row.waitMinutes !== null && row.waitMinutes > 10 }">
              {{ row.waitMinutes === null ? '—' : row.waitMinutes + ' 分钟' }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="已展示">
          <template #default="{ row }">{{ row.displayedAt ? timestamp(row.displayedAt) : '未展示' }}</template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="moderationPage" layout="prev, pager, next" :page-size="PAGE_SIZE"
        :total="moderationRows.length" class="pager" background
      />
    </section>

    <!-- 设备 -->
    <section v-else class="panel enter" style="--stagger: 3">
      <div class="table-head">
        <h2>设备快照 <span class="count">截至 {{ dataset?.meta.asOf.slice(0, 16).replace('T', ' ') }}</span></h2>
        <p class="muted">当前状态只随点位筛选变化，不随日期变化。</p>
      </div>
      <ElTable :data="deviceSnapshot?.devices ?? []" size="small" style="width: 100%" @row-click="(r: { id: string }) => (openDeviceId = r.id)">
        <ElTableColumn prop="id" label="设备" width="80" />
        <ElTableColumn prop="name" label="名称" min-width="160" />
        <ElTableColumn label="点位" width="130">
          <template #default="{ row }">{{ siteNames.get(row.siteId) ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="90">
          <template #default="{ row }">
            <StatusBadge
              :tone="row.status === 'online' ? 'success' : row.status === 'offline' ? 'critical' : 'unknown'"
              :label="row.status === 'online' ? '在线' : row.status === 'offline' ? '离线' : '未上报'" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="最近心跳">
          <template #default="{ row }">{{ row.lastHeartbeatAt ? timestamp(row.lastHeartbeatAt) : '从未上报' }}</template>
        </ElTableColumn>
      </ElTable>

      <div class="table-head" style="margin-top: 22px">
        <h2>历史离线事件 <span class="count">{{ incidents.length }} 次</span></h2>
        <p class="muted">按离线区间与所选日期是否相交筛选，跨日未恢复的设备不会被漏掉。</p>
      </div>
      <ElTable :data="incidents" size="small" style="width: 100%">
        <ElTableColumn prop="deviceId" label="设备" width="80" />
        <ElTableColumn label="设备名称" min-width="150">
          <template #default="{ row }">{{ deviceNames.get(row.deviceId) ?? '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="离线开始" width="150">
          <template #default="{ row }">{{ timestamp(row.offlineAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="恢复时间" width="170">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.restoredAt === null }">
              {{ row.restoredAt ? timestamp(row.restoredAt) : '截至快照未恢复' }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="reasonCode" label="原因码" />
      </ElTable>
    </section>
  </template>

  <AnomalyDetailDrawer
    :anomaly="openAnomaly" :site-name="siteNames.get(openAnomaly?.siteId ?? '') ?? ''"
    :device-name="openAnomaly?.deviceId ? deviceNames.get(openAnomaly.deviceId) : undefined"
    :tasks="cohort?.tasks ?? []" :sessions="cohort?.sessions ?? []" :devices="new Map((dataset?.devices ?? []).map(d => [d.id, d]))"
    @close="openAnomaly = null" @open-task="openTaskId = $event; openAnomaly = null" @open-device="openDeviceId = $event"
  />
  <TaskDetailDrawer
    :task="openTaskId ? taskForDrawer : null" :session="sessionForTask"
    :site="dataset?.sites.find(s => s.id === sessionForTask?.siteId)"
    :device="dataset?.devices.find(d => d.id === sessionForTask?.deviceId)"
    :scans="scansForTask" :shares="sharesForTask"
    @close="openTaskId = null" @open-device="openDeviceId = $event"
  />
  <DeviceDetailDrawer
    :device="deviceForDrawer" :status="deviceStatusForDrawer"
    :site="dataset?.sites.find(s => s.id === deviceForDrawer?.siteId)"
    :incidents="(dataset?.incidents ?? []).filter(i => i.deviceId === deviceForDrawer?.id)"
    :as-of="dataset?.meta.asOf ?? ''"
    @close="openDeviceId = null"
  />
</template>

<style scoped>
.page-head { margin-bottom: var(--space-4); }
.page-head p { margin-top: 6px; }
.filter-panel { padding: 14px 18px; margin-bottom: var(--space-4); }
.data-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px; }

.tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 11px; background: var(--bg-subtle); border: 1px solid var(--border-light); margin-bottom: var(--space-4); }
.tabs button {
  border: none; background: none; color: var(--text-weak); font-size: 12.5px;
  padding: 7px 16px; border-radius: 8px;
  transition: color var(--dur-fast) var(--ease-soft), background var(--dur-fast) var(--ease-soft);
}
.tabs button:hover { color: var(--text-second); }
.tabs button.active { color: var(--color-primary); background: var(--bg-blue); }

.table-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.table-head h2 { display: flex; align-items: baseline; gap: 9px; }
.count { font-size: 11px; font-weight: 400; color: var(--text-weak); }
.status-filter { display: flex; gap: 4px; }
.status-filter button {
  border: 1px solid var(--border-light); background: var(--bg-subtle); color: var(--text-weak);
  font-size: 11px; padding: 4px 10px; border-radius: 8px;
  transition: all var(--dur-fast) var(--ease-soft);
}
.status-filter button:hover { color: var(--text-second); border-color: var(--glass-border); }
.status-filter button.active { color: var(--color-primary); background: var(--bg-blue); border-color: rgba(78,168,255,.28); }
.pager { margin-top: 14px; justify-content: flex-end; }
:deep(.el-table__row) { cursor: pointer; }
</style>
