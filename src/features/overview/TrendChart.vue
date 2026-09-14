<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { DailyPoint } from '../../domain/types'
import ChartContainer from '../../components/ChartContainer.vue'
import ChartCanvas from '../../components/ChartCanvas.vue'
import { areaGradient, glowLine, palette } from '../../styles/echarts-theme'
import type { ChartClickPayload } from '../../composables/useEChart'

const props = defineProps<{ series: DailyPoint[]; loading?: boolean }>()
const emit = defineEmits<{ pick: [date: string] }>()

const canvas = ref<{ exportPng: (name?: string) => void }>()

/** 点某一天即把全页筛选到该日——从"看到异常"到"看清异常"不该再手动改日期。 */
function onPick(payload: ChartClickPayload) {
  const index = payload.dataIndex
  if (index === undefined) return
  const point = props.series[index]
  if (point) emit('pick', point.date)
}

type MetricKey = 'participants' | 'successRate' | 'averageSeconds'
const metric = ref<MetricKey>('participants')
const tabs: Array<{ key: MetricKey; label: string }> = [
  { key: 'participants', label: '参与人数' },
  { key: 'successRate', label: '生成成功率' },
  { key: 'averageSeconds', label: '生成时长' },
]

const hasSamples = computed(() => props.series.some(p =>
  metric.value === 'participants' ? p.participants > 0 : p[metric.value] !== null))

const option = computed<EChartsCoreOption>(() => {
  const dates = props.series.map(p => p.date.slice(5))
  const base = {
    grid: { left: 8, right: 14, top: 34, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis' as const },
  }

  if (metric.value === 'participants') {
    return {
      ...base,
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: { type: 'value', name: '人', nameTextStyle: { color: palette.weak } },
      series: [{
        name: '参与人数',
        type: 'line',
        smooth: 0.35,
        data: props.series.map(p => (p.participants > 0 ? p.participants : null)),
        // 无样本绘制为缺失点，而不是掉到 0
        connectNulls: false,
        lineStyle: glowLine(palette.primary),
        areaStyle: { color: areaGradient('rgba(78,168,255,0.22)') },
        itemStyle: { color: palette.primary },
        emphasis: { focus: 'series' as const },
      }],
    }
  }

  if (metric.value === 'successRate') {
    return {
      ...base,
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: {
        type: 'value', name: '%', min: 0, max: 100,
        nameTextStyle: { color: palette.weak },
        axisLabel: { formatter: '{value}' },
      },
      series: [{
        name: '生成成功率',
        type: 'line',
        smooth: 0.35,
        data: props.series.map(p => (p.successRate === null ? null : +(p.successRate * 100).toFixed(1))),
        connectNulls: false,
        lineStyle: glowLine(palette.success),
        areaStyle: { color: areaGradient('rgba(47,214,163,0.2)') },
        itemStyle: { color: palette.success },
      }],
    }
  }

  // 时长：均值与 P90 同一单位、同一纵轴，不违反"不同单位不硬塞"的原则。
  // 两条线的间距就是长尾——这正是本看板要让人一眼看见的事。
  return {
    ...base,
    legend: { data: ['平均时长', 'P90 时长'] },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: { type: 'value', name: '秒', nameTextStyle: { color: palette.weak } },
    series: [
      {
        name: '平均时长',
        type: 'line',
        smooth: 0.35,
        data: props.series.map(p => (p.averageSeconds === null ? null : +p.averageSeconds.toFixed(1))),
        connectNulls: false,
        lineStyle: glowLine(palette.primary),
        itemStyle: { color: palette.primary },
      },
      {
        name: 'P90 时长',
        type: 'line',
        smooth: 0.35,
        data: props.series.map(p => (p.p90Seconds === null ? null : +p.p90Seconds.toFixed(1))),
        connectNulls: false,
        lineStyle: { ...glowLine(palette.warning), type: 'dashed' },
        itemStyle: { color: palette.warning },
        areaStyle: { color: areaGradient('rgba(242,183,92,0.12)') },
      },
    ],
  }
})

const hint = computed(() => metric.value === 'averageSeconds'
  ? '均值与 P90 使用同一批成功任务样本，单位为秒。两条线的间距反映长尾：均值平稳而 P90 抬升，说明是尾部恶化而非整体变慢。'
  : metric.value === 'successRate'
    ? '成功任务数 ÷ 已结束任务数。无样本的日期绘制为缺口，不按 0 处理。'
    : '按会话开始时间的北京自然日归属的参与人数；同一人跨日重复参与会在各日分别计入。')
</script>

<template>
  <ChartContainer
    title="趋势" :hint="hint" :empty="!hasSamples" :loading="loading"
    :subtitle="metric === 'averageSeconds' ? '均值与 P90 同轴对比，间距即长尾' : undefined"
  >
    <template #action>
      <div class="actions">
      <div class="seg">
        <button
          v-for="t in tabs" :key="t.key" type="button"
          :class="{ active: metric === t.key }" @click="metric = t.key"
        >{{ t.label }}</button>
      </div>
        <button type="button" class="ghost" title="导出当前图表为 PNG"
                @click="canvas?.exportPng('趋势图.png')">导出</button>
      </div>
    </template>
    <ChartCanvas ref="canvas" :option="option" :height="236" @pick="onPick" />
  </ChartContainer>
</template>

<style scoped>
.seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: var(--bg-subtle); border: 1px solid var(--border-light); }
.seg button {
  border: none; background: none; color: var(--text-weak);
  font-size: 11px; padding: 5px 11px; border-radius: 7px;
  transition: color var(--dur-fast) var(--ease-soft), background var(--dur-fast) var(--ease-soft);
}
.seg button:hover { color: var(--text-second); }
.seg button.active { color: var(--color-primary); background: var(--bg-blue); }
.actions { display: inline-flex; align-items: center; gap: 8px; }
.ghost {
  border: 1px solid var(--border-light); background: var(--bg-subtle); color: var(--text-weak);
  font-size: 11px; padding: 5px 10px; border-radius: 8px;
  transition: all var(--dur-fast) var(--ease-soft);
}
.ghost:hover { color: var(--text-primary); border-color: var(--glass-border-strong); }
</style>
