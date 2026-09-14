<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { DEMO } from '../config/demo'

const route = useRoute()

const NAV = [
  { path: '/overview', label: '运营总览', glyph: '▦' },
  { path: '/live', label: '实时监控', glyph: '◉' },
  { path: '/details', label: '异常与明细', glyph: '▤' },
] as const

const title = computed(() => NAV.find(n => route.path.startsWith(n.path))?.label ?? '运营总览')
const snapshot = computed(() => DEMO.asOf.slice(0, 16).replace('T', ' '))
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-symbol">◈</span>
        <div>光影实验室<small>LIGHT &amp; IMAGINATION</small></div>
      </div>

      <div class="nav-caption">工作空间</div>
      <nav>
        <RouterLink
          v-for="item in NAV" :key="item.path"
          :to="{ path: item.path, query: route.path === '/details' && item.path === '/details' ? route.query : { start: route.query.start, end: route.query.end, sites: route.query.sites } }"
        >
          <span aria-hidden="true">{{ item.glyph }}</span>{{ item.label }}
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <span class="sidebar-dot" aria-hidden="true"></span>AIGC 互动大屏
        <small>城市光影计划 · 夏日限定</small>
        <div class="side-version"><span>DEMO WORKSPACE</span><span>V1.0</span></div>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <span>活动运营 <span class="crumb">/</span> <strong>{{ title }}</strong></span>
        <div class="topbar-right">
          <span class="demo-label">模拟数据</span>
          <span>数据截至 {{ snapshot }}（北京时间）</span>
        </div>
      </header>
      <main><slot /></main>
    </div>
  </div>
</template>

<style scoped>
nav a span { width: 16px; text-align: center; }
</style>
