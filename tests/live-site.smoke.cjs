// Post-merge validation of the actual GitHub Pages release, in a fresh browser.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const url=process.env.PADEL_SITE_URL;
  if(!url)throw new Error('PADEL_SITE_URL is required');
  const expectedWorker=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  const expectedPage=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
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
      const [worker,document,rounds,...artwork]=await Promise.all([
        ctx.request.get(new URL('./sw.js',url).href),
        ctx.request.get(url),
        ctx.request.get(new URL('./round-planner.js',url).href),
        ...artworkFiles.map(file=>ctx.request.get(new URL('./assets/'+file,url).href))
      ]);
      const assetsMatch=await Promise.all(artwork.map(async (response,index)=>response.ok()&&await response.text()===expectedArtwork[index]));
      if(worker.ok()&&document.ok()&&rounds.ok()&&await rounds.text()===expectedRounds&&await worker.text()===expectedWorker&&
        await document.text()===expectedPage&&assetsMatch.every(Boolean)){
        published=true;
        break;
      }
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    assert.ok(published,'GitHub Pages must serve the current page, worker and mode artwork');
    await page.goto(url,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#appVersion').textContent(),'v2.6.2');
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
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({url,version:'v2.6.2',modes:4,desktop:true,mobile:true,score:'26-6',freshInstall:true,offline:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
