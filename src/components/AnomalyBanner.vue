<script setup lang="ts">
import { computed } from 'vue'
import type { Anomaly } from '../domain/types'

const props = defineProps<{ anomalies: readonly Anomaly[] }>()
const emit = defineEmits<{ open: [] }>()

const critical = computed(() => props.anomalies.filter(a => a.severity === 'critical'))
const warning = computed(() => props.anomalies.filter(a => a.severity === 'warning'))

/**
 * 严重异常才用高权重的红色横幅；只有警告时降为弱提示；没有异常则完全不占位。
 * 首屏"这看板有没有用"的第一印象由它决定，所以严重态必须足够醒目。
 */
const tone = computed<'critical' | 'warning' | 'none'>(() => {
  if (critical.value.length > 0) return 'critical'
  if (warning.value.length > 0) return 'warning'
  return 'none'
})

const headline = computed(() => tone.value === 'critical'
  ? `当前范围发现 ${critical.value.length} 个严重异常`
  : `当前范围发现 ${warning.value.length} 个警告`)

const samples = computed(() => (tone.value === 'critical' ? critical.value : warning.value).slice(0, 3))
</script>

<template>
  <section v-if="tone !== 'none'" class="banner" :class="tone" role="status">
    <span class="mark" aria-hidden="true">{{ tone === 'critical' ? '■' : '▲' }}</span>
    <div class="body">
      <strong>{{ headline }}</strong>
      <ul>
        <li v-for="a in samples" :key="a.id">{{ a.title }}</li>
      </ul>
    </div>
    <button type="button" class="more" @click="emit('open')">查看详情 →</button>
  </section>
</template>

<style scoped>
.banner {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; border-radius: var(--radius-card);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  animation: fadeUp var(--dur-slow) var(--ease-out) both;
}
.banner.critical {
  background: linear-gradient(90deg, rgba(255, 107, 122, 0.16), rgba(255, 107, 122, 0.05));
  border-color: var(--border-critical);
  box-shadow: var(--glow-critical), var(--glass-inset);
}
.banner.warning {
  background: linear-gradient(90deg, rgba(242, 183, 92, 0.1), rgba(242, 183, 92, 0.03));
  border-color: var(--border-warning);
  box-shadow: var(--glass-inset);
}
.mark { font-size: 13px; color: var(--color-critical); flex-shrink: 0; }
.warning .mark { color: var(--color-warning); }
.body { flex: 1; min-width: 0; }
.body strong { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.body ul { list-style: none; margin: 5px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
.body li { font-size: 11px; color: var(--text-second); }
.body li::before { content: "·"; margin-right: 6px; color: var(--text-weak); }
.more {
  flex-shrink: 0; border: 1px solid var(--glass-border-strong); background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary); font-size: 12px; padding: 6px 13px; border-radius: 9px;
  transition: background var(--dur-fast) var(--ease-soft), transform var(--dur-fast) var(--ease-soft);
}
.more:hover { background: rgba(255, 255, 255, 0.12); transform: translateX(2px); }
</style>
