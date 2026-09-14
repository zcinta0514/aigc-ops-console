<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'success' | 'warning' | 'critical' | 'unknown' | 'neutral'; label: string }>(), { tone: 'neutral' })
const symbols = { success: '●', warning: '▲', critical: '■', unknown: '○', neutral: '○' }
</script>
<template><span class="status-badge" :class="tone"><span aria-hidden="true">{{ symbols[tone] }}</span>{{ label }}</span></template>
<style scoped>
.status-badge { display: inline-flex; gap: 5px; align-items: center; padding: 2px 7px; font-size: 11px; white-space: nowrap; border-radius: var(--radius-tag); background: var(--bg-subtle); color: var(--color-neutral); }
.status-badge > span { font-size: 8px; }.success { color: var(--color-success); background: var(--bg-success); }.warning { color: var(--text-second); background: var(--bg-warning); }.warning > span { color: var(--color-warning); }.critical { color: var(--color-critical); background: var(--bg-critical); }.unknown { color: var(--text-second); }.unknown > span { color: var(--color-unknown); }
</style>
