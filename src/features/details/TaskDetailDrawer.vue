<script setup lang="ts">
import { computed } from 'vue'
import type { Device, GenerationTask, ScanEvent, Session, ShareEvent, Site } from '../../domain/types'
import StatusBadge from '../../components/StatusBadge.vue'
import { decimal, moderationLabels, taskLabels, timestamp } from '../../config/format'

const props = defineProps<{
  task: GenerationTask | null
  session?: Session
  site?: Site
  device?: Device
  scans: readonly ScanEvent[]
  shares: readonly ShareEvent[]
}>()
const emit = defineEmits<{ close: []; openDevice: [id: string] }>()

const open = computed(() => props.task !== null)
const t = computed(() => props.task)

const DURATION = computed(() => {
  const task = props.task
  if (!task || task.finishedAt === null) return null
  return (Date.parse(task.finishedAt) - Date.parse(task.submittedAt)) / 1000
})

const TASK_TONE = { success: 'success', failed: 'critical', timeout: 'critical', running: 'warning', queued: 'neutral' } as const
const MOD_TONE = { approved: 'success', rejected: 'critical', pending: 'warning', not_applicable: 'neutral' } as const
</script>

<template>
  <ElDrawer :model-value="open" size="480px" :with-header="false" @close="emit('close')">
    <div v-if="t" class="drawer">
      <header class="head">
        <div>
          <div class="eyebrow">
            <StatusBadge :tone="TASK_TONE[t.status]" :label="taskLabels[t.status]" />
            <span class="tid">{{ t.id }}</span>
          </div>
          <h2>生成任务详情</h2>
        </div>
        <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <section class="block">
        <h3>任务</h3>
        <dl class="kv">
          <div><dt>提交时间</dt><dd>{{ timestamp(t.submittedAt) }}</dd></div>
          <div><dt>完成时间</dt><dd>{{ t.finishedAt ? timestamp(t.finishedAt) : '快照前未结束' }}</dd></div>
          <div><dt>完成耗时</dt><dd class="strong">{{ DURATION === null ? '—' : decimal(DURATION) + ' 秒' }}</dd></div>
          <div><dt>尝试次数</dt><dd>{{ t.attemptCount }}{{ t.attemptCount >= 2 ? '（重试后成功，仍计一个任务）' : '' }}</dd></div>
          <div><dt>模板</dt><dd>{{ t.templateId }}</dd></div>
          <div><dt>错误码</dt><dd>{{ t.errorCode ?? '无' }}</dd></div>
        </dl>
        <p v-if="DURATION !== null" class="note">耗时口径：提交至完成，含排队与重试等待，不含审核。</p>
      </section>

      <section class="block">
        <h3>审核与展示</h3>
        <dl class="kv">
          <div><dt>审核状态</dt><dd><StatusBadge :tone="MOD_TONE[t.moderationStatus]" :label="moderationLabels[t.moderationStatus]" /></dd></div>
          <div><dt>审核完成</dt><dd>{{ timestamp(t.moderatedAt) }}</dd></div>
          <div><dt>拒绝原因</dt><dd>{{ t.moderationReasonCode ?? '—' }}</dd></div>
          <div><dt>展示时间</dt><dd>{{ t.displayedAt ? timestamp(t.displayedAt) : '尚未展示' }}</dd></div>
        </dl>
        <p v-if="t.moderationStatus === 'pending'" class="note warn">仍在待审，因此结果尚未展示，也不存在合法的扫码或分享记录。</p>
        <p v-else-if="t.moderationStatus === 'approved' && t.displayedAt === null" class="note warn">
          审核已通过但尚未展示：设备当时不可用，结果留在队列等待恢复。
        </p>
      </section>

      <section class="block">
        <h3>参与会话</h3>
        <dl class="kv">
          <div><dt>会话</dt><dd>{{ session?.id ?? '—' }}</dd></div>
          <div><dt>参与者</dt><dd>{{ session?.participantId ?? '—' }}</dd></div>
          <div><dt>点位</dt><dd>{{ site?.name ?? '—' }}</dd></div>
          <div><dt>开始时间</dt><dd>{{ session ? timestamp(session.startedAt) : '—' }}</dd></div>
        </dl>
        <button v-if="device" type="button" class="device-link" @click="emit('openDevice', device.id)">
          {{ device.name }} · {{ device.id }} →
        </button>
      </section>

      <section class="block">
        <h3>扫码领取 <span class="count">{{ scans.length }} 次</span></h3>
        <ul v-if="scans.length" class="events">
          <li v-for="s in scans" :key="s.id"><span class="eid">{{ s.id }}</span><span>{{ timestamp(s.scannedAt) }}</span></li>
        </ul>
        <p v-else class="note">该结果没有扫码记录。</p>
      </section>

      <section class="block">
        <h3>分享传播 <span class="count">{{ shares.length }} 次</span></h3>
        <ul v-if="shares.length" class="events">
          <li v-for="s in shares" :key="s.id">
            <span class="eid">{{ s.id }}</span><span>{{ timestamp(s.sharedAt) }}</span><span class="ch">{{ s.channel }}</span>
          </li>
        </ul>
        <p v-else class="note">该结果没有分享记录。</p>
      </section>
    </div>
  </ElDrawer>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; }
.eyebrow { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; }
.tid { font-size: 11px; color: var(--text-weak); font-family: ui-monospace, monospace; }
.head h2 { font-size: 16px; color: var(--text-primary); }
.close { border: none; background: none; color: var(--text-weak); font-size: 22px; line-height: 1; padding: 0 4px; }
.close:hover { color: var(--text-primary); }
.block h3 { font-size: 12px; color: var(--text-second); font-weight: 500; margin-bottom: 9px; display: flex; align-items: center; gap: 7px; }
.count { font-size: 10px; color: var(--text-weak); }
.kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 16px; margin: 0; }
.kv div { display: flex; flex-direction: column; gap: 2px; }
.kv dt { font-size: 10px; color: var(--text-weak); }
.kv dd { margin: 0; font-size: 12.5px; color: var(--text-primary); }
.kv dd.strong { font-weight: 600; }
.note { margin-top: 10px; font-size: 10.5px; line-height: 1.6; color: var(--text-weak); }
.note.warn { color: var(--color-warning); }
.events { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.events li { display: flex; gap: 12px; font-size: 11px; color: var(--text-second); padding: 6px 10px; background: var(--bg-subtle); border-radius: 8px; }
.eid { color: var(--color-primary); font-family: ui-monospace, monospace; font-size: 10.5px; }
.ch { margin-left: auto; color: var(--text-weak); font-size: 10px; }
.device-link { margin-top: 12px; border: 1px solid var(--glass-border); background: var(--bg-subtle); color: var(--color-primary); font-size: 12px; padding: 8px 13px; border-radius: 9px; width: 100%; text-align: left; }
.device-link:hover { background: var(--bg-card-hover); }
</style>
