<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Site } from '../domain/types'
import { DEMO } from '../config/demo'
import { addDays } from '../domain/time'

const props = defineProps<{
  start: string
  end: string
  siteIds: string[]
  sites: readonly Site[]
  invalid: readonly string[]
}>()
const emit = defineEmits<{ range: [start: string, end: string]; sites: [siteIds: string[]]; reset: [] }>()

/** 只有在两端都选好时才提交，避免用户只点了一个日期就触发一次错误计算。 */
const localRange = ref<[string, string]>([props.start, props.end])
watch(() => [props.start, props.end] as const, ([s, e]) => { localRange.value = [s, e] })

const pickerValue = computed({
  get: () => localRange.value,
  set: (value: [string, string] | null) => {
    if (!value || value.length !== 2 || !value[0] || !value[1]) return
    localRange.value = value
    emit('range', value[0], value[1])
  },
})

const shortcuts = [
  { text: '最近 7 天', value: () => [addDays(DEMO.end, -6), DEMO.end] as [string, string] },
  { text: '最近 30 天', value: () => [DEMO.fullStart, DEMO.end] as [string, string] },
]

const siteModel = computed({
  get: () => props.siteIds,
  set: (value: string[]) => emit('sites', value),
})
</script>

<template>
  <div class="filters">
    <ElDatePicker
      v-model="pickerValue" type="daterange" value-format="YYYY-MM-DD"
      range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
      :shortcuts="shortcuts" :clearable="false" size="default"
    />
    <ElSelect
      v-model="siteModel" multiple collapse-tags collapse-tags-tooltip
      placeholder="全部点位" class="site-select" size="default"
      :multiple-limit="sites.length"
    >
      <ElOption v-for="s in sites" :key="s.id" :label="`${s.name}（${s.id}）`" :value="s.id" />
    </ElSelect>
    <ElButton size="default" @click="emit('reset')">重置</ElButton>
    <ElTooltip placement="bottom" content="业务统计按会话开始时间的北京自然日归属；设备状态为快照，不随日期变化。">
      <span class="filter-note" tabindex="0" role="note">归属与快照口径</span>
    </ElTooltip>
  </div>
  <p v-if="invalid.length" class="filter-warning" role="alert">
    <span aria-hidden="true">▲</span> {{ invalid.join('；') }}，已回退到默认范围。
  </p>
</template>

<style scoped>
.filters { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.site-select { width: 220px; }
.filter-note { font-size: 11px; color: var(--text-weak); border-bottom: 1px dashed var(--border-base); cursor: help; }
.filter-warning { margin-top: 10px; font-size: 12px; color: var(--color-warning); display: flex; gap: 6px; align-items: center; }
@media (max-width: 1366px) { .site-select { width: 180px; } }
</style>
