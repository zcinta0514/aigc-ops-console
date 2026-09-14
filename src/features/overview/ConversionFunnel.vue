<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { FunnelMetrics } from '../../domain/types'
import ChartContainer from '../../components/ChartContainer.vue'
import ChartCanvas from '../../components/ChartCanvas.vue'
import { palette } from '../../styles/echarts-theme'
import { integer, percent } from '../../config/format'

const props = defineProps<{ funnel: FunnelMetrics; loading?: boolean }>()

const stages = computed(() => [
  { name: '开始参与', value: props.funnel.started },
  { name: '提交生成', value: props.funnel.submitted },
  { name: '生成成功', value: props.funnel.succeeded },
  { name: '结果可领取', value: props.funnel.claimable },
])

const empty = computed(() => props.funnel.started === 0)

const step = (a: number, b: number) => (a === 0 ? null : b / a)

/** 前四段逐级收窄，用真正的漏斗图表达。 */
const option = computed<EChartsCoreOption>(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: { name: string; value: number }) => `${p.name}<br/><b>${integer(p.value)}</b> 个会话`,
  },
  series: [{
    type: 'funnel',
    left: 4, right: 4, top: 6, bottom: 6,
    sort: 'none',
    gap: 3,
    minSize: '34%',
    label: {
      position: 'inside',
      color: '#0A0E17',
      fontSize: 11,
      fontWeight: 600,
      formatter: (p: { name: string; value: number }) => `${p.name}  ${integer(p.value)}`,
    },
    itemStyle: { borderWidth: 0, opacity: 0.92 },
    data: stages.value.map((s, i) => ({
      ...s,
      itemStyle: { color: [palette.primary, '#5FB4FF', palette.violet, palette.success][i] },
    })),
  }],
}))

/** 第 5、6 段是自"结果可领取"分出的并列分支，二者互不包含。 */
const branches = computed(() => [
  { key: 'scan', label: '扫码领取', value: props.funnel.scanned, color: palette.success, rate: step(props.funnel.claimable, props.funnel.scanned) },
  { key: 'share', label: '分享传播', value: props.funnel.shared, color: palette.violet, rate: step(props.funnel.claimable, props.funnel.shared) },
])

const hint = '前四段逐级收窄。扫码与分享是从「结果可领取」分出的两个并列分支，互不包含——用户可能直接分享而不扫码，因此分享段可以大于扫码段，这不是数据错误。'
</script>

<template>
  <ChartContainer title="会话转化漏斗" :hint="hint" :empty="empty" :loading="loading" subtitle="同一批参与会话，逐级口径一致">
    <ChartCanvas :option="option" :height="150" />
    <div class="branches">
      <div v-for="b in branches" :key="b.key" class="branch">
        <span class="branch-dot" :style="{ background: b.color, boxShadow: `0 0 8px ${b.color}` }" />
        <span class="branch-label">{{ b.label }}</span>
        <strong>{{ integer(b.value) }}</strong>
        <span class="branch-rate">{{ percent(b.rate) }}</span>
      </div>
    </div>
    <p class="branch-note">↳ 自「结果可领取」分叉，非逐级收窄</p>
    <template #footer>
      <dl class="steps">
        <div><dt>参与→提交</dt><dd>{{ percent(step(funnel.started, funnel.submitted)) }}</dd></div>
        <div><dt>提交→成功</dt><dd>{{ percent(step(funnel.submitted, funnel.succeeded)) }}</dd></div>
        <div><dt>成功→可领取</dt><dd>{{ percent(step(funnel.succeeded, funnel.claimable)) }}</dd></div>
      </dl>
    </template>
  </ChartContainer>
</template>

<style scoped>
.branches { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.branch {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  padding: 9px 10px; border-radius: 10px;
  background: var(--bg-subtle); border: 1px solid var(--border-light);
  transition: background var(--dur-fast) var(--ease-soft), border-color var(--dur-fast) var(--ease-soft);
}
.branch:hover { background: var(--bg-card-hover); border-color: var(--glass-border); }
.branch-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
/* 窄卡里中文标签会被逐字折行，必须禁止换行并让数值优先占位 */
.branch-label { font-size: 11px; color: var(--text-second); white-space: nowrap; }
.branch strong { font-size: 15px; font-weight: 600; margin-left: auto; color: var(--text-primary); }
.branch-rate { font-size: 10px; color: var(--text-weak); white-space: nowrap; }
.branch-note { font-size: 10px; color: var(--text-weak); margin-top: 8px; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; border-top: 1px solid var(--border-light); margin-top: 12px; padding-top: 10px; }
.steps div { display: flex; flex-direction: column; gap: 2px; }
.steps dt { font-size: 10px; color: var(--text-weak); }
.steps dd { margin: 0; font-size: 13px; font-weight: 600; color: var(--text-primary); }
</style>
