<script setup lang="ts">
import { ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import { useEChart, type ChartClickPayload } from '../composables/useEChart'
import { exportChartPng } from '../composables/useExport'

const props = defineProps<{ option: EChartsCoreOption; height?: number; fileName?: string }>()
const emit = defineEmits<{ pick: [payload: ChartClickPayload] }>()

const container = ref<HTMLElement>()
const { chart } = useEChart(container, () => props.option, payload => emit('pick', payload))

/** 供父组件导出当前图表；未指定文件名时按容器尺寸命名，避免浏览器下载时重名覆盖。 */
defineExpose({
  exportPng: (name?: string) => exportChartPng(chart.value, name ?? props.fileName ?? 'chart.png'),
})
</script>

<template>
  <div ref="container" class="chart-canvas" :style="{ height: (height ?? 236) + 'px' }" />
</template>

<style scoped>.chart-canvas { width: 100%; min-width: 0; }</style>
