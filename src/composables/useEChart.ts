import { onMounted, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, FunnelChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, GraphicComponent, MarkLineComponent, MarkAreaComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { chartTheme } from '../styles/echarts-theme'

echarts.use([
  LineChart, BarChart, PieChart, FunnelChart,
  GridComponent, TooltipComponent, LegendComponent, GraphicComponent, MarkLineComponent, MarkAreaComponent,
  SVGRenderer,
])
echarts.registerTheme('glass-lab', chartTheme)

export type ChartClickPayload = { name?: string; dataIndex?: number; seriesName?: string }

/**
 * ECharts 生命周期封装。图表一律经此创建，保证 resize、销毁与主题一致。
 * option 变化时用 notMerge 覆盖，避免空数据残留上一次筛选的图形。
 *
 * 返回的实例供导出 PNG 使用；`onClick` 用于把图表点击转成业务事件
 * （例如点趋势图的某一天即筛选到该日），避免图表组件把筛选逻辑写死在自己内部。
 */
export function useEChart(
  container: Ref<HTMLElement | undefined>,
  option: () => echarts.EChartsCoreOption,
  onClick?: (payload: ChartClickPayload) => void,
) {
  const chart = shallowRef<echarts.ECharts>()
  let observer: ResizeObserver | undefined

  onMounted(() => {
    if (!container.value) return
    const instance = echarts.init(container.value, 'glass-lab', { renderer: 'svg' })
    instance.setOption(option(), { notMerge: true })
    if (onClick) {
      instance.on('click', (params) => onClick(params as ChartClickPayload))
    }
    chart.value = instance
    observer = new ResizeObserver(() => instance.resize())
    observer.observe(container.value)
  })

  watch(option, value => chart.value?.setOption(value, { notMerge: true }), { deep: true })
  onBeforeUnmount(() => {
    observer?.disconnect()
    chart.value?.dispose()
    chart.value = undefined
  })

  return { chart }
}
