// Post-merge validation of the public Cloudflare planner and GitHub Pages move notice, in a fresh browser.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const url=process.env.PADEL_SITE_URL;
  if(!url)throw new Error('PADEL_SITE_URL is required');
  const expectedWorker=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  const expectedPage=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const expectedTheme=fs.readFileSync(path.join(__dirname,'../visual-theme.css'),'utf8');
  const expectedRounds=fs.readFileSync(path.join(__dirname,'../round-planner.js'),'utf8');
  const artworkFiles=['mode-koc.svg','mode-split.svg','mode-split-en.svg'];
  const expectedArtwork=artworkFiles.map(file=>fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'));
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    let published=false;
    for(let attempt=0;attempt<36;attempt++){
      const [worker,document,rounds,theme,...artwork]=await Promise.all([
        ctx.request.get(new URL('./sw.js',url).href),
        ctx.request.get(url),
        ctx.request.get(new URL('./round-planner.js',url).href),
        ctx.request.get(new URL('./visual-theme.css',url).href),
        ...artworkFiles.map(file=>ctx.request.get(new URL('./assets/'+file,url).href))
      ]);
      const assetsMatch=await Promise.all(artwork.map(async (response,index)=>response.ok()&&await response.text()===expectedArtwork[index]));
      if(worker.ok()&&document.ok()&&rounds.ok()&&await rounds.text()===expectedRounds&&await worker.text()===expectedWorker&&
        (await document.text()).replace(/<head><base href="\/">.*?<meta name="referrer" content="no-referrer">/,'<head>')===expectedPage&&theme.ok()&&await theme.text()===expectedTheme&&assetsMatch.every(Boolean)){
        published=true;
        break;
      }
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    assert.ok(published,'Cloudflare must serve the current page, worker, stylesheet and mode artwork');
    await page.goto(url,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#appVersion').textContent(),'v3.4.1');
    await page.waitForFunction(()=>document.querySelectorAll('.mode-illustration').length===4&&[...document.querySelectorAll('.mode-illustration')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--teal-900').trim()),'#193B57');
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const score=await(await ctx.request.get(new URL('./assets/mode-americano.svg',url).href)).text();
    assert.ok(score.includes('26–6'));
    const screenshots=process.env.PADEL_SCREENSHOT_DIR;
    if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'live-desktop.png'),fullPage:true});}
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(screenshots)await page.screenshot({path:path.join(screenshots,'live-mobile.png'),fullPage:true});
    for(const mode of ['toss','koc','americano','splitToss']){
      await page.locator('.format-btn[data-format="'+mode+'"]').click();
      await page.waitForFunction(()=>{const img=document.querySelector('#formatMark img');return img&&img.complete&&img.naturalWidth>0;});
      assert.equal(await page.locator('#brandEyebrow').isVisible(),true);
      if(mode==='koc')assert.equal(await page.locator('.brand-copy #metaStrip').textContent(),'16 spelers · 4 banen');
      else assert.equal(await page.getByRole('button',{name:'Namen',exact:true}).isEnabled(),true);
      await page.locator('#mastheadBack').click();
    }
    await ctx.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>[...document.querySelectorAll('.mode-illustration')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.locator('#panel0').isVisible(),true);
    assert.equal(await page.locator('.format-btn').first().evaluate(el=>getComputedStyle(el).display),'grid');
    assert.equal(await page.evaluate(()=>typeof PadelRounds.nextKocRound),'function');
    assert.equal(await page.evaluate(()=>typeof TossCardDrag),'function');
    const tossContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const tossPage=await tossContext.newPage();
    tossPage.on('pageerror',error=>errors.push(error.message));
    await tossPage.goto(url,{waitUntil:'networkidle'});
    await tossPage.locator('.format-btn[data-format="toss"]').click();
    await tossPage.locator('#continueTo2').click();
    const link=tossPage.locator('#namesGrid .duo-link').first();
    await link.tap();assert.equal(await link.getAttribute('aria-pressed'),'true');
    await link.tap();assert.equal(await link.getAttribute('aria-pressed'),'false');
    const firstOptions=tossPage.locator('#tossStartOptions');
    assert.equal(await firstOptions.getAttribute('open'),null);
    await firstOptions.locator('summary').tap();
    await tossPage.locator('#tossStartTime').fill('11:00');
    await tossPage.locator('#tossCourtNumber0').fill('2');
    await tossPage.locator('#tossCourtNumber1').fill('3');
    await firstOptions.locator('[data-player="15"][data-choice="Play"]').check();
    await link.tap();
    await tossPage.locator('#namesGrid .duo-link').nth(2).tap();
    assert.equal(await firstOptions.locator('[data-choice="Pair"]').count(),0);
    await tossPage.locator('#generateBtn').tap();
    assert.equal(await tossPage.locator('#scheduleRound1 .round-time').innerText(),'11:00\u201311:20');
    assert.deepEqual(await tossPage.locator('#scheduleRound1 .court-label').allTextContents(),['Baan 2','Baan 3']);
    const downloaded=tossPage.waitForEvent('download');
    await tossPage.locator('.action-bar:visible summary').click();
    await tossPage.locator('#saveBtn').tap();
    const saved=JSON.parse(fs.readFileSync(await (await downloaded).path(),'utf8'));
    const rounds=saved.state.pools[0].rounds;
    assert.ok(rounds[0].courts.some(c=>c.team1.concat(c.team2).includes('Speler 16')));
    const openingCourts=[['Speler 1','Speler 2'],['Speler 3','Speler 4']].map(pair=>
      rounds[0].courts.findIndex(c=>[c.team1,c.team2].some(team=>pair.every(name=>team.includes(name)))));
    assert.deepEqual(openingCourts.slice().sort(),[0,1]);
    for(let i=1;i<rounds.length;i++)assert.ok(rounds[i].resting.every(name=>!rounds[i-1].resting.includes(name)));
    await tossPage.locator('#rerollBtn').tap();
    assert.match(await tossPage.locator('#rerollStatus').innerText(),/ronde 1/);
    await tossPage.evaluate(()=>navigator.serviceWorker.ready);
    await tossPage.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await tossContext.setOffline(true);
    const pdfDownload=tossPage.waitForEvent('download');
    await tossPage.locator('.action-bar:visible summary').click();
    await tossPage.locator('#pdfBtn').tap();
    const pdf=fs.readFileSync(await (await pdfDownload).path());
    assert.match(pdf.toString('latin1'),/^%PDF-/);
    await tossContext.close();
    const fresh=await browser.newContext({serviceWorkers:'block'}),alias=await fresh.newPage();
    for(const version of ['2.8','3','3.1']){
      await alias.goto(new URL('?preview='+version+'&lang=en#court',url).href);
      assert.equal(await alias.locator('#appVersion').innerText(),'v3.4.1');
      assert.equal(new URL(alias.url()).search,'?lang=en');assert.equal(new URL(alias.url()).hash,'#court');
      assert.equal(await alias.locator('#pollHome').isVisible(),true);assert.equal(await alias.locator('#versionLink,#entryVersionLink').count(),0);
    }
    await alias.locator('.format-btn[data-format=americano]').click();
    await alias.locator('#continueTo2').click();await alias.locator('#generateBtn').click();await alias.locator('#presentBtn').click();
    assert.ok(await alias.locator('#liveCurrent').evaluate(current=>{
      const next=document.querySelector('#liveUpcoming');return !next.hidden && next.getBoundingClientRect().top>=current.getBoundingClientRect().bottom;
    }));
    const legacy=process.env.PADEL_LEGACY_SITE_URL;
    let noticeLive=false;
    for(let i=0;i<60;i++){
      const res=await fresh.request.get(legacy);
      if(res.ok() && (await res.text()).includes('De Padel Planner is verhuisd')){noticeLive=true;break;}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
    assert.ok(noticeLive,'GitHub Pages must publish the move notice');
    for(const [oldPath,next] of [['?preview=3','/'],['beheer','/beheer'],['aanmelden.html?lang=en','/aanmaken?lang=en'],['kijken.html#bewaard','/kijken.html#bewaard']]){
      await alias.goto(new URL(oldPath,legacy).href,{waitUntil:'domcontentloaded'});
      await alias.getByRole('heading',{name:'De Padel Planner is verhuisd'}).waitFor();
      assert.equal(await alias.locator('.format-btn').count(),0);
      assert.equal(await alias.locator('#open').getAttribute('href'),new URL(next,url).href);
      await alias.waitForURL(new URL(next,url).href);
    }
    await fresh.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({url,version:'v3.4.1',modes:4,desktop:true,mobile:true,score:'26-6',freshInstall:true,offline:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
