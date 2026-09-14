import { expect, test, type Page } from '@playwright/test'

/**
 * 端到端关键路径。
 *
 * 单元测试保证「数字算得对」，这里保证「数字真的出现在页面上、
 * 筛选真的生效、异常真的能下钻」。两者缺一不可——指标算对了但没渲染出来，
 * 对使用者来说等同于不存在。
 */

/** 收集控制台错误与未捕获异常；页面自己报错时测试应当失败，而不是只截图了事。 */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(String(err)))
  return errors
}

const metricTexts = (page: Page) =>
  page.locator('.metric-card').allInnerTexts()

test.describe('运营总览', () => {
  test('首屏渲染真实指标，而不是占位内容', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/overview')

    await expect(page.locator('h1')).toHaveText('运营总览')
    await expect(page.locator('.metric-card')).toHaveCount(6)

    const cards = await metricTexts(page)
    expect(cards.join(' ')).toContain('参与人数')
    expect(cards.join(' ')).toContain('生成成功率')
    // 转化卡必须是扫码与分享两个指标分列，不能合并成单一的「转化率」
    expect(cards.join(' ')).toContain('扫码领取')
    expect(cards.join(' ')).toContain('分享转化')

    // 占位时期望出现的文案不应存在
    await expect(page.locator('body')).not.toContainText('工程初始化')

    expect(errors).toEqual([])
  })

  test('默认 7 天范围内的参与人数不为零，且设备快照为 10/1/1', async ({ page }) => {
    await page.goto('/#/overview')
    const cards = (await metricTexts(page)).join(' ')
    expect(cards).not.toContain('0人')
    expect(cards).toContain('10台')
    expect(cards).toContain('离线 1')
    expect(cards).toContain('未知 1')
  })

  test('切到完整 30 天，指标随之变化', async ({ page }) => {
    await page.goto('/#/overview')
    const before = (await metricTexts(page)).join(' ')

    await page.goto('/#/overview?start=2026-08-01&end=2026-08-30')
    await expect(page.locator('.metric-card').first()).not.toHaveText(/^\s*$/)
    const after = (await metricTexts(page)).join(' ')

    expect(after).not.toBe(before)
    // 完整范围应命中固定的 4,500 名模拟参与者
    expect(after).toContain('4,500')
  })
})

test.describe('实时监控与时间回放', () => {
  test('停留在快照时展示完整当日数据', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/live')
    await expect(page.locator('h1')).toHaveText('实时监控')
    await expect(page.locator('.readout')).toContainText('20:00')
    await expect(page.locator('.replay-note')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('拖动时间轴后所有指标按那一刻重算', async ({ page }) => {
    await page.goto('/#/live')
    const before = (await metricTexts(page)).join(' ')

    // 拖到 13:00，此时当天只过了一半多
    await page.locator('.range').fill('780')
    await expect(page.locator('.readout')).toContainText('13:00')
    await expect(page.locator('.replay-note')).toHaveCount(1)

    const after = (await metricTexts(page)).join(' ')
    expect(after).not.toBe(before)
    expect(after).toContain('截至 13:00')
    // 设备状态是快照口径，不参与回放
    expect(after).toContain('不参与回放')
  })

  test('点「回到快照」可恢复', async ({ page }) => {
    await page.goto('/#/live')
    await page.locator('.range').fill('700')
    await expect(page.locator('.replay-note')).toHaveCount(1)
    await page.getByRole('button', { name: '回到快照' }).click()
    await expect(page.locator('.replay-note')).toHaveCount(0)
    await expect(page.locator('.readout')).toContainText('20:00')
  })
})

test.describe('异常与明细', () => {
  test('异常列表可筛选且能打开证据抽屉', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/#/details?tab=anomalies&start=2026-08-24&end=2026-08-30')

    await expect(page.locator('h1')).toHaveText('异常与明细')
    const rows = page.locator('.anomaly-table .row')
    await expect(rows.first()).toBeVisible()

    // 抽屉必须给出规则、阈值与建议，而不是只有一句结论
    await rows.first().click()
    const drawer = page.locator('.el-drawer.open').first()
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('触发规则')
    await expect(drawer).toContainText('建议排查')
    await expect(drawer).toContainText('不等同于已确认根因')
    // 设备抽屉不应被异常抽屉顺带打开
    await expect(page.locator('.el-drawer.open')).toHaveCount(1)

    expect(errors).toEqual([])
  })

  test('标签可切换到生成记录与设备，且渲染出真实行', async ({ page }) => {
    await page.goto('/#/details?tab=generation&start=2026-08-24&end=2026-08-30')
    await expect(page.locator('.el-table__row').first()).toBeVisible()

    await page.getByRole('tab', { name: '设备' }).click()
    await expect(page.locator('.el-table__row').first()).toBeVisible()
    await expect(page.locator('body')).toContainText('历史离线事件')
  })

  test('无效日期参数给出反馈而不是静默展示错误结果', async ({ page }) => {
    await page.goto('/#/overview?start=不是日期&end=2026-08-30')
    await expect(page.locator('.filter-warning')).toBeVisible()
  })
})
