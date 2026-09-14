<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Anomaly, Severity } from '../../domain/types'
import StatusBadge from '../../components/StatusBadge.vue'
import { exportCsv } from '../../composables/useExport'

const props = defineProps<{ anomalies: readonly Anomaly[]; siteNames: ReadonlyMap<string, string>; deviceNames: ReadonlyMap<string, string>; limit?: number }>()
const emit = defineEmits<{ open: [anomaly: Anomaly] }>()

const severityFilter = ref<Severity | 'all'>('all')

const TONE: Record<Severity, 'critical' | 'warning' | 'neutral'> = { critical: 'critical', warning: 'warning', info: 'neutral' }
const LABEL: Record<Severity, string> = { critical: '严重', warning: '警告', info: '提示' }
const TYPE_LABEL: Record<Anomaly['type'], string> = {
  generation_success: '生成成功率',
  generation_duration: '生成耗时',
  scan_conversion: '扫码领取',
  share_conversion: '分享转化',
  moderation_backlog: '审核积压',
  device_offline: '设备离线',
  device_unknown: '设备未知',
}

const filtered = computed(() =>
  props.anomalies.filter(a => severityFilter.value === 'all' || a.severity === severityFilter.value))

const shown = computed(() => (props.limit ? filtered.value.slice(0, props.limit) : filtered.value))

const counts = computed(() => ({
  all: props.anomalies.length,
  critical: props.anomalies.filter(a => a.severity === 'critical').length,
  warning: props.anomalies.filter(a => a.severity === 'warning').length,
  info: props.anomalies.filter(a => a.severity === 'info').length,
}))

/**
 * 观察状态必须区分"历史统计异常"与"仍未恢复/仍在等待"，
 * 不能一律写成"已恢复"或"处理中"——那会凭空造出不存在的状态流转。
 */
function observedState(a: Anomaly): { label: string; tone: 'success' | 'warning' | 'critical' | 'unknown' | 'neutral' } {
  if (a.type === 'device_offline') {
    return a.restoredAt === null
      ? { label: '离线未恢复', tone: 'critical' }
      : { label: '已恢复', tone: 'success' }
  }
  if (a.type === 'device_unknown') return { label: '未上报', tone: 'unknown' }
  if (a.type === 'moderation_backlog') return { label: '仍在等待', tone: 'warning' }
  const isPartialDay = a.bucketDate === '2026-08-30'
  return isPartialDay
    ? { label: '未完结日', tone: 'neutral' }
    : { label: '历史日', tone: 'neutral' }
}

/** 导出当前筛选后的异常清单，含规则与证据字段，便于离线核对。 */
function exportRows() {
  exportCsv(
    '异常清单.csv',
    ['异常ID', '类型', '标题', '严重程度', '点位', '设备', '业务日期', '观察状态', '触发规则', '实际值', '阈值', '分子', '分母', '样本量', '建议排查'],
    filtered.value.map(a => [
      a.id, TYPE_LABEL[a.type], a.title, LABEL[a.severity],
      props.siteNames.get(a.siteId) ?? a.siteId,
      a.deviceId ? (props.deviceNames.get(a.deviceId) ?? a.deviceId) : null,
      a.bucketDate ?? a.offlineAt ?? null,
      observedState(a).label,
      a.rule, a.actual, a.threshold, a.numerator, a.denominator, a.sampleSize, a.suggestion,
    ]),
  )
}

const scope = (a: Anomaly) => {
  if (a.deviceId) return props.deviceNames.get(a.deviceId) ?? a.deviceId
  return props.siteNames.get(a.siteId) ?? a.siteId
}
</script>

<template>
  <div class="anomaly-table">
    <div class="filters" role="group" aria-label="按严重程度筛选">
      <button v-for="f in ([['all','全部'],['critical','严重'],['warning','警告'],['info','提示']] as const)" :key="f[0]"
              type="button" :class="{ active: severityFilter === f[0] }" @click="severityFilter = f[0]">
        {{ f[1] }}<span class="n">{{ counts[f[0]] }}</span>
      </button>
      <button v-if="filtered.length" type="button" class="ghost export" @click="exportRows">导出 CSV</button>
    </div>

    <div v-if="shown.length === 0" class="empty">
      <span aria-hidden="true">—</span>
      <p>当前范围没有符合条件的异常</p>
    </div>

    <ul v-else class="list">
      <li v-for="a in shown" :key="a.id">
        <button type="button" class="row" :class="a.severity" @click="emit('open', a)">
          <span class="sev" aria-hidden="true">{{ a.severity === 'critical' ? '■' : a.severity === 'warning' ? '▲' : '○' }}</span>
          <span class="main">
            <span class="title">{{ a.title }}</span>
            <span class="meta">
              <span class="type">{{ TYPE_LABEL[a.type] }}</span>
              <span>{{ scope(a) }}</span>
              <span v-if="a.bucketDate">业务日期 {{ a.bucketDate }}</span>
              <span v-if="a.offlineAt">离线自 {{ a.offlineAt.slice(5, 16).replace('T', ' ') }}</span>
            </span>
          </span>
          <span class="right">
            <StatusBadge :tone="observedState(a).tone" :label="observedState(a).label" />
            <StatusBadge :tone="TONE[a.severity]" :label="LABEL[a.severity]" />
            <span class="samples">{{ a.sampleSize > 0 ? `样本 ${a.sampleSize}` : `${a.actual} 分钟` }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-if="limit && filtered.length > limit" class="more-note">另有 {{ filtered.length - limit }} 条，进入异常与明细查看全部。</p>
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 5px; margin-bottom: 12px; align-items: center; }
.export { margin-left: auto; }
.ghost {
  border: 1px solid var(--border-light); background: var(--bg-subtle); color: var(--text-weak);
  font-size: 11px; padding: 4px 10px; border-radius: 8px;
  transition: all var(--dur-fast) var(--ease-soft);
}
.ghost:hover { color: var(--text-primary); border-color: var(--glass-border-strong); }
.filters button {
  border: 1px solid var(--border-light); background: var(--bg-subtle); color: var(--text-weak);
  font-size: 11px; padding: 4px 10px; border-radius: 8px; display: inline-flex; gap: 5px; align-items: center;
  transition: all var(--dur-fast) var(--ease-soft);
}
.filters button:hover { color: var(--text-second); border-color: var(--glass-border); }
.filters button.active { color: var(--color-primary); background: var(--bg-blue); border-color: rgba(78,168,255,.28); }
.n { font-size: 9px; opacity: .75; }

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.row {
  width: 100%; display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 10px; text-align: left;
  background: var(--bg-subtle); border: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease-soft), border-color var(--dur-fast) var(--ease-soft), transform var(--dur-fast) var(--ease-out);
}
.row:hover { background: var(--bg-card-hover); border-color: var(--glass-border); transform: translateX(2px); }
.row.critical { border-left: 2px solid var(--color-critical); }
.row.warning { border-left: 2px solid var(--color-warning); }
.row.info { border-left: 2px solid var(--color-unknown); }
.sev { font-size: 9px; color: var(--color-unknown); flex-shrink: 0; }
.row.critical .sev { color: var(--color-critical); }
.row.warning .sev { color: var(--color-warning); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.title { font-size: 12.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 10px; color: var(--text-weak); }
.type { color: var(--text-second); }
.right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.samples { font-size: 10px; color: var(--text-weak); white-space: nowrap; min-width: 56px; text-align: right; }

.empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 0; color: var(--text-weak); font-size: 12px; }
.empty span { font-size: 22px; }
.more-note { margin-top: 10px; font-size: 11px; color: var(--text-weak); text-align: center; }
</style>
