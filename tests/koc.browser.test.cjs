// Optional browser smoke test. Install Playwright and Chromium before running:
// npm install --no-save --no-package-lock playwright && npx playwright install chromium
// node --test tests/koc.browser.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const mime = {'.html':'text/html', '.js':'text/javascript', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json', '.png':'image/png'};

test('real browser: KOC setup, entrants, absence, language, reload and mobile layout', async t => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved = path.resolve(root, '.' + requestPath);
    if (!resolved.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
    try {
      const data = fs.readFileSync(resolved);
      res.writeHead(200, {'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream'}).end(data);
    } catch (e) {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());

  const context = await browser.newContext({viewport:{width:1280,height:900}});
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('.format-btn[data-format="koc"]').click();
  assert.equal(await page.locator('#kocRoster .koc-player').count(),16);
  assert.equal(await page.locator('.koc-entry-marker').count(),0);
  await page.locator('#kocEntryToggle').check();
  assert.equal(await page.locator('.koc-entry-marker').count(),4);
  for (let idx=12;idx<16;idx++){
    await page.locator('.koc-player').nth(idx).locator('.koc-entry-marker input').check();
  }
  async function courtNames(){
    const cards = await page.locator('#kocResult .koc-court').all();
    return Promise.all(cards.map(card => card.locator('li').allTextContents()));
  }
  await page.locator('#kocRoll').click();
  let cards = await courtNames();
  assert.equal(cards.length,4);
  assert.ok(cards[0].includes('Speler 1'));
  assert.ok(cards[1].includes('Speler 2'));
  for (let i=13;i<=16;i++) assert.ok(cards[3].includes('Speler '+i));
  assert.ok(cards.every(court=>!court.includes('Instroom')), 'incoming markers are private setup-only labels');

  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await page.locator('#kocCopy').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied,/King of the Court/);
  assert.match(copied,/Baan 4/);
  assert.ok(!copied.includes('Instroom'),'copying for WhatsApp never reveals incoming markers');

  const downloadEvent = page.waitForEvent('download');
  await page.locator('#kocSave').click();
  const download = await downloadEvent;
  const savedPath = await download.path();
  const saved = JSON.parse(fs.readFileSync(savedPath,'utf8'));
  assert.equal(saved.state.koc.incomingEnabled,true);
  assert.equal(saved.state.koc.roster.slice(12,16).filter(p=>p.incoming).length,4);

  // The fifth player is absent; of four entrants one must now start on court 2.
  await page.locator('.koc-player').nth(4).locator('input[type=checkbox]').first().uncheck();
  assert.equal(await page.locator('#kocResult .koc-court').count(),0,'old assignment is invalidated');
  await page.locator('#kocRoll').click();
  cards = await courtNames();
  const entrants = [13,14,15,16];
  assert.equal(entrants.filter(i=>cards[3].includes('Speler '+i)).length,3);
  assert.equal(entrants.filter(i=>cards[2].includes('Speler '+i)).length,1);

  // Name collision uses the existing duplicate-name guard.
  await page.locator('.koc-player').nth(1).locator('input[type=text]').fill('Speler 1');
  assert.equal(await page.locator('#kocRoll').isEnabled(),false);
  await page.locator('.koc-player').nth(1).locator('input[type=text]').fill('');
  assert.equal(await page.locator('#kocRoll').isEnabled(),true);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('padel-toss-americano-session-v2');
    if(!raw)return false;
    const data = JSON.parse(raw);
    return data.state?.koc?.incomingEnabled === true &&
      data.state.koc.roster.slice(12,16).every(x=>x.incoming===true);
  });
  await page.reload();
  await page.locator('#resumeContinue').click();
  assert.equal(await page.locator('#kocEntryToggle').isChecked(),true);
  assert.equal(await page.locator('.koc-entry-marker input:checked').count(),4);
  assert.equal(await page.locator('#kocRoster .koc-player.absent').count(),1);
  assert.match(await page.locator('.koc-entry-option').innerText(),/Instroomspelers indelen/);

  await page.locator('#kocEntryToggle').uncheck();
  assert.equal(await page.locator('.koc-entry-marker').count(),0);
  await page.locator('#kocRoll').click();
  cards = await courtNames();
  assert.ok(cards[0].includes('Speler 1'));
  assert.ok(cards[1].includes('Speler 2'));

  // Importing a saved KOC schedule restores its four incoming flags.
  await page.locator('#loadFileInput').setInputFiles(savedPath);
  await page.locator('#kocEntryToggle').waitFor({state:'visible'});
  await page.waitForFunction(() => document.getElementById('kocEntryToggle').checked);
  assert.equal(await page.locator('.koc-entry-marker input:checked').count(),4);

  // The English labels also work when selected from the visible mode picker.
  const english = await browser.newContext();
  t.after(() => english.close());
  const englishPage = await english.newPage();
  await englishPage.goto(origin);
  await englishPage.locator('#langSwitch .lang-btn[data-lang="en"]').click();
  await englishPage.locator('.format-btn[data-format="koc"]').click();
  await englishPage.locator('#kocEntryToggle').check();
  assert.match(await englishPage.locator('.koc-entry-option').innerText(),/Place incoming players/);
  assert.equal(await englishPage.locator('.koc-entry-marker').count(),4);

  // Responsive mobile field: four markers remain usable without sideways scroll.
  const mobile = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  t.after(() => mobile.close());
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin);
  await mobilePage.locator('.format-btn[data-format="koc"]').click();
  await mobilePage.locator('#kocEntryToggle').check();
  assert.equal(await mobilePage.locator('.koc-entry-marker').count(),4);
  await mobilePage.locator('.koc-player').nth(12).locator('.koc-entry-marker input').check();
  assert.equal(await mobilePage.locator('.koc-entry-marker input:checked').count(),1);
  const overflows = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.equal(overflows,false,'no horizontal overflow at a 390px mobile viewport');

  // Production auto-registers the service worker on HTTPS only. On this local
  // HTTP test origin we register it explicitly and verify its upgrade cleanup.
  await page.evaluate(async () => {
    await caches.open('padel-toss-americano-v202');
    await navigator.serviceWorker.register('./sw.js');
  });
  await page.waitForFunction(async () => {
    if(!('serviceWorker' in navigator))return false;
    await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    return keys.includes('padel-toss-americano-v204') &&
      !keys.includes('padel-toss-americano-v202');
  });
});
