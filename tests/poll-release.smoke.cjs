// Verify the Cloudflare release without creating a poll or touching a real signup.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const base=process.env.PADEL_POLL_SITE_URL;
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    let live=false;
    for(let i=0;i<36;i++){
      await page.goto(base);
      if(await page.locator('#appVersion').innerText()==='v3.3.0' && await page.locator('#pollHome').isVisible()){live=true;break;}
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    assert.ok(live,'the production planner serves 3.3');
    const manage=page.locator('footer .organizer-button');
    const homeBox=await manage.boundingBox();
    assert.ok(homeBox && homeBox.height>=44);
    await page.locator('#pollHome').click();
    assert.equal(await page.locator('nav .brand').innerText(),'Padel Planner');
    await page.getByLabel('Jouw naam',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Naam van de avond',{exact:true}).inputValue(),'Toss');
    const helpText=async label=>page.locator('#'+await page.getByLabel(label,{exact:true}).getAttribute('aria-describedby')).innerText();
    assert.match(await helpText('Jouw naam'),/Werner V\./);
    assert.equal(await page.getByLabel('Wachtwoord',{exact:true}).getAttribute('minlength'),'6');
    assert.match(await helpText('Wachtwoord'),/Alleen je naam moet uniek zijn/);
    await page.locator('#language').tap();
    await page.getByLabel('Your name',{exact:true}).waitFor();
    assert.match(await helpText('Your name'),/If Werner is taken/);
    assert.match(await helpText('Password'),/Only your name needs to be unique/);
    await page.locator('#language').tap();
    await page.getByRole('link',{name:'Mijn polls openen'}).tap();
    await page.getByRole('heading',{name:'Mijn polls',exact:true}).waitFor();
    await page.getByLabel('Jouw naam',{exact:true}).waitFor();
    assert.equal((await page.request.get(new URL('/api/polls/mine',base).href)).status(),401);
    await page.locator('#language').tap();
    await page.getByRole('button',{name:'Open my polls'}).waitFor();
    await page.getByLabel('Your name',{exact:true}).waitFor();
    await page.locator('#language').tap();
    await page.getByRole('link',{name:'Mijn eerste poll aanmaken'}).tap();
    await page.getByLabel('Speelvorm',{exact:true}).waitFor();
    for(const [format,file] of [['toss','toss'],['koc','koc'],['americano','americano'],['splitToss','split']]){
      await page.getByLabel('Speelvorm',{exact:true}).selectOption(format);
      await page.waitForFunction(file=>{const img=document.querySelector('#art');return img.src.endsWith('/mode-'+file+'.svg') && img.complete && img.naturalWidth>0;},file);
    }
    const missing=await page.request.get(new URL('/api/polls/00000000000000',base).href);
    assert.equal(missing.status(),404);assert.deepEqual(await missing.json(),{error:'missing'});
    const signupBox=await manage.boundingBox();
    assert.ok(signupBox && signupBox.height>=44);
    await manage.tap();
    await page.getByRole('heading',{name:'Avonden beheren',exact:true}).waitFor();
    assert.equal(await page.title(),'Avonden beheren · Padel Planner');
    assert.equal(await page.locator('#phase').isVisible(),false);
    await page.locator('#language').tap();
    await page.getByRole('heading',{name:'Manage events',exact:true}).waitFor();
    assert.equal(await page.title(),'Manage events · Padel Planner');
    await page.locator('#language').tap();
    await page.getByLabel('Algemeen beheerwachtwoord',{exact:true}).waitFor();
    assert.equal((await page.request.get(new URL('/api/polls/hub',base).href)).status(),401);
    await page.goto(base);
    await page.locator('.format-btn[data-format=toss]').tap();
    await page.locator('#continueTo2').tap();await page.locator('#generateBtn').tap();
    await page.getByRole('button',{name:'Schema delen'}).filter({visible:true}).tap();
    assert.equal(await page.getByLabel('Speeldatum',{exact:true}).inputValue(),'');
    await page.getByLabel('Jouw naam',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Inplannen en delen'}).waitFor();
    console.log('Cloudflare production serves Toss 3.3, the four mode illustrations and the protected organizer dashboard.');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
