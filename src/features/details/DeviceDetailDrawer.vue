<script setup lang="ts">
import { computed } from 'vue'
import type { Device, DeviceIncident, DeviceStatus, Site } from '../../domain/types'
import StatusBadge from '../../components/StatusBadge.vue'
import { THRESHOLDS } from '../../config/thresholds'
import { timestamp } from '../../config/format'

const props = defineProps<{
  device: Device | null
  status: DeviceStatus | null
  site?: Site
  incidents: readonly DeviceIncident[]
  asOf: string
}>()
const emit = defineEmits<{ close: [] }>()

const open = computed(() => props.device !== null)

const STATUS_LABEL = { online: '在线', offline: '离线', unknown: '未上报' } as const
const STATUS_TONE = { online: 'success', offline: 'critical', unknown: 'unknown' } as const

const rule = computed(() => {
  const minutes = THRESHOLDS.heartbeatOnlineSeconds
  return `心跳距快照不超过 ${minutes} 秒记为在线；超过记为离线；没有任何心跳记录记为未知。`
})

const history = computed(() => [...props.incidents].sort((a, b) => (a.offlineAt < b.offlineAt ? 1 : -1)))
</script>

<template>
  <ElDrawer :model-value="open" size="460px" :with-header="false" @close="emit('close')">
    <div v-if="device && status" class="drawer">
      <header class="head">
        <div>
          <div class="eyebrow">
            <StatusBadge :tone="STATUS_TONE[status]" :label="STATUS_LABEL[status]" />
            <span class="did">{{ device.id }}</span>
          </div>
          <h2>{{ device.name }}</h2>
        </div>
        <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <section class="block">
        <h3>快照信息</h3>
        <dl class="kv">
          <div><dt>所属点位</dt><dd>{{ site?.name ?? '—' }}</dd></div>
          <div><dt>注册时间</dt><dd>{{ timestamp(device.registeredAt) }}</dd></div>
          <div><dt>最近心跳</dt><dd>{{ device.lastHeartbeatAt ? timestamp(device.lastHeartbeatAt) : '从未上报' }}</dd></div>
          <div><dt>数据截止</dt><dd>{{ timestamp(asOf) }}</dd></div>
        </dl>
        <p class="rule">{{ rule }}</p>
        <p v-if="status === 'unknown'" class="note warn">
          该设备从未上报心跳，状态为未知，不等同于已确认离线。
        </p>
      </section>

      <section class="block">
        <h3>历史离线事件 <span class="count">{{ history.length }} 次</span></h3>
        <ul v-if="history.length" class="events">
          <li v-for="i in history" :key="i.id">
            <div class="row">
              <span class="time">{{ timestamp(i.offlineAt) }}</span>
              <span class="arrow">→</span>
              <span class="time" :class="{ unresolved: i.restoredAt === null }">
                {{ i.restoredAt ? timestamp(i.restoredAt) : '截至快照未恢复' }}
              </span>
            </div>
            <div class="sub"><span class="code">{{ i.reasonCode }}</span><span class="eid">{{ i.id }}</span></div>
          </li>
        </ul>
        <p v-else class="note">该设备没有历史离线记录。</p>
        <p class="note">历史离线区间用于日期范围内的业务核对；上方快照状态始终截至数据截止时间，不随日期筛选变化。</p>
      </section>
    </div>
  </ElDrawer>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; }
.eyebrow { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; }
.did { font-size: 11px; color: var(--text-weak); font-family: ui-monospace, monospace; }
.head h2 { font-size: 16px; color: var(--text-primary); }
.close { border: none; background: none; color: var(--text-weak); font-size: 22px; line-height: 1; padding: 0 4px; }
.close:hover { color: var(--text-primary); }
.block h3 { font-size: 12px; color: var(--text-second); font-weight: 500; margin-bottom: 9px; display: flex; align-items: center; gap: 7px; }
.count { font-size: 10px; color: var(--text-weak); }
.kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 16px; margin: 0 0 12px; }
.kv div { display: flex; flex-direction: column; gap: 2px; }
.kv dt { font-size: 10px; color: var(--text-weak); }
.kv dd { margin: 0; font-size: 12.5px; color: var(--text-primary); }
.rule { font-size: 11px; line-height: 1.65; color: var(--text-second); background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: 9px; padding: 10px 12px; }
.note { margin-top: 10px; font-size: 10.5px; line-height: 1.6; color: var(--text-weak); }
.note.warn { color: var(--color-warning); }
.events { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
.events li { padding: 10px 12px; border-radius: 9px; background: var(--bg-subtle); border: 1px solid var(--border-light); }
.row { display: flex; align-items: center; gap: 9px; font-size: 11.5px; color: var(--text-primary); }
.arrow { color: var(--text-weak); }
.unresolved { color: var(--color-critical); }
.sub { display: flex; gap: 12px; margin-top: 6px; font-size: 10px; color: var(--text-weak); }
.code { font-family: ui-monospace, monospace; }
.eid { margin-left: auto; font-family: ui-monospace, monospace; }
</style>
