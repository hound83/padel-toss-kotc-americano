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
const mime = {'.html':'text/html','.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml',
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
  t.after(() => new Promise(resolve => (server.closeAllConnections(), server.close(resolve))));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());

  const context = await browser.newContext({viewport:{width:1280,height:900}});
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('.format-btn[data-format="koc"]').click();
  assert.equal(await page.locator('.brand-copy #metaStrip').textContent(),'16 spelers · 4 banen');
  assert.equal(await page.locator('#stepsNav').isVisible(),false);
  assert.equal(await page.locator('#kocRoster .koc-player').count(),16);
  assert.equal(await page.locator('.koc-entry-marker').count(),4);
  for (let idx=12;idx<16;idx++){
    await page.locator('.koc-player').nth(idx).locator('.koc-entry-marker').click();
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
  assert.ok(cards.every(court=>!court.includes('Voorkeur voor baan 1')), 'incoming markers are private setup-only labels');

  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await page.locator('#kocCopy').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied,/King of the Court/);
  assert.match(copied,/Baan 4/);
  assert.ok(!copied.includes('Voorkeur voor baan 1'),'copying for WhatsApp never reveals incoming markers');

  const downloadEvent = page.waitForEvent('download');
  await page.locator('#kocSave').click();
  const download = await downloadEvent;
  const savedPath = await download.path();
  const saved = JSON.parse(fs.readFileSync(savedPath,'utf8'));
  assert.equal(saved.state.koc.incomingEnabled,true);
  assert.equal(saved.state.koc.roster.slice(12,16).filter(p=>p.incoming).length,4);

  // The fifth player is absent; of four entrants one must now start on court 2.
  await page.locator('.koc-player').nth(4).locator('input[type=checkbox]').first().uncheck();
  assert.equal(await page.locator('#metaStrip').textContent(),'15 spelers · 4 banen');
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
  assert.equal(await page.locator('.koc-entry-marker[aria-pressed=true]').count(),4);
  assert.equal(await page.locator('#kocRoster .koc-player.absent').count(),1);
  assert.equal(await page.locator('#kocLowestHeading').innerText(),'Voorkeur voor baan 1');

  for(const marker of await page.locator('.koc-entry-marker').all()) await marker.click();
  assert.equal(await page.locator('.koc-entry-marker[aria-pressed=true]').count(),0);
  await page.locator('#kocRoll').click();
  cards = await courtNames();
  assert.ok(cards[0].includes('Speler 1'));
  assert.ok(cards[1].includes('Speler 2'));

  // Importing a saved KOC schedule restores its four incoming flags.
  await page.locator('#loadFileInput').setInputFiles(savedPath);
  await page.locator('.koc-entry-marker[aria-pressed=true]').first().waitFor({state:'visible'});
  assert.equal(await page.locator('.koc-entry-marker[aria-pressed=true]').count(),4);

  // The English labels also work when selected from the visible mode picker.
  const english = await browser.newContext();
  t.after(() => english.close());
  const englishPage = await english.newPage();
  await englishPage.goto(origin);
  await englishPage.locator('#langSwitch .lang-btn[data-lang="en"]').click();
  await englishPage.locator('.format-btn[data-format="koc"]').click();
  assert.equal(await englishPage.locator('#kocLowestHeading').innerText(),'Court 1 preference');
  assert.equal(await englishPage.getByRole('radio',{name:'Starting lineup'}).isChecked(),true);
  assert.equal(await englishPage.getByRole('button',{name:'+ Add a waiting pair'}).isVisible(),true);
  assert.equal(await englishPage.locator('.koc-entry-marker').count(),4);

  // Responsive mobile field: four markers remain usable without sideways scroll.
  const mobile = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  t.after(() => mobile.close());
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin);
  await mobilePage.locator('.format-btn[data-format="koc"]').click();
  assert.equal(await mobilePage.locator('.koc-entry-marker').count(),4);
  await mobilePage.locator('.koc-player').nth(12).locator('.koc-entry-marker').click();
  assert.equal(await mobilePage.locator('.koc-entry-marker[aria-pressed=true]').count(),1);
  const overflows = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.equal(overflows,false,'no horizontal overflow at a 390px mobile viewport');


  await mobilePage.locator('.koc-entry-marker[aria-pressed=true]').tap();
  await mobilePage.locator('#kocWaitingToggle').tap();
  assert.equal(await mobilePage.locator('#kocWaitingHeading').innerText(),'Wachten in ronde 1');
  assert.equal(await mobilePage.locator('#kocRoster .koc-player').count(),18);
  const waitingRows=mobilePage.locator('#kocRoster #kocWaitingFields .koc-player');
  const lowestRows=mobilePage.locator('#kocRoster .koc-player:has(.koc-entry-marker)');
  assert.deepEqual(await waitingRows.locator('input[type=text]').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),['Speler 17','Speler 18']);
  assert.deepEqual(await lowestRows.locator('input[type=text]').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),['Speler 13','Speler 14','Speler 15','Speler 16']);
  const names=Array.from({length:18},(_,i)=>'Deelnemer '+(i+1));
  await mobilePage.locator('#bulkKoc .bulk-entry-trigger').tap();
  await mobilePage.locator('#bulkDrawerText').fill(names.join('\n'));
  await mobilePage.locator('#bulkDrawerApply').tap();
  assert.equal(await mobilePage.locator('#bulkDrawerLayer').isVisible(),false);
  for(const marker of await lowestRows.locator('.koc-entry-marker').all()){
    if(await marker.getAttribute('aria-pressed')==='false') await marker.tap();
  }
  const attendees=mobilePage.locator('#kocRoster .koc-player > input[type=checkbox]');
  await attendees.nth(17).uncheck();
  assert.equal(await mobilePage.locator('#kocWaitingError').isVisible(),true);
  assert.equal(await mobilePage.locator('#kocRoll').isEnabled(),false);
  await attendees.nth(16).uncheck();
  await mobilePage.locator('#kocRoll').tap();
  const waitingCard=mobilePage.locator('#kocResult .koc-waiting-card');
  assert.equal(await waitingCard.count(),0);
  await attendees.nth(16).check();
  await attendees.nth(17).check();
  await mobilePage.locator('#kocRoll').tap();
  const courts=mobilePage.locator('#kocResult .koc-court:not(.koc-waiting-card)');
  const firstDraw=await courts.locator('li').allTextContents();
  await mobilePage.locator('#kocRoll').tap();
  const courtPlayers=await courts.locator('li').allTextContents();
  const waitingPlayers=await waitingCard.locator('li').allTextContents();
  assert.notDeepEqual(courtPlayers,firstDraw,'a reroll draws another starting assignment');
  assert.equal(await courts.count(),4);
  assert.equal(courtPlayers.length,16);
  assert.deepEqual(waitingPlayers,['Deelnemer 17','Deelnemer 18']);
  assert.deepEqual((await courts.last().locator('li').allTextContents()).sort(),names.slice(12,16));
  assert.deepEqual([...courtPlayers,...waitingPlayers].sort(),names.slice().sort());
  assert.match(await waitingCard.innerText(),/verliezende duo op baan 1/);

  await mobile.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await mobilePage.locator('#kocCopy').tap();
  const waitingCopy=await mobilePage.evaluate(()=>navigator.clipboard.readText());
  assert.ok(waitingCopy.includes('Wachtduo bij de start: '+waitingPlayers.join(', ')));
  assert.match(waitingCopy,/verliezende duo op baan 1/);

  const waitingDownload=mobilePage.waitForEvent('download');
  await mobilePage.locator('#kocSave').tap();
  const waitingPath=await (await waitingDownload).path();
  await mobilePage.locator('#kocPresent').tap();
  const presented=mobilePage.locator('#liveKoc .koc-waiting-card');
  for(let i=0;i<5&&!await presented.isVisible();i++){
    await mobilePage.locator('#livePageNext').tap();
  }
  assert.equal(await presented.isVisible(),true);
  assert.deepEqual(await presented.locator('li').allTextContents(),waitingPlayers);
  assert.match(await presented.innerText(),/verliezende duo op baan 1/);
  await mobilePage.locator('#presentExit').tap();

  await mobilePage.reload();
  await mobilePage.locator('#resumeContinue').tap();
  assert.equal(await mobilePage.locator('#kocWaitingFields').isVisible(),true);
  assert.deepEqual(await waitingCard.locator('li').allTextContents(),waitingPlayers);
  await mobilePage.locator('#kocWaitingToggle').tap();
  assert.equal(await mobilePage.locator('#kocRoster .koc-player').count(),16);
  await mobilePage.locator('#loadFileInput').setInputFiles(waitingPath);
  await waitingCard.waitFor({state:'visible'});
  assert.equal(await mobilePage.locator('#kocWaitingFields').isVisible(),true);
  assert.deepEqual(await waitingCard.locator('li').allTextContents(),waitingPlayers);


  // A saved v2.5.0 starting assignment may use two different waiting slots.
  const legacy=JSON.parse(fs.readFileSync(waitingPath,'utf8'));
  const assignment=legacy.state.koc.assignment;
  [assignment[2],assignment[16]]=[assignment[16],assignment[2]];
  await mobilePage.locator('#loadFileInput').setInputFiles({
    name:'koc-v250.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))
  });
  await waitingCard.getByText('Deelnemer 3',{exact:true}).waitFor({state:'visible'});
  await mobilePage.locator('#kocRoll').tap();
  assert.deepEqual(await waitingCard.locator('li').allTextContents(),['Deelnemer 17','Deelnemer 18']);


  await mobilePage.locator('#kocCourtButtons [data-courts="3"]').tap();
  assert.equal(await mobilePage.locator('#kocLowestFields').isVisible(),true);
  assert.equal(await mobilePage.locator('#kocWaitingToggle').isVisible(),true);
  assert.equal(await mobilePage.locator('#kocRoster .koc-player').count(),14);
  assert.deepEqual(await lowestRows.locator('input[type=text]').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),
    ['Speler 9','Speler 10','Speler 11','Speler 12']);
  for(const marker of await lowestRows.locator('.koc-entry-marker').all()){
    if(await marker.getAttribute('aria-pressed')==='false') await marker.tap();
  }
  await mobilePage.locator('#kocRoll').tap();
  assert.deepEqual(await waitingCard.locator('li').allTextContents(),['Deelnemer 13','Deelnemer 14']);
  assert.deepEqual((await courts.last().locator('li').allTextContents()).sort(),names.slice(8,12).sort());

  const oneCourt=JSON.parse(fs.readFileSync(waitingPath,'utf8'));
  const savedKoc=oneCourt.state.koc;
  savedKoc.courts=1;
  savedKoc.roster=savedKoc.roster.slice(0,6);
  savedKoc.assignment={0:1,1:1,2:1,3:1,4:0,5:0};
  savedKoc.displayOrder=[0,1,2,3,4,5];
  await mobilePage.locator('#loadFileInput').setInputFiles({
    name:'koc-one-court.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oneCourt))
  });
  await waitingCard.getByText('Deelnemer 5',{exact:true}).waitFor({state:'visible'});
  assert.deepEqual(await waitingCard.locator('li').allTextContents(),['Deelnemer 5','Deelnemer 6']);
  assert.equal(await courts.count(),1);
  assert.equal(await mobilePage.locator('#kocLowestFields').isVisible(),false);
  assert.equal(await mobilePage.locator('#kocWaitingToggle').isVisible(),false);
  assert.equal(await lowestRows.count(),0);


  const longNames=['Annemarieke','Maximiliaan','Christiaan','Sebastiaan','Alexander','Frederique',
    'Valentijn','Marjolein','Charlotte','Marianne','Willemijn','Benjamin','Jonathan','Isabelle',
    'Anne-Marieke-Josefien','Maria-Alexandra','Johanna-Christina','Maximiliaan-Alexander'];
  const names50=Array.from({length:50},(_,i)=>longNames[i]||'Deelnemer '+(i+1));
  await page.locator('#kocMoreSelect').selectOption('12');
  await page.locator('#kocWaitingToggle').click();
  await page.locator('#bulkKoc .bulk-entry-trigger').click();
  await page.locator('#bulkDrawerText').fill(names50.join('\n'));
  await page.locator('#bulkDrawerApply').click();
  assert.equal(await page.locator('#bulkDrawerLayer').isVisible(),false);

  async function checkAlignedCourts(section,count,columns,namesSideBySide){
    const box=await section.evaluate(root=>{
      const grid=root.querySelector('.koc-courts');
      const waiting=root.querySelector('.koc-waiting-card');
      const bounds=element=>{
        const r=element.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};
      };
      return {
        grid:bounds(grid),waiting:bounds(waiting),
        cards:[...grid.children].filter(card=>!card.hidden).map(bounds),
        waitingNames:[...waiting.querySelectorAll('li')].map(bounds),
        namesFit:[...root.querySelectorAll('li')].every(li=>li.scrollWidth<=li.clientWidth+1)
      };
    });
    const close=(a,b)=>Math.abs(a-b)<=1;
    const firstRow=box.cards.filter(card=>close(card.top,box.cards[0].top));
    assert.equal(box.cards.length,count);
    assert.equal(firstRow.length,columns);
    assert.ok(close(firstRow[0].left,box.waiting.left)&&close(firstRow.at(-1).right,box.waiting.right));
    assert.ok(close(box.grid.left,box.waiting.left)&&close(box.grid.right,box.waiting.right));
    assert.ok(box.grid.bottom<box.waiting.top);
    assert.ok(box.cards.every(card=>close(card.width,box.cards[0].width)));
    assert.ok(box.namesFit,'long names fit inside their cards');
    assert.equal(close(box.waitingNames[0].top,box.waitingNames[1].top),namesSideBySide);
  }
  const screenshotDir=process.env.PADEL_SCREENSHOT_DIR;
  if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
  for(const [width,count,columns] of [[1280,2,2],[1280,3,3],[1280,4,4],[1280,5,4],[1280,8,4],[1280,12,4],[768,4,3],[390,4,1]]){
    await page.setViewportSize({width,height:900});
    if(count<=4)await page.locator('#kocCourtButtons [data-courts="'+count+'"]').click();
    else await page.locator('#kocMoreSelect').selectOption(String(count));
    await page.locator('#kocRoll').click();
    await checkAlignedCourts(page.locator('#kocResult'),count,columns,width>=768);
    if(screenshotDir&&count===4&&width!==768){
      await page.locator('#kocResult').screenshot({path:path.join(screenshotDir,'koc-waiting-'+width+'.png')});
    }
  }
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#kocPresent').click();
  await checkAlignedCourts(page.locator('#liveKoc'),4,4,true);
  if(screenshotDir)await page.locator('#liveKoc').screenshot({path:path.join(screenshotDir,'koc-waiting-presentation.png')});
  await page.locator('#presentExit').click();

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
    return keys.includes('padel-toss-americano-v263') &&
      !keys.includes('padel-toss-americano-v202');
  });
});
