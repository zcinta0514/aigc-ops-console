import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/**
 * 使用 hash 路由：静态托管与单文件打开都不需要服务端重写规则，
 * 刷新任意页面都不会出现 404。
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', name: 'overview', component: () => import('../pages/OverviewPage.vue') },
  { path: '/live', name: 'live', component: () => import('../pages/LivePage.vue') },
  { path: '/details', name: 'details', component: () => import('../pages/DetailsPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/overview' },
]

export const router = createRouter({ history: createWebHashHistory(), routes })
