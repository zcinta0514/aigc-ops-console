<script setup lang="ts">
import { ref } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import { useEChart } from '../composables/useEChart'
const props = defineProps<{ option: EChartsCoreOption; height?: number }>()
const container = ref<HTMLElement>()
useEChart(container, () => props.option)
</script>
<template><div ref="container" class="chart-canvas" :style="{ height: (height ?? 236) + 'px' }" /></template>
<style scoped>.chart-canvas { width: 100%; min-width: 0; }</style>
