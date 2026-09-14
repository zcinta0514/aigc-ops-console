<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SiteMetrics } from '../../domain/types'
import ChartContainer from '../../components/ChartContainer.vue'
import { decimal, integer, percent } from '../../config/format'

const props = defineProps<{ rows: readonly SiteMetrics[]; loading?: boolean }>()
const emit = defineEmits<{ pick: [siteId: string] }>()

type SortKey = 'participants' | 'sessions' | 'successRate' | 'scanRate' | 'shareRate' | 'averageSeconds' | 'p90Seconds' | 'anomalies'
const sortKey = ref<SortKey>('participants')
const desc = ref(true)

const sorted = computed(() => {
  const list = [...props.rows]
  list.sort((a, b) => {
    const x = a[sortKey.value]
    const y = b[sortKey.value]
    const xn = x === null ? -1 : x
    const yn = y === null ? -1 : y
    return desc.value ? yn - xn : xn - yn
  })
  return list
})

/** 迷你条按全表最大值归一化，用于一眼扫出点位差异。 */
const maxOf = (key: 'participants' | 'successRate' | 'scanRate' | 'shareRate') => {
  const values = props.rows.map(r => r[key]).filter((v): v is number => v !== null)
  return values.length === 0 ? 0 : Math.max(...values)
}

const maxima = computed(() => ({
  participants: maxOf('participants'),
  successRate: maxOf('successRate'),
  scanRate: maxOf('scanRate'),
  shareRate: maxOf('shareRate'),
}))

const barWidth = (value: number | null, max: number) =>
  value === null || max === 0 ? '0%' : `${Math.max(3, (value / max) * 100)}%`

function toggle(key: SortKey) {
  if (sortKey.value === key) desc.value = !desc.value
  else { sortKey.value = key; desc.value = true }
}

const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'participants', label: '参与人数' },
  { key: 'sessions', label: '会话数' },
  { key: 'successRate', label: '生成成功率' },
  { key: 'scanRate', label: '扫码领取率' },
  { key: 'shareRate', label: '分享转化率' },
  { key: 'averageSeconds', label: '平均时长' },
  { key: 'anomalies', label: '异常数' },
]
</script>

<template>
  <ChartContainer
    title="点位对比"
    :hint="'各点位的比率与均值均由其自身原始样本重算，不是对全局值做拆分。参与人数不可跨点位相加——同一模拟匿名 ID 可能在多个点位出现。'"
    :empty="rows.length === 0" :loading="loading"
  >
    <div class="table-wrap">
      <table class="site-table">
        <thead>
          <tr>
            <th class="name-col">点位</th>
            <th v-for="c in columns" :key="c.key" class="num-col"
                :class="{ active: sortKey === c.key }"
                role="button" tabindex="0"
                @click="toggle(c.key)" @keydown.enter="toggle(c.key)">
              {{ c.label }}<span v-if="sortKey === c.key" class="arrow">{{ desc ? '↓' : '↑' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in sorted" :key="r.siteId" @click="emit('pick', r.siteId)">
            <td class="name-col">
              <span class="site-name">{{ r.siteName }}</span>
              <span class="site-id">{{ r.siteId }}</span>
            </td>
            <td class="num-col">
              <span class="value">{{ integer(r.participants) }}</span>
              <span class="bar"><i :style="{ width: barWidth(r.participants, maxima.participants) }" /></span>
            </td>
            <td class="num-col"><span class="value">{{ integer(r.sessions) }}</span></td>
            <td class="num-col">
              <span class="value" :class="{ low: r.successRate !== null && r.successRate < 0.95 }">{{ percent(r.successRate) }}</span>
              <span class="bar"><i :style="{ width: barWidth(r.successRate, maxima.successRate) }" /></span>
            </td>
            <td class="num-col">
              <span class="value" :class="{ low: r.scanRate !== null && r.scanRate < 0.2 }">{{ percent(r.scanRate) }}</span>
              <span class="bar"><i :style="{ width: barWidth(r.scanRate, maxima.scanRate) }" /></span>
            </td>
            <td class="num-col">
              <span class="value" :class="{ low: r.shareRate !== null && r.shareRate < 0.1 }">{{ percent(r.shareRate) }}</span>
              <span class="bar"><i :style="{ width: barWidth(r.shareRate, maxima.shareRate) }" /></span>
            </td>
            <td class="num-col"><span class="value">{{ decimal(r.averageSeconds) }}s</span></td>
            <td class="num-col">
              <span class="value" :class="{ warn: r.anomalies > 0 }">{{ r.anomalies || '—' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ChartContainer>
</template>

<style scoped>
.table-wrap { overflow-x: auto; margin: 0 -4px; }
.site-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.site-table th {
  text-align: right; font-weight: 500; color: var(--text-weak); font-size: 11px;
  padding: 0 8px 9px; white-space: nowrap; border-bottom: 1px solid var(--border-light);
}
.site-table th.num-col { cursor: pointer; user-select: none; transition: color var(--dur-fast) var(--ease-soft); }
.site-table th.num-col:hover, .site-table th.active { color: var(--color-primary); }
.arrow { margin-left: 3px; font-size: 9px; }
.site-table td { padding: 9px 8px; border-bottom: 1px solid var(--border-light); color: var(--text-primary); }
.site-table tbody tr { cursor: pointer; transition: background var(--dur-fast) var(--ease-soft); }
.site-table tbody tr:hover { background: rgba(255, 255, 255, 0.04); }
.site-table tbody tr:last-child td { border-bottom: none; }
.name-col { text-align: left !important; }
.site-name { color: var(--text-primary); }
.site-id { margin-left: 6px; font-size: 10px; color: var(--text-weak); }
.num-col { text-align: right; white-space: nowrap; }
.value { display: block; line-height: 1.4; }
.value.low { color: var(--color-warning); }
.value.warn { color: var(--color-critical); font-weight: 600; }
.bar { display: block; height: 2px; margin-top: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.06); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 2px; background: linear-gradient(90deg, rgba(78,168,255,.45), var(--color-primary)); transition: width var(--dur-slow) var(--ease-out); }
</style>
