// Capture chaque écran HTML en PNG haute résolution (retina @2x).
const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs')

const SCREENS = path.join(__dirname, 'screens')
const IMG = path.join(__dirname, 'img')

;(async () => {
  const files = fs.readdirSync(SCREENS).filter((f) => f.endsWith('.html'))
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  })
  for (const file of files) {
    const name = file.replace(/\.html$/, '')
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })
    await page.goto('file://' + path.join(SCREENS, file), { waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 250))
    const out = path.join(IMG, `${name}.png`)
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1600, height: 1000 } })
    console.log('shot', name, '→', out)
    await page.close()
  }
  await browser.close()
})()
