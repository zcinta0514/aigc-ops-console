<script setup lang="ts">
import { computed } from 'vue'
import type { DeviceSnapshot, OverviewMetrics } from '../../domain/types'
import MetricCard from '../../components/MetricCard.vue'
import { decimal, fraction, integer, percent } from '../../config/format'

const props = defineProps<{
  metrics: OverviewMetrics
  devices: DeviceSnapshot
  asOf: string
  /** 时间回放位置，形如 14:30。仅用于在卡片上标明当前不是快照状态。 */
  replayLabel?: string
}>()
const emit = defineEmits<{ open: [tab: string, status?: string] }>()

const snapshotLabel = computed(() => props.asOf.slice(0, 16).replace('T', ' '))

/** 均值与 P90 差距超过两倍时提示长尾——这正是本看板最想让人看见的一件事。 */
const longTail = computed(() => {
  const { averageSeconds: avg, p90Seconds: p } = props.metrics
  return avg !== null && p !== null && avg > 0 && p / avg >= 2
})
</script>

<template>
  <div class="metric-grid">
    <MetricCard
      title="参与人数" :value="integer(metrics.participants)" unit="人"
      icon="i" accent
      :hint="'按模拟匿名 participantId 在所选范围内重新去重，不等于各点位人数或各日人数相加。'"
      :subtitle="replayLabel ? `截至 ${replayLabel} · ${integer(metrics.sessions)} 次参与会话` : `${integer(metrics.sessions)} 次参与会话`"
    />

    <MetricCard
      title="生成成功率" :value="percent(metrics.successRate)" unit=""
      icon="i"
      :hint="'成功任务数 ÷ 已结束任务数。已结束含成功、失败、超时；排队中与生成中不计入分母。'"
      :subtitle="fraction(metrics.success, metrics.ended)"
      :empty="metrics.ended === 0"
    >
      <template #default>
        <span>排队中 {{ integer(metrics.queued) }} · 生成中 {{ integer(metrics.running) }}</span>
      </template>
    </MetricCard>

    <!-- 扫码与分享分列：两者业务含义不同，合并会掩盖只发生其中一个的异常 -->
    <ElCard class="metric-card" shadow="never" :body-style="{ padding: '16px' }">
      <div class="metric-top">
        <span>转化</span>
        <ElTooltip
          placement="top"
          content="扫码领取率与分享转化率。分子是发生该行为的会话数，分母同为「可领取会话数」——即生成成功、审核通过且已展示的会话。两者互不包含，可以只发生其一。"
        >
          <button type="button" class="metric-hint" aria-label="转化口径说明">i</button>
        </ElTooltip>
      </div>
      <div class="dual">
        <div class="dual-row">
          <span class="dual-label">扫码领取</span>
          <strong :class="{ blank: metrics.scanRate === null }">{{ percent(metrics.scanRate) }}</strong>
          <span class="dual-frac">{{ fraction(metrics.scanned, metrics.claimable) }}</span>
        </div>
        <div class="dual-row">
          <span class="dual-label">分享转化</span>
          <strong :class="{ blank: metrics.shareRate === null }">{{ percent(metrics.shareRate) }}</strong>
          <span class="dual-frac">{{ fraction(metrics.shared, metrics.claimable) }}</span>
        </div>
      </div>
    </ElCard>

    <MetricCard
      title="平均生成时长" :value="decimal(metrics.averageSeconds)" unit="s"
      icon="i"
      :hint="'成功任务的「提交至完成」时长算术平均，含排队与重试等待，不含审核。下方 P90 使用同一批样本。'"
      :empty="metrics.averageSeconds === null"
    >
      <template #default>
        <span :class="{ 'text-warning': longTail }">
          P90 {{ decimal(metrics.p90Seconds) }} s{{ longTail ? ' · 长尾偏长' : '' }}
        </span>
      </template>
    </MetricCard>

    <MetricCard
      title="待审核" :value="integer(metrics.pending)" unit="条"
      icon="i" clickable
      :hint="'生成成功但尚未完成审核的任务数。下方为等待超过 10 分钟的积压量，从生成完成时间算至快照。'"
      :empty="metrics.success === 0"
      @open="emit('open', 'moderation', 'pending')"
    >
      <template #default>
        <span :class="{ 'text-warning': metrics.overduePending > 0 }">
          超过 10 分钟 {{ integer(metrics.overduePending) }} 条
        </span>
      </template>
    </MetricCard>

    <MetricCard
      title="在线设备" :value="integer(devices.online)" unit="台"
      icon="i"
      :hint="'截至快照的设备状态，只随点位筛选变化，不受参与日期影响。心跳为空表示从未上报，属未知而非已确认离线。'"
      :subtitle="`离线 ${integer(devices.offline)} · 未知 ${integer(devices.unknown)}`"
      :empty="devices.online + devices.offline + devices.unknown === 0"
    >
      <template #default>
        <span>快照 {{ snapshotLabel }}<template v-if="replayLabel"> · 不参与回放</template></span>
      </template>
    </MetricCard>
  </div>
</template>

<style scoped>
.metric-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-4); }
.metric-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; color: var(--text-second); font-size: 12px; white-space: nowrap; }
.metric-hint { border: none; border-radius: 4px; padding: 0; width: 23px; height: 23px; color: var(--color-neutral); background: var(--bg-subtle); font-size: 12px; }
.metric-card { border-color: var(--border-base); border-radius: var(--radius-card); min-width: 0; }
.dual { margin-top: 13px; display: grid; gap: 9px; }
.dual-row { display: flex; align-items: baseline; gap: 6px; }
.dual-label { font-size: 10px; color: var(--text-weak); width: 52px; flex-shrink: 0; }
.dual-row strong { font-size: 19px; font-weight: 600; letter-spacing: -.5px; color: var(--text-primary); }
.dual-row strong.blank { color: var(--text-weak); font-weight: 400; }
.dual-frac { font-size: 9px; color: var(--text-weak); margin-left: auto; white-space: nowrap; }
@media (max-width: 1366px) {
  .metric-grid { gap: var(--space-3); }
  .dual-label { width: 46px; }
  .dual-row strong { font-size: 17px; }
}
</style>
