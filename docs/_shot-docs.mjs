import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///E:/01来粉来粉/中转/ai-relay/new-api/web/public/keyoapi-docs.html', {
  waitUntil: 'networkidle',
});
await page.screenshot({
  path: 'E:/01来粉来粉/中转/ai-relay/docs/keyoapi-docs-preview.png',
});
await page.screenshot({
  path: 'E:/01来粉来粉/中转/ai-relay/docs/keyoapi-docs-full.png',
  fullPage: true,
});
// smoke-test copy button
await page.click('button.btn-copy[data-copy="https://www.keyoapi.xyz/v1"]');
await page.waitForTimeout(400);
const label = await page.textContent('button.btn-copy[data-copy="https://www.keyoapi.xyz/v1"]');
console.log('copy-btn-label:', label);
await browser.close();
console.log('screenshots ok');
