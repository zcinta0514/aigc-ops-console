/**
 * 品牌与文案配置。将项目改造成自己的看板时，通常只需要改这一个文件，
 * 不必翻页面组件去找硬编码的产品名。
 */
export const BRAND = {
  /** 侧栏主标题与文档标题。 */
  name: '光影实验室',
  /** 主标题下的一行小字，留空则不渲染。 */
  nameEn: 'LIGHT & IMAGINATION',
  /** 顶栏左侧的模块名，通常写业务线。 */
  moduleName: '活动运营',
  /** 侧栏底部的设备类型说明。 */
  subject: 'AIGC 互动大屏',
  /** 侧栏底部的活动说明。 */
  campaign: '城市光影计划 · 夏日限定',
  /** 侧栏底部版本行。 */
  workspaceLabel: 'DEMO WORKSPACE',
  version: 'V1.0',
} as const

/** 导航项。改这里即可增删页面入口，顺序与侧栏一致。 */
export const NAV = [
  { path: '/overview', label: '运营总览', glyph: '▦' },
  { path: '/live', label: '实时监控', glyph: '◉' },
  { path: '/details', label: '异常与明细', glyph: '▤' },
] as const

export const PAGE_TITLES: Record<string, string> = {
  '/overview': '运营总览',
  '/live': '实时监控',
  '/details': '异常与明细',
}
