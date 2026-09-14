import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(pathToFileURL(process.cwd() + '/dist-single/index.html').href)
await page.getByRole('heading', { name: '运营总览', exact: true }).waitFor()
await page.locator('.chart-canvas svg').waitFor()
const widthBefore = await page.locator('.chart-canvas svg').getAttribute('width')
await page.setViewportSize({ width: 1366, height: 768 })
await page.waitForFunction(oldWidth => document.querySelector('.chart-canvas svg')?.getAttribute('width') !== oldWidth, widthBefore)
await page.getByRole('link', { name: '异常与明细' }).click()
await page.getByRole('heading', { name: '异常与明细', exact: true }).waitFor()
assert.equal(await page.locator('.chart-canvas svg').count(), 0)
await page.getByRole('link', { name: '运营总览' }).click()
await page.locator('.chart-canvas svg').waitFor()
await page.screenshot({ path: 'docs/work/p1-scaffold.png' })
await browser.close()
if (errors.length) throw Error(errors.join('\n'))
console.log('P1 single-file file://, two routes, SVG resize and unmount assertions: passed; lifecycle operations page errors: 0')
