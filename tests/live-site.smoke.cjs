// Post-merge validation of the actual GitHub Pages release, in a fresh browser.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const url=process.env.PADEL_SITE_URL;
  if(!url)throw new Error('PADEL_SITE_URL is required');
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    let published=false;
    for(let attempt=0;attempt<36;attempt++){
      await page.goto(url,{waitUntil:'networkidle'});
      if(await page.locator('#appVersion').textContent()==='v2.3.0'){published=true;break;}
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    assert.ok(published,'GitHub Pages must serve v2.3.0');
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
      await page.locator('#mastheadBack').click();
    }
    await ctx.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>[...document.querySelectorAll('.mode-illustration')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.locator('#panel0').isVisible(),true);
    assert.equal(await page.locator('.format-btn').first().evaluate(el=>getComputedStyle(el).display),'grid');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({url,version:'v2.3.0',modes:4,desktop:true,mobile:true,score:'26–6',freshInstall:true,offline:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
