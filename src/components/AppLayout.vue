<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { BRAND, NAV, PAGE_TITLES } from '../config/brand'
import { DEMO } from '../config/demo'

const route = useRoute()

const title = computed(() => PAGE_TITLES[route.path] ?? BRAND.moduleName)
const snapshot = computed(() => DEMO.asOf.slice(0, 16).replace('T', ' '))

/** 跳转时保留业务筛选，但切换到明细页才携带明细自身的状态。 */
function queryFor(path: string) {
  const q = route.query
  const base = { start: q.start, end: q.end, sites: q.sites }
  return path === '/details' && route.path === '/details' ? q : base
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-symbol" aria-hidden="true">◈</span>
        <div>
          {{ BRAND.name }}
          <small v-if="BRAND.nameEn">{{ BRAND.nameEn }}</small>
        </div>
      </div>

      <div class="nav-caption">工作空间</div>
      <nav>
        <RouterLink v-for="item in NAV" :key="item.path" :to="{ path: item.path, query: queryFor(item.path) }">
          <span aria-hidden="true">{{ item.glyph }}</span>{{ item.label }}
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <span class="sidebar-dot" aria-hidden="true"></span>{{ BRAND.subject }}
        <small>{{ BRAND.campaign }}</small>
        <div class="side-version">
          <span>{{ BRAND.workspaceLabel }}</span><span>{{ BRAND.version }}</span>
        </div>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <span>{{ BRAND.moduleName }} <span class="crumb">/</span> <strong>{{ title }}</strong></span>
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
