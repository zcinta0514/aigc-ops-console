import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, FunnelChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, GraphicComponent, MarkLineComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { chartTheme } from '../styles/echarts-theme'

echarts.use([
  LineChart, BarChart, PieChart, FunnelChart,
  GridComponent, TooltipComponent, LegendComponent, GraphicComponent, MarkLineComponent,
  SVGRenderer,
])
echarts.registerTheme('glass-lab', chartTheme)

/**
 * ECharts 生命周期封装。图表一律经此创建，保证 resize、销毁与主题一致。
 * option 变化时用 notMerge 覆盖，避免空数据残留上一次筛选的图形。
 */
export function useEChart(
  container: Ref<HTMLElement | undefined>,
  option: () => echarts.EChartsCoreOption,
) {
  let chart: echarts.ECharts | undefined
  let observer: ResizeObserver | undefined

  onMounted(() => {
    if (!container.value) return
    chart = echarts.init(container.value, 'glass-lab', { renderer: 'svg' })
    chart.setOption(option(), { notMerge: true })
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(container.value)
  })

  watch(option, value => chart?.setOption(value, { notMerge: true }), { deep: true })
  onBeforeUnmount(() => {
    observer?.disconnect()
    chart?.dispose()
  })
}
