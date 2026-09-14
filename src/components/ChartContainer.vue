<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; empty?: boolean; loading?: boolean; error?: string; hint?: string }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <section class="panel chart-panel">
    <header class="panel-head"><div><h2>{{ title }}<ElTooltip v-if="hint" :content="hint" placement="top"><button type="button" class="hint" :aria-label="title + '口径说明'">i</button></ElTooltip></h2><p v-if="subtitle" class="muted">{{ subtitle }}</p></div><slot name="action" /></header>
    <ElSkeleton v-if="loading" animated><template #template><ElSkeletonItem variant="rect" class="chart-skeleton" /></template></ElSkeleton>
    <div v-else-if="error" class="data-state"><span class="state-symbol">!</span><strong>加载失败</strong><p>{{ error }}</p><ElButton size="small" @click="$emit('retry')">重试</ElButton></div>
    <div v-else-if="empty" class="data-state"><span class="state-symbol">—</span><strong>暂无样本</strong><p>试试其他参与日期或点位</p></div>
    <slot v-else />
    <slot name="footer" />
  </section>
</template>
<style scoped>
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }.panel-head h2 { display: flex; align-items: center; gap: 8px; }.panel-head p { margin-top: 4px; font-size: 11px; }.hint { border: 1px solid var(--border-base); color: var(--text-weak); background: none; font-size: 9px; width: 14px; height: 14px; border-radius: 50%; padding: 0; line-height: 12px; }.data-state { height: 236px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-weak); font-size: 12px; }.state-symbol { font-size: 26px; width: 52px; height: 44px; text-align: center; background: var(--bg-subtle); border: 1px solid var(--border-base); border-radius: 6px; }.data-state strong { color: var(--text-second); font-weight: 500; }.chart-skeleton { height: 236px; }
</style>
