const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file:///home/user/juankimoney/nuovo-212-patrocinio/index.html');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await page.addStyleTag({ content: `
    .reveal{ opacity:1 !important; transform:none !important; transition:none !important; }
    .dotnav, .progress, .wordmark, .grain, .scrollcue{ display:none !important; }
    *{ animation:none !important; }
  `});
  await page.waitForTimeout(200);

  const outDir = path.join(__dirname, 'pdf-pages');
  fs.mkdirSync(outDir, { recursive: true });

  const ids = Array.from({ length: 12 }, (_, i) => `sec-${i}`);
  for (const id of ids) {
    const el = page.locator('#' + id);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await el.boundingBox();
    await el.screenshot({ path: path.join(outDir, id + '.png') });
    console.log(id, JSON.stringify(box));
  }

  await browser.close();
})();
