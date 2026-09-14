<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { OverviewMetrics } from '../../domain/types'
import ChartContainer from '../../components/ChartContainer.vue'
import ChartCanvas from '../../components/ChartCanvas.vue'
import { palette } from '../../styles/echarts-theme'
import { integer, percent } from '../../config/format'

const props = defineProps<{ metrics: OverviewMetrics; loading?: boolean }>()
const emit = defineEmits<{ open: [] }>()

const rows = computed(() => [
  { key: 'approved', label: '已通过', value: props.metrics.approved, color: palette.success },
  { key: 'pending', label: '待审核', value: props.metrics.pending, color: palette.warning },
  { key: 'rejected', label: '已拒绝', value: props.metrics.rejected, color: palette.critical },
])

const total = computed(() => rows.value.reduce((s, r) => s + r.value, 0))
const empty = computed(() => total.value === 0)

const option = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}<br/><b>${integer(p.value)}</b> 条` },
  series: [{
    type: 'pie',
    radius: ['62%', '86%'],
    center: ['50%', '50%'],
    avoidLabelOverlap: true,
    itemStyle: { borderColor: 'transparent', borderWidth: 2 },
    label: { show: false },
    data: rows.value.filter(r => r.value > 0).map(r => ({ name: r.label, value: r.value, itemStyle: { color: r.color } })),
  }],
}))
</script>

<template>
  <ChartContainer
    title="审核分布"
    :hint="'统计对象是生成成功的任务。拒绝率 = 已拒绝 ÷ (已通过 + 已拒绝)，待审不参与分母。'"
    :empty="empty" :loading="loading"
  >
    <template #action>
      <button type="button" class="link" @click="emit('open')">查看待审 →</button>
    </template>
    <div class="body">
      <div class="donut">
        <ChartCanvas :option="option" :height="118" />
        <div class="center">
          <strong>{{ integer(total) }}</strong>
          <span>成功任务</span>
        </div>
      </div>
      <ul class="rows">
        <li v-for="r in rows" :key="r.key">
          <span class="dot" :style="{ background: r.color, boxShadow: `0 0 8px ${r.color}` }" />
          <span class="label">{{ r.label }}</span>
          <strong>{{ integer(r.value) }}</strong>
        </li>
        <li class="rate">
          <span class="label">拒绝率</span>
          <strong>{{ percent(metrics.rejectionRate) }}</strong>
        </li>
      </ul>
    </div>
  </ChartContainer>
</template>

<style scoped>
.link { border: none; background: none; color: var(--color-primary); font-size: 11px; padding: 2px 0; }
.link:hover { text-decoration: underline; }
.body { display: grid; grid-template-columns: 128px 1fr; gap: 14px; align-items: center; }
.donut { position: relative; }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; pointer-events: none; }
.center strong { font-size: 19px; font-weight: 600; color: var(--text-primary); }
.center span { font-size: 9px; color: var(--text-weak); }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
.rows li { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.label { color: var(--text-second); }
.rows strong { margin-left: auto; font-weight: 600; color: var(--text-primary); }
.rate { border-top: 1px solid var(--border-light); padding-top: 9px; }
</style>
