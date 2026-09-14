<script setup lang="ts">
defineProps<{ title: string; value: string; unit?: string; hint: string; icon: string; subtitle?: string; accent?: boolean; clickable?: boolean; empty?: boolean }>()
defineEmits<{ open: [] }>()
</script>
<template>
  <ElCard class="metric-card" shadow="never" :class="{ accent }" :body-style="{ padding: '16px' }">
    <div class="metric-top"><span>{{ title }}</span><ElTooltip :content="hint" placement="top"><button type="button" class="metric-hint" :aria-label="title + '口径说明'">{{ icon }}</button></ElTooltip></div>
    <button v-if="clickable" type="button" class="metric-value metric-button" :aria-label="'查看' + title + '明细'" @click="$emit('open')">{{ value }}<small>{{ unit }}</small><span class="metric-arrow">↗</span></button>
    <div v-else class="metric-value">{{ value }}<small>{{ unit }}</small></div>
    <p v-if="empty" class="metric-caption">暂无样本</p><p v-else-if="subtitle" class="metric-caption">{{ subtitle }}</p>
    <div class="metric-bottom"><slot /></div>
  </ElCard>
</template>
<style scoped>
.metric-card { border-color: var(--border-base); border-radius: var(--radius-card); min-width: 0; position: relative; }.metric-card.accent { border-top: 2px solid var(--color-primary); }.metric-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; color: var(--text-second); font-size: 12px; white-space: nowrap; }.metric-hint { border: none; border-radius: 4px; padding: 0; width: 23px; height: 23px; color: var(--color-neutral); background: var(--bg-subtle); font-size: 12px; }.accent .metric-hint { color: var(--color-primary); background: var(--bg-blue); }.metric-value { font-size: var(--fs-metric-xl); font-weight: 600; margin-top: 13px; line-height: 1.15; letter-spacing: -.8px; color: var(--text-primary); white-space: nowrap; }.metric-value small { font-size: 11px; font-weight: 400; color: var(--text-weak); letter-spacing: 0; margin-left: 4px; }.metric-caption { font-size: 10px; color: var(--text-weak); margin-top: 8px; min-height: 15px; white-space: nowrap; }.metric-bottom { font-size: 10px; color: var(--text-second); border-top: 1px solid var(--border-light); margin-top: 13px; padding-top: 10px; min-height: 26px; }.metric-button { display: block; border: none; background: none; padding: 0; text-align: left; width: 100%; }.metric-button:hover { color: var(--color-primary); }.metric-arrow { float: right; font-size: 14px; color: var(--text-weak); margin-top: 7px; }
</style>
