<script setup lang="ts">
import { computed } from 'vue'
import type { Anomaly, Device, GenerationTask, Session } from '../../domain/types'
import StatusBadge from '../../components/StatusBadge.vue'
import { decimal, percent, taskLabels, timestamp } from '../../config/format'

const props = defineProps<{
  anomaly: Anomaly | null
  siteName: string
  deviceName?: string
  tasks: readonly GenerationTask[]
  sessions: readonly Session[]
  devices: ReadonlyMap<string, Device>
}>()
const emit = defineEmits<{ close: []; openTask: [id: string]; openDevice: [id: string] }>()

const open = computed(() => props.anomaly !== null)
const a = computed(() => props.anomaly)

const TONE = { critical: 'critical', warning: 'warning', info: 'neutral' } as const
const LABEL = { critical: '严重', warning: '警告', info: '提示' } as const

/** 分子分母只在真正是比率类异常时展示，设备类异常不能硬套"分子/分母"。 */
const isRate = computed(() => a.value !== null && ['generation_success', 'moderation_backlog'].includes(a.value.type))

const related = computed(() => {
  if (!a.value) return []
  const ids = new Set(a.value.taskIds)
  return props.tasks.filter(t => ids.has(t.id)).slice(0, 50)
})
</script>

<template>
  <ElDrawer :model-value="open" size="520px" :with-header="false" @close="emit('close')">
    <div v-if="a" class="drawer">
      <header class="head">
        <div>
          <div class="eyebrow">
            <StatusBadge :tone="TONE[a.severity]" :label="LABEL[a.severity]" />
            <span class="scope">{{ a.deviceId ? deviceName : siteName }}</span>
            <span v-if="a.bucketDate" class="scope">{{ a.bucketDate }}</span>
          </div>
          <h2>{{ a.title }}</h2>
        </div>
        <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <section class="block">
        <h3>触发规则</h3>
        <p class="rule">{{ a.rule }}</p>
        <dl class="kv">
          <div><dt>实际值</dt><dd class="strong">{{ a.type === 'device_offline' ? `${a.actual} 分钟` : a.type === 'moderation_backlog' ? `${a.actual} 条` : a.actual < 1 ? percent(a.actual) : decimal(a.actual) }}</dd></div>
          <div><dt>阈值</dt><dd>{{ a.type === 'device_offline' ? `${a.threshold} 分钟` : a.type === 'moderation_backlog' ? `${a.threshold} 条` : a.threshold < 1 ? percent(a.threshold) : decimal(a.threshold) }}</dd></div>
          <div v-if="isRate"><dt>分子 / 分母</dt><dd>{{ a.numerator }} / {{ a.denominator }}</dd></div>
          <div><dt>样本量</dt><dd>{{ a.sampleSize > 0 ? a.sampleSize : '不适用' }}</dd></div>
          <div v-if="a.scanRate !== undefined && a.scanRate !== null"><dt>同期扫码领取率</dt><dd>{{ percent(a.scanRate) }}</dd></div>
          <div v-if="a.offlineAt"><dt>离线开始</dt><dd>{{ timestamp(a.offlineAt) }}</dd></div>
          <div v-if="a.offlineAt"><dt>恢复时间</dt><dd>{{ a.restoredAt ? timestamp(a.restoredAt) : '截至快照未恢复' }}</dd></div>
          <div><dt>观察截至</dt><dd>{{ timestamp(a.observedAt) }}</dd></div>
        </dl>
      </section>

      <section class="block">
        <h3>建议排查</h3>
        <p class="suggestion">{{ a.suggestion }}</p>
        <p class="caution">以上为规则输出，用于指引核查方向，不等同于已确认根因。仅凭时间重合不能认定故障因果关系。</p>
      </section>

      <section v-if="related.length" class="block">
        <h3>关联记录 <span class="count">{{ a.taskIds.length }} 条</span></h3>
        <ul class="records">
          <li v-for="t in related" :key="t.id">
            <button type="button" @click="emit('openTask', t.id)">
              <span class="tid">{{ t.id }}</span>
              <span class="status">{{ taskLabels[t.status] }}</span>
              <span class="time">{{ timestamp(t.finishedAt ?? t.submittedAt) }}</span>
              <span class="dur">{{ t.finishedAt ? decimal((Date.parse(t.finishedAt) - Date.parse(t.submittedAt)) / 1000) + 's' : '—' }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section v-if="a.deviceId" class="block">
        <h3>相关设备</h3>
        <button type="button" class="device-link" @click="emit('openDevice', a.deviceId!)">
          {{ deviceName }} · {{ a.deviceId }} →
        </button>
      </section>
    </div>
  </ElDrawer>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.scope { font-size: 11px; color: var(--text-weak); }
.head h2 { font-size: 16px; line-height: 1.45; color: var(--text-primary); }
.close { border: none; background: none; color: var(--text-weak); font-size: 22px; line-height: 1; padding: 0 4px; }
.close:hover { color: var(--text-primary); }
.block h3 { font-size: 12px; color: var(--text-second); font-weight: 500; margin-bottom: 9px; display: flex; align-items: center; gap: 7px; }
.count { font-size: 10px; color: var(--text-weak); }
.rule { font-size: 12px; color: var(--text-primary); background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: 9px; padding: 10px 12px; line-height: 1.6; }
.kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px 16px; margin: 12px 0 0; }
.kv div { display: flex; flex-direction: column; gap: 2px; }
.kv dt { font-size: 10px; color: var(--text-weak); }
.kv dd { margin: 0; font-size: 12.5px; color: var(--text-primary); }
.kv dd.strong { font-weight: 600; color: var(--color-critical); }
.suggestion { font-size: 12.5px; line-height: 1.7; color: var(--text-primary); }
.caution { margin-top: 10px; font-size: 10px; line-height: 1.6; color: var(--text-weak); border-left: 2px solid var(--border-base); padding-left: 10px; }
.records { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 260px; overflow-y: auto; }
.records button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; background: var(--bg-subtle); border: 1px solid transparent; font-size: 11px; text-align: left; }
.records button:hover { background: var(--bg-card-hover); border-color: var(--glass-border); }
.tid { color: var(--color-primary); font-family: ui-monospace, monospace; font-size: 10.5px; }
.status { color: var(--text-second); }
.time { margin-left: auto; color: var(--text-weak); font-size: 10px; }
.dur { color: var(--text-weak); font-size: 10px; min-width: 44px; text-align: right; }
.device-link { border: 1px solid var(--glass-border); background: var(--bg-subtle); color: var(--color-primary); font-size: 12px; padding: 9px 13px; border-radius: 9px; }
.device-link:hover { background: var(--bg-card-hover); }
</style>
