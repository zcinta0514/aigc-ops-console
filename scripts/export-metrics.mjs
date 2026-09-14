import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
await page.goto(pathToFileURL(process.cwd() + '/public/metrics-one-page.html').href)
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: 'deliverables/metrics-one-page.pdf', format: 'A4', preferCSSPageSize: true, printBackground: true })
await browser.close()
console.log('Exported deliverables/metrics-one-page.pdf; page count and render still require inspection')
