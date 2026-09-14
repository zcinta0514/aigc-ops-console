<script setup lang="ts">
import { computed } from 'vue'
import type { DeviceSnapshot } from '../../domain/types'
import ChartContainer from '../../components/ChartContainer.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { integer } from '../../config/format'
import { timestamp } from '../../config/format'

const props = defineProps<{ devices: DeviceSnapshot; asOf: string; loading?: boolean }>()
const emit = defineEmits<{ open: [deviceId: string] }>()

const empty = computed(() => props.devices.devices.length === 0)
const snapshot = computed(() => props.asOf.slice(0, 16).replace('T', ' '))

const counts = computed(() => [
  { key: 'online', label: '在线', value: props.devices.online, tone: 'success' as const },
  { key: 'offline', label: '离线', value: props.devices.offline, tone: 'critical' as const },
  { key: 'unknown', label: '未知', value: props.devices.unknown, tone: 'unknown' as const },
])

/** 离线与未知优先展示，正常设备不必占满列表。 */
const notable = computed(() => props.devices.devices
  .filter(d => d.status !== 'online')
  .sort((a, b) => (a.status === b.status ? a.id.localeCompare(b.id) : a.status === 'offline' ? -1 : 1)))
</script>

<template>
  <ChartContainer
    title="设备状态"
    :hint="'截至快照的设备状态，只随点位筛选变化，不受参与日期影响。心跳为空表示从未上报，属未知而非已确认离线。'"
    :empty="empty" :loading="loading"
    :subtitle="`快照 ${snapshot}`"
  >
    <div class="counts">
      <div v-for="c in counts" :key="c.key" class="count" :class="c.tone">
        <strong>{{ integer(c.value) }}</strong>
        <span>{{ c.label }}</span>
      </div>
    </div>

    <ul v-if="notable.length" class="list">
      <li v-for="d in notable" :key="d.id">
        <button type="button" class="row" @click="emit('open', d.id)">
          <span class="name">{{ d.name }}</span>
          <StatusBadge :tone="d.status === 'offline' ? 'critical' : 'unknown'"
                       :label="d.status === 'offline' ? '离线' : '未上报'" />
          <span class="beat">{{ timestamp(d.lastHeartbeatAt) }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="all-good"><span aria-hidden="true">●</span> 所选点位设备全部在线</p>

    <template #footer>
      <p class="semantics">日期筛选仅影响业务统计与历史设备事件，不改变上方快照。</p>
    </template>
  </ChartContainer>
</template>

<style scoped>
.counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.count {
  display: flex; flex-direction: column; gap: 3px; align-items: center;
  padding: 11px 6px; border-radius: 10px;
  background: var(--bg-subtle); border: 1px solid var(--border-light);
}
.count strong { font-size: 21px; font-weight: 600; line-height: 1.1; color: var(--text-primary); }
.count span { font-size: 10px; color: var(--text-weak); }
.count.success strong { color: var(--color-success); }
.count.critical strong { color: var(--color-critical); }
.count.unknown strong { color: var(--color-unknown); }

.list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 5px; }
.row {
  width: 100%; display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: 9px; border: 1px solid transparent;
  background: var(--bg-subtle); text-align: left;
  transition: background var(--dur-fast) var(--ease-soft), border-color var(--dur-fast) var(--ease-soft);
}
.row:hover { background: var(--bg-card-hover); border-color: var(--glass-border); }
.name { font-size: 12px; color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.beat { font-size: 10px; color: var(--text-weak); white-space: nowrap; }
.all-good { margin-top: 12px; font-size: 12px; color: var(--color-success); display: flex; align-items: center; gap: 7px; }
.all-good span { font-size: 8px; }
.semantics { font-size: 10px; color: var(--text-weak); border-top: 1px solid var(--border-light); padding-top: 10px; margin-top: 12px; }
</style>
