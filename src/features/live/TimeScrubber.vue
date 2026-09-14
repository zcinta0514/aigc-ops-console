<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 当前回放位置，当天第几分钟。 */
  modelValue: number
  min: number
  max: number
  playing: boolean
  /** 到过的分钟数（有数据的小时区间），用于在轨道上标出营业时段。 */
  activeFrom: number
  activeTo: number
}>()
const emit = defineEmits<{
  'update:modelValue': [value: number]
  toggle: []
  reset: []
}>()

const fmt = (minute: number) => {
  const h = Math.floor(minute / 60)
  const m = Math.round(minute % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const current = computed(() => fmt(props.modelValue))
const atEnd = computed(() => props.modelValue >= props.max)
const progressPct = computed(() => ((props.modelValue - props.min) / (props.max - props.min)) * 100)

/** 营业时段在轨道上的起止位置，让刻度与真实有数据的区间对应。 */
const activeLeft = computed(() => ((props.activeFrom - props.min) / (props.max - props.min)) * 100)
const activeWidth = computed(() => ((props.activeTo - props.activeFrom) / (props.max - props.min)) * 100)

const ticks = computed(() => {
  const out: Array<{ minute: number; left: number; label: string }> = []
  for (let m = Math.ceil(props.min / 60) * 60; m <= props.max; m += 60) {
    out.push({ minute: m, left: ((m - props.min) / (props.max - props.min)) * 100, label: `${m / 60}:00` })
  }
  return out
})
</script>

<template>
  <div class="scrubber" :class="{ replaying: !atEnd }">
    <button
      type="button" class="play" :aria-label="playing ? '暂停回放' : '开始回放'"
      :aria-pressed="playing" @click="emit('toggle')"
    >
      <span aria-hidden="true">{{ playing ? '❚❚' : '▶' }}</span>
    </button>

    <div class="track-wrap">
      <div class="rail" aria-hidden="true">
        <div class="active" :style="{ left: activeLeft + '%', width: activeWidth + '%' }" />
        <div class="fill" :style="{ width: progressPct + '%' }" />
        <span v-for="t in ticks" :key="t.minute" class="tick" :style="{ left: t.left + '%' }" />
      </div>

      <input
        class="range" type="range" :min="min" :max="max" :step="1"
        :value="modelValue" :aria-label="'回放时间'" :aria-valuetext="current"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      />

      <div class="labels" aria-hidden="true">
        <span v-for="t in ticks" :key="t.minute" :style="{ left: t.left + '%' }">{{ t.label }}</span>
      </div>
    </div>

    <div class="readout">
      <strong>{{ current }}</strong>
      <span class="state">
        {{ atEnd ? '已达快照' : playing ? '回放中' : '已暂停' }}
      </span>
    </div>

    <button v-if="!atEnd" type="button" class="reset" @click="emit('reset')">回到快照</button>
  </div>
</template>

<style scoped>
.scrubber {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 16px; border-radius: var(--radius-card);
  background: var(--bg-card); border: 1px solid var(--glass-border);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  box-shadow: var(--shadow-card), var(--glass-inset);
  transition: border-color var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft);
}
/* 回放中给整条控件一层辉光，提示当前看到的不是快照 */
.scrubber.replaying { border-color: rgba(78, 168, 255, 0.34); box-shadow: var(--glow-primary), var(--shadow-card); }

.play {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid rgba(78, 168, 255, 0.4); background: var(--bg-blue);
  color: var(--color-primary); font-size: 11px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-soft);
}
.play:hover { background: rgba(78, 168, 255, 0.22); transform: scale(1.06); }
.play:active { transform: scale(0.96); }

.track-wrap { flex: 1; min-width: 0; position: relative; padding: 12px 0 18px; }
.rail {
  position: absolute; top: 18px; left: 0; right: 0; height: 4px;
  border-radius: 2px; background: rgba(255, 255, 255, 0.07); overflow: visible;
}
.active { position: absolute; top: 0; height: 100%; border-radius: 2px; background: rgba(78, 168, 255, 0.18); }
.fill {
  position: absolute; top: 0; height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, rgba(78,168,255,.6), var(--color-primary));
  box-shadow: 0 0 12px rgba(78, 168, 255, 0.55);
  transition: width 80ms linear;
}
.tick { position: absolute; top: -4px; width: 1px; height: 12px; background: rgba(255, 255, 255, 0.14); }

.range {
  position: relative; width: 100%; margin: 0; height: 18px;
  background: none; -webkit-appearance: none; appearance: none; cursor: pointer;
}
.range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 15px; height: 15px; border-radius: 50%;
  background: #fff; border: 2px solid var(--color-primary);
  box-shadow: 0 0 0 4px rgba(78, 168, 255, 0.18), 0 0 14px rgba(78, 168, 255, 0.6);
  transition: box-shadow var(--dur-fast) var(--ease-soft);
}
.range::-webkit-slider-thumb:hover { box-shadow: 0 0 0 7px rgba(78, 168, 255, 0.22), 0 0 18px rgba(78, 168, 255, 0.75); }
.range::-moz-range-thumb {
  width: 15px; height: 15px; border-radius: 50%; background: #fff;
  border: 2px solid var(--color-primary); box-shadow: 0 0 0 4px rgba(78, 168, 255, 0.18);
}
.range:focus-visible { outline: none; }
.range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 6px rgba(78, 168, 255, 0.35); }

.labels { position: absolute; bottom: 0; left: 0; right: 0; height: 12px; }
.labels span {
  position: absolute; transform: translateX(-50%);
  font-size: 9px; color: var(--text-weak); white-space: nowrap;
}

.readout { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; min-width: 86px; }
.readout strong { font-size: 19px; font-weight: 600; color: var(--text-primary); line-height: 1.1; }
.replaying .readout strong { color: var(--color-primary); }
.state { font-size: 9.5px; color: var(--text-weak); }

.reset {
  flex-shrink: 0; border: 1px solid var(--glass-border); background: var(--bg-subtle);
  color: var(--text-second); font-size: 11px; padding: 6px 11px; border-radius: 9px;
  transition: all var(--dur-fast) var(--ease-soft);
}
.reset:hover { color: var(--text-primary); border-color: var(--glass-border-strong); }

@media (max-width: 1366px) {
  .labels span:nth-child(even) { display: none; }
}
</style>
