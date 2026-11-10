// Regression coverage for court-based defaults, the global header and the
// opt-in, non-destructive name-list drawer in all four formats.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

test('court defaults and name-list drawer retain the ordinary player layout', async t => {
  const root = path.join(__dirname, '..');
  const server = http.createServer((req, res) => {
    const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {res.writeHead(200,{'Content-Type':path.extname(file) === '.js' ? 'text/javascript' : 'text/html'})
      .end(fs.readFileSync(file));}
    catch (e) {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const url = 'http://127.0.0.1:' + server.address().port;

  async function formatPage(format, options){
    const context = await browser.newContext(options);
    t.after(() => context.close());
    const page = await context.newPage();
    await page.goto(url);
    assert.equal(await page.locator('#appTitle').innerText(),'PADEL PLANNER');
    assert.equal(await page.locator('#langSwitch').isVisible(),true);
    assert.equal(await page.locator('#homeLangSwitch').count(),0);
    await page.locator('.format-btn[data-format="' + format + '"]').click();
    return page;
  }

  const toss = await formatPage('toss');
  assert.equal(await toss.locator('#playerCountInput').inputValue(),'16');
  await toss.locator('.court-btn[data-courts="3"]').click();
  assert.equal(await toss.locator('#playerCountInput').inputValue(),'24');
  await toss.locator('#playerCountInput').fill('19');
  await toss.locator('.court-btn[data-courts="4"]').click();
  assert.equal(await toss.locator('#playerCountInput').inputValue(),'19','manual count overrides preset');
  await toss.locator('#continueTo2').click();
  assert.equal(await toss.locator('#namesGrid .name-field').count(),19);
  await toss.locator('#namesGrid .name-field input').first().fill('Bestaand');
  await toss.locator('#bulkSingle .bulk-entry-trigger').click();
  assert.equal(await toss.locator('#bulkDrawerLayer').isVisible(),true);
  await toss.locator('#bulkDrawerText').fill('Eerste\n\nTweede\n');
  assert.match(await toss.locator('#bulkDrawerPreview').innerText(),/2 namen/);
  await toss.keyboard.press('Escape');
  assert.equal(await toss.locator('#namesGrid .name-field input').first().inputValue(),'Bestaand');
  await toss.locator('#bulkSingle .bulk-entry-trigger').click();
  assert.match(await toss.locator('#bulkDrawerText').inputValue(),/Eerste/,'draft survives cancel in this session');
  await toss.locator('#bulkDrawerText').fill('Gerrit\nGERRIT');
  await toss.locator('#bulkDrawerApply').click();
  assert.match(await toss.locator('#bulkDrawerError').innerText(),/regels 1 en 2/);
  await toss.locator('#bulkDrawerText').fill('Gerrit\nSanne');
  await toss.locator('#bulkDrawerApply').click();
  assert.equal(await toss.locator('#bulkDrawerLayer').isVisible(),false);
  assert.equal(await toss.locator('#namesGrid .name-field input').first().inputValue(),'Gerrit');
  assert.equal(await toss.locator('#namesGrid .name-field').count(),19);
  await toss.locator('#bulkSingle .bulk-undo').click();
  assert.equal(await toss.locator('#namesGrid .name-field input').first().inputValue(),'Bestaand');

  const americano = await formatPage('americano');
  assert.equal(await americano.locator('#playerCountInput').inputValue(),'8');
  await americano.locator('.court-btn[data-courts="3"]').click();
  assert.equal(await americano.locator('#playerCountInput').inputValue(),'12');
  await americano.locator('#continueTo2').click();
  await americano.locator('#bulkSingle .bulk-entry-trigger').click();
  const thirteen = Array.from({length:13}, (_,i)=>'Amer '+(i+1));
  await americano.locator('#bulkDrawerText').fill(thirteen.join('\n'));
  assert.match(await americano.locator('#bulkDrawerCountLabel').innerText(),/13/);
  await americano.locator('#bulkDrawerAdjustCount').check();
  await americano.locator('#bulkDrawerApply').click();
  assert.equal(await americano.locator('#namesGrid .name-field').count(),13);
  await americano.locator('#bulkSingle .bulk-undo').click();
  assert.equal(await americano.locator('#namesGrid .name-field').count(),12);
  await americano.locator('#langSwitch .lang-btn[data-lang="en"]').click();
  assert.equal(await americano.locator('#langSwitch .lang-btn[data-lang="en"]').getAttribute('aria-pressed'),'true');
  assert.match(await americano.locator('#bulkSingle .bulk-entry-trigger').innerText(),/Paste names/);

  const split = await formatPage('splitToss');
  assert.deepEqual(await split.locator('#splitPlayersBlock input[type=number]').evaluateAll(els=>els.map(e=>e.value)),['8','8','0']);
  await split.locator('.court-btn[data-courts="3"]').click();
  assert.deepEqual(await split.locator('#splitPlayersBlock input[type=number]').evaluateAll(els=>els.map(e=>e.value)),['12','12','0']);
  await split.locator('.court-btn[data-courts="4"]').click();
  assert.deepEqual(await split.locator('#splitPlayersBlock input[type=number]').evaluateAll(els=>els.map(e=>e.value)),['16','16','0']);
  await split.locator('#ervarenCountInput').fill('10');
  await split.locator('.court-btn[data-courts="2"]').click();
  assert.deepEqual(await split.locator('#splitPlayersBlock input[type=number]').evaluateAll(els=>els.map(e=>e.value)),['16','10','0']);
  await split.locator('#continueTo2').click();
  await split.locator('#namesGridBeginner input').first().fill('Zilver origineel');
  await split.locator('#bulkBeginner .bulk-entry-trigger').click();
  await split.locator('#bulkDrawerText').fill(Array.from({length:18},(_,i)=>'Zilver '+(i+1)).join('\n'));
  await split.locator('#bulkDrawerAdjustCount').check();
  await split.locator('#bulkDrawerApply').click();
  assert.equal(await split.locator('#namesGridBeginner .name-field').count(),18);
  assert.equal(await split.locator('#namesGridErvaren .name-field').count(),10);
  await split.locator('#bulkBeginner .bulk-undo').click();
  assert.equal(await split.locator('#namesGridBeginner .name-field').count(),16);
  assert.equal(await split.locator('#namesGridBeginner input').first().inputValue(),'Zilver origineel');
  await split.locator('#bulkErvaren .bulk-entry-trigger').click();
  assert.match(await split.locator('#bulkDrawerTitle').innerText(),/Goud/);
  await split.locator('#bulkDrawerCancel').click();

  const koc = await formatPage('koc',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),16);
  await koc.locator('#bulkKoc .bulk-entry-trigger').click();
  assert.equal(await koc.locator('#bulkDrawerLayer').isVisible(),true);
  assert.equal(await koc.evaluate(()=>document.documentElement.scrollWidth > innerWidth+2),false);
  await koc.locator('#bulkDrawerCancel').click();
  assert.equal(await koc.locator('#bulkDrawerLayer').isVisible(),false);

  // KOC must offer the identical 1–4 buttons and 5–12 dropdown as the
  // other formats, including the new one-court and twelve-court extremes.
  const kocButtons = await koc.locator('#kocCourtButtons .court-btn .cb-num').allTextContents();
  assert.deepEqual(kocButtons,['1','2','3','4']);
  const kocDropdownOptions = await koc.locator('#kocMoreSelect option').evaluateAll(
    opts=>opts.map(x=>x.value).filter(Boolean));
  assert.deepEqual(kocDropdownOptions,['5','6','7','8','9','10','11','12']);
  assert.equal(await koc.locator('#kocCourtButtons .court-btn[data-courts="4"]').getAttribute('aria-pressed'),'true');

  await koc.locator('#kocCourtButtons .court-btn[data-courts="1"]').click();
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),4);
  assert.equal(await koc.locator('#kocMoreSelect').inputValue(),'');
  await koc.locator('#kocRoll').click();
  assert.equal(await koc.locator('#kocResult .koc-court').count(),1);
  assert.deepEqual((await koc.locator('#kocResult .koc-court li').allTextContents()).sort(),
    ['Speler 1','Speler 2','Speler 3','Speler 4']);

  await koc.locator('#kocMoreSelect').selectOption('5');
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),20);
  assert.equal(await koc.locator('#kocMoreSelect').inputValue(),'5');
  assert.equal(await koc.locator('#kocCourtButtons .courts-more.active').count(),1);
  assert.equal(await koc.locator('#kocResult .koc-court').count(),0,
    'court count changes invalidate the previous lineup');

  await koc.locator('#kocMoreSelect').selectOption('12');
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),48);
  const names48 = Array.from({length:48},(_,i)=>'Padeller '+(i+1));
  await koc.locator('#bulkKoc .bulk-entry-trigger').click();
  await koc.locator('#bulkDrawerText').fill(names48.join('\n'));
  await koc.locator('#bulkDrawerApply').click();
  assert.equal(await koc.locator('#bulkDrawerLayer').isVisible(),false);
  assert.equal(await koc.locator('#kocRoster .koc-player.absent').count(),0);
  await koc.locator('#kocRoll').click();
  assert.equal(await koc.locator('#kocResult .koc-court').count(),12);
  assert.match(await koc.locator('#kocResult .koc-court').first().innerText(),/Padeller 1/);
  assert.match(await koc.locator('#kocResult .koc-court').nth(1).innerText(),/Padeller 2/);
  assert.equal(await koc.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,
    '48 player setup remains horizontally responsive at mobile width');

  const savedKoc = koc.waitForEvent('download');
  await koc.locator('#kocSave').click();
  const file = await savedKoc;
  const savedFile = JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.equal(savedFile.state.koc.courts,12);
  assert.equal(savedFile.state.koc.roster.slice(0,48).filter(p=>p.active!==false).length,48);

  await koc.locator('#kocCourtButtons .court-btn[data-courts="2"]').click();
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),8);
  await koc.locator('#loadFileInput').setInputFiles(await file.path());
  await koc.waitForFunction(()=>document.querySelector('#kocMoreSelect')?.value === '12');
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),48);
});
