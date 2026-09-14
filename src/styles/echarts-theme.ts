/**
 * 图表主题：与设计令牌保持同一套色值与质感。
 * 不使用 ECharts 默认色板，避免与整体深色玻璃基调脱节。
 */
export const palette = {
  primary: '#4EA8FF',
  violet: '#9B8CFF',
  success: '#2FD6A3',
  warning: '#F2B75C',
  critical: '#FF6B7A',
  neutral: '#8C9AB5',
  weak: '#606C86',
  grid: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.09)',
  text: '#9AA6BF',
  strong: '#E9EDF6',
  surface: 'rgba(16, 20, 31, 0.94)',
  faint: 'rgba(78, 168, 255, 0.18)',
}

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

export const chartTheme = {
  color: [palette.primary, palette.violet, palette.success, palette.warning, palette.critical, palette.neutral],
  textStyle: { fontFamily, fontSize: 11, color: palette.text },
  line: { showSymbol: false, lineStyle: { width: 2 } },
  categoryAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: palette.weak, fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: palette.weak, fontSize: 11 },
    splitLine: { lineStyle: { color: palette.grid, type: 'dashed' as const } },
  },
  legend: { top: 0, right: 0, textStyle: { color: palette.text, fontSize: 11 }, icon: 'roundRect', itemHeight: 3, itemWidth: 12, itemGap: 14 },
  bar: { itemStyle: { borderRadius: [4, 4, 0, 0] } },
  tooltip: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: palette.strong, fontSize: 12, fontFamily },
    extraCssText: 'font-variant-numeric:tabular-nums;backdrop-filter:blur(12px);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.5);',
    axisPointer: {
      type: 'line' as const,
      lineStyle: { color: 'rgba(78, 168, 255, 0.35)', width: 1, type: 'dashed' as const },
    },
  },
}

/** 折线辉光：光影感的主要来源，只用在主序列上，避免满图发光。 */
export const glowLine = (color: string, width = 2) => ({
  width,
  shadowColor: color,
  shadowBlur: 12,
  shadowOffsetY: 2,
})

/** 面积渐变：自上而下淡出，让折线下方有"光晕"而不是实心色块。 */
export const areaGradient = (top: string, bottom = 'rgba(0,0,0,0)') => ({
  type: 'linear' as const,
  x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }],
})
