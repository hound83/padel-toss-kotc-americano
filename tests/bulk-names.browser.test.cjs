// Browser integration checks for the optional multiline name entry.
// node --test tests/bulk-names.browser.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const mime = {'.html':'text/html', '.js':'text/javascript', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json', '.png':'image/png'};

test('paste one name per line in KOC, Toss, Americano, Split Toss and roster editing', async t => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved = path.resolve(root, '.' + requestPath);
    if (!resolved.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
    try {res.writeHead(200, {'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream'})
      .end(fs.readFileSync(resolved));}
    catch (e) {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());

  async function pageFor(format, lang = 'nl', contextOptions = {}){
    const context = await browser.newContext(contextOptions);
    t.after(() => context.close());
    const page = await context.newPage();
    await page.goto(origin);
    if (lang === 'en') await page.locator('#langSwitch .lang-btn[data-lang="en"]').click();
    await page.locator('.format-btn[data-format="' + format + '"]').click();
    return page;
  }
  async function useList(page, id, names){
    const panel = page.locator('#' + id);
    if (await page.locator('#bulkDrawerLayer').isVisible())
      await page.locator('#bulkDrawerCancel').click();
    await panel.locator('.bulk-entry-trigger').click();
    await page.locator('#bulkDrawerText').fill(names);
    await page.locator('#bulkDrawerApply').click();
    return await page.locator('#bulkDrawerLayer').isVisible()
      ? page.locator('#bulkDrawerError') : panel.locator('.bulk-entry-status');
  }

  const koc = await pageFor('koc');
  assert.equal(await koc.locator('#bulkDrawerLayer').isVisible(), false);
  await koc.locator('#kocRoster .koc-player input[type=text]').first().fill('Handmatig');
  await koc.locator('#bulkKoc .bulk-entry-trigger').click();
  await koc.locator('#bulkDrawerText').fill('Tijdelijk\nNog niet overnemen');
  await koc.locator('#bulkDrawerCancel').click();
  assert.equal(await koc.locator('#kocRoster .koc-player input[type=text]').first().inputValue(), 'Handmatig',
    'closing the drawer leaves prefilled names untouched');
  const sixteen = Array.from({length:16}, (_, i) => 'Deelnemer ' + (i + 1));
  await useList(koc, 'bulkKoc', '  ' + sixteen.slice(0, 8).join('\r\n') + '\r\n\r\n' + sixteen.slice(8).join('\n'));
  assert.deepEqual(await koc.locator('#kocRoster .koc-player input[type=text]').evaluateAll(els => els.map(el => el.value)), sixteen);
  assert.equal(await koc.locator('#kocRoster .koc-player.absent').count(), 0);
  await koc.locator('#kocRoll').click();
  assert.equal(await koc.locator('#kocResult .koc-court').count(), 4);

  await useList(koc, 'bulkKoc', sixteen.slice(0,15).join('\n'));
  assert.equal(await koc.locator('#kocRoster .koc-player.absent').count(), 1);
  assert.equal(await koc.locator('#kocResult .koc-court').count(), 0, 'paste invalidates old assignment');
  assert.equal(await koc.locator('#kocRoster .koc-player').nth(15).locator('input[type=text]').inputValue(), '');
  await koc.locator('#kocRoll').click();
  assert.equal(await koc.locator('#kocResult .koc-court').count(), 4);

  const overCapacity = await useList(koc, 'bulkKoc', sixteen.concat(['Extra']).join('\n'));
  assert.match(await overCapacity.textContent(), /17 namen/);
  assert.equal(await koc.locator('#kocRoster .koc-player').first().locator('input[type=text]').inputValue(), 'Deelnemer 1');
  await koc.locator('#bulkDrawerAdjustCount').check();
  await koc.locator('#bulkDrawerApply').click();
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),20);
  assert.equal(await koc.locator('#bulkKoc .bulk-undo').isVisible(),true);
  await koc.locator('#bulkKoc .bulk-undo').click();
  assert.equal(await koc.locator('#kocRoster .koc-player').count(),16);
  const overLength = await useList(koc, 'bulkKoc', 'L'.repeat(51));
  assert.match(await overLength.textContent(), /50 tekens/);
  assert.equal(await koc.locator('#kocRoster .koc-player').first().locator('input[type=text]').inputValue(), 'Deelnemer 1');

  const duplicate = await useList(koc, 'bulkKoc', 'A\nB\nC\nA');
  assert.match(await duplicate.textContent(), /regels 1 en 4/);
  assert.equal(await koc.locator('#kocRoll').isEnabled(), true, 'invalid paste does not modify the existing valid roster');
  assert.equal(await koc.locator('#kocDupError').isVisible(), false);
  await useList(koc, 'bulkKoc', sixteen.join('\n'));
  assert.equal(await koc.locator('#kocRoll').isEnabled(), true);
  await koc.locator('#kocRoll').click();
  await koc.locator('#kocBack').click();
  await koc.locator('#confirmYesBtn').click();
  await koc.locator('.format-btn[data-format="koc"]').click();
  await koc.locator('#bulkKoc .bulk-entry-trigger').click();
  assert.equal(await koc.locator('#bulkDrawerText').inputValue(), '',
    'starting over clears previously pasted personal names');
  await koc.locator('#bulkDrawerCancel').click();

  // Ordinary Toss: the player count stays authoritative and blank remainder
  // continues to receive normal placeholder names.
  const toss = await pageFor('toss');
  await toss.locator('#playerCountInput').fill('8');
  await toss.locator('#continueTo2').click();
  const eight = ['Anne','Bas','Cleo','Dirk','Eva','Fred','Gijs','Hanna'];
  await useList(toss, 'bulkSingle', ' Anne \n\nBas\nCleo\nDirk\nEva\nFred');
  assert.deepEqual(await toss.locator('#namesGrid .name-field input').evaluateAll(els => els.map(el => el.value)), eight.slice(0,6).concat(['','']));
  const tooMany = await useList(toss, 'bulkSingle', eight.concat(['Iris']).join('\n'));
  assert.match(await tooMany.textContent(), /9 namen/);
  assert.equal(await toss.locator('#namesGrid .name-field input').first().inputValue(), 'Anne');
  await toss.locator('#bulkDrawerAdjustCount').check();
  await toss.locator('#bulkDrawerApply').click();
  assert.equal(await toss.locator('#namesGrid .name-field').count(),9);
  assert.equal(await toss.locator('#playerCountInput').inputValue(),'9');
  await toss.locator('#bulkSingle .bulk-undo').click();
  assert.equal(await toss.locator('#namesGrid .name-field').count(),8);
  assert.equal(await toss.locator('#namesGrid .name-field input').first().inputValue(),'Anne');
  await useList(toss, 'bulkSingle', eight.join('\n'));
  await toss.locator('#generateBtn').click();
  assert.equal(await toss.locator('#panel3').isVisible(), true);

  // Existing scores/player identity remain untouched when appending through
  // the edit screen; duplicate new names are caught by existing validation.
  await toss.locator('#editPlayersBtn').click();
  const beforeEdit = await toss.locator('#editRosterList .edit-row input').evaluateAll(els => els.map(el => el.value));
  await useList(toss, 'bulkEditSingle', 'Iris\nJoris');
  assert.deepEqual((await toss.locator('#editRosterList .edit-row input').evaluateAll(els => els.map(el => el.value))).slice(0,8), beforeEdit);
  assert.equal(await toss.locator('#editRosterList .edit-row').count(), 10);
  const duplicateEdit = await useList(toss, 'bulkEditSingle', 'Anne');
  assert.match(await duplicateEdit.textContent(), /staat al/);
  assert.equal(await toss.locator('#editRosterList .edit-row').count(),10,'duplicate paste is atomic');
  await toss.locator('#bulkDrawerCancel').click();
  assert.equal(await toss.locator('#editError').isVisible(), false);
  await toss.locator('#editApplyBtn').click();
  assert.equal(await toss.locator('#panel3').isVisible(), true);
  await toss.locator('#editPlayersBtn').click();
  assert.equal(await toss.locator('#editRosterList .edit-row').count(), 10);

  const americano = await pageFor('americano', 'en');
  await americano.locator('#playerCountInput').fill('8');
  await americano.locator('#continueTo2').click();
  const englishStatus = await useList(americano, 'bulkSingle', eight.join('\n'));
  assert.match(await englishStatus.textContent(), /8 names applied/);
  assert.match(await americano.locator('#bulkSingle .bulk-entry-trigger').innerText(), /Paste names/);
  await americano.locator('#generateBtn').click();
  assert.equal(await americano.locator('#panel3').isVisible(), true);

  // Split Toss has independent tools and per-level names, including Platinum.
  const split = await pageFor('splitToss');
  await split.locator('#beginnerCountInput').fill('4');
  await split.locator('#ervarenCountInput').fill('4');
  await split.locator('#gevorderdCountInput').fill('4');
  await split.locator('#continueTo2').click();
  assert.equal(await split.locator('#namesGridBeginner .name-field').count(),4);
  assert.equal(await split.locator('#namesGridErvaren .name-field').count(),4);
  assert.equal(await split.locator('#namesGridGevorderd .name-field').count(),4);
  await useList(split,'bulkBeginner','Z1\nZ2\nZ3\nZ4');
  await useList(split,'bulkErvaren','G1\nG2\nG3\nG4');
  await useList(split,'bulkGevorderd','P1\nP2\nP3\nP4');
  assert.deepEqual(await split.locator('#namesGridGevorderd input').evaluateAll(els => els.map(el => el.value)), ['P1','P2','P3','P4']);
  const splitDuplicate = await useList(split,'bulkErvaren','Z1\nG2\nG3\nG4');
  assert.match(await splitDuplicate.textContent(), /andere spelerslijst/);
  assert.equal(await split.locator('#namesGridErvaren input').first().inputValue(),'G1');
  await useList(split,'bulkErvaren','G1\nG2\nG3\nG4');
  assert.equal(await split.locator('#step2DupError').isVisible(),false);
  await split.locator('#generateBtn').click();
  assert.equal(await split.locator('#panel3').isVisible(),true);
  await split.locator('#editPlayersBtn').click();
  await useList(split,'bulkEditBeginner','Nieuwe Z1\nNieuwe Z2');
  assert.equal(await split.locator('#editRosterListBeginner .edit-row').count(),6);
  assert.equal(await split.locator('#editRosterListErvaren .edit-row').count(),4);
  assert.equal(await split.locator('#editRosterListGevorderd .edit-row').count(),4);

  const mobile = await pageFor('koc','nl',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await useList(mobile,'bulkKoc','Jan\nPiet\nSam');
  assert.equal(await mobile.locator('#kocRoster .koc-player.absent').count(),13);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
});
