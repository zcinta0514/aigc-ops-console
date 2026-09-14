import type { ECharts } from 'echarts/core'

/** 触发一次浏览器下载。不依赖任何第三方库。 */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻回收会让部分浏览器来不及取数据，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 导出 CSV。
 *
 * 三个容易被忽略但必须处理的地方：
 * 1. 加 UTF-8 BOM —— 否则 Excel 打开中文表头是乱码；
 * 2. 字段里的逗号、引号、换行必须转义，否则列会错位；
 * 3. 以 = + - @ 开头的单元格前置单引号，避免被表格软件当作公式执行。
 */
export function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | null>>) {
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return ''
    let text = String(value)
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
    return text
  }

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ]
  // \uFEFF 是 UTF-8 BOM：不加它，Excel 打开中文表头会是乱码
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
}

/**
 * 导出图表为 PNG。使用 ECharts 自己的导出能力，
 * 保证与屏幕上看到的配色、缩放完全一致。
 */
export function exportChartPng(chart: ECharts | undefined, filename: string, background = '#0C111C') {
  if (!chart) return
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: background })
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 生成带日期范围的导出文件名，避免多次导出互相覆盖。 */
export function exportName(prefix: string, start: string, end: string, ext: string) {
  const stamp = start === end ? start : `${start}_${end}`
  return `${prefix}_${stamp}.${ext}`
}
