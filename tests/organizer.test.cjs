const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');

async function setup(t){
  const {localSessionApp}=await import('../sessions/local.mjs'), {api}=await import('../sessions/api.mjs');
  const app=await localSessionApp();t.after(()=>app.close());
  const password=randomBytes(16).toString('hex'), now=Date.now();
  const settings={title:'Clubavond',format:'koc',date:new Date(now).toISOString().slice(0,10),start:'21:00',end:'23:00',courts:4,capacity:16};
  async function send(path,body,headers={},secret=password,time=now){
    const req=new Request('https://club.test/api/'+path,{method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const res=await api(req,app.DB,time,secret);
    return {status:res.status,data:await res.json(),headers:res.headers};
  }
  async function login(){
    const res=await send('polls/hub/login',{password});
    assert.equal(res.status,200);const cookie=res.headers.get('Set-Cookie');
    for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(flag));
    return {Cookie:cookie.split(';')[0]};
  }
  return {app,send,login,password,settings,now};
}
test('central login is separate from poll links, expires, rotates and revokes sessions on logout',async t=>{
  const {app,send,login,password,settings,now}=await setup(t);
  const poll=(await send('polls',{settings,password:randomBytes(15).toString('hex')})).data;
  for(const path of ['polls/hub','polls/hub/sessions']){
    assert.equal((await send(path)).status,401);
    assert.equal((await send(path,undefined,{Authorization:'Bearer '+poll.token})).status,401);
  }
  assert.equal((await send('polls/hub/login',{password}, {}, '')).status,503);
  assert.equal((await send('polls/hub/login',{password:'a different password'})).status,401);
  assert.equal((await send('polls/hub/login',{password},{Origin:'https://outside.test'})).status,403);
  const auth=await login();
  assert.equal((await send('polls/hub/status',undefined,auth)).status,200);
  assert.equal((await send('polls/hub/status',undefined,auth,password+'changed')).status,401);
  assert.equal((await send('polls/hub/status',undefined,auth,password,now+12*3600000)).status,401);
  assert.notEqual(app.sql.prepare('SELECT token FROM organizer_logins').get().token,auth.Cookie.split('=')[1]);
  const out=await send('polls/hub/logout',{},auth);
  assert.match(out.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal((await send('polls/'+poll.id+'/admin',undefined,auth)).status,401);
  assert.equal((await send('polls/'+poll.id+'/admin',undefined,{Authorization:'Bearer '+poll.token})).status,200);
  for(let i=0;i<8;i++)await send('polls/hub/login',{password:'incorrect'},{'CF-Connecting-IP':'test-ip'});
  assert.equal((await send('polls/hub/login',{password},{'CF-Connecting-IP':'test-ip'})).status,429);
});
test('all poll series and separate sessions can be managed; the overview sends only card data',async t=>{
  const {app,send,login,settings,now}=await setup(t);
  const auth=await login();
  const first=(await send('polls',{settings,password:randomBytes(16).toString('hex')})).data;
  assert.equal((await send('polls',{settings,central:true})).status,401);
  const second=await send('polls',{settings:{...settings,title:'Toss'},central:true},auth);
  assert.equal(second.status,201);assert.deepEqual(Object.keys(second.data),['id']);
  const path='polls/'+first.id+'/admin';
  const edit=await send(path,{action:'entry',revision:1,name:'Private assessment',place:'review',position:1,standing:true},auth);
  assert.equal(edit.status,200);assert.equal(edit.data.entries[0].standing,true);
  assert.equal((await send(path,{action:'plan',revision:2},auth)).data.phase,'planning');
  assert.equal((await send('polls/'+first.id)).data.groups,undefined);
  const index=await send('polls/hub',undefined,auth);
  assert.equal(index.data.items.length,2);assert.equal(index.data.items.find(p=>p.id===first.id).phase,'planning');
  for(const marker of ['Private assessment','plannerKey','person','entries','viewCode'])assert.ok(!JSON.stringify(index.data).includes(marker));
  assert.match(index.headers.get('cache-control'),/no-store/);
  const id='00000000-0000-4000-8000-000000000001',code='TESTVIEW';
  const doc=JSON.stringify({state:{format:'koc'},view:{title:'Zaterdagavond'}});
  app.sql.prepare('INSERT INTO sessions VALUES (?,?,1,?,?,0,?,?,?)').run(id,'owner-hash','view','epoch',now+3600000,now,doc);
  app.sql.prepare('INSERT INTO links VALUES (?,?,?,?,?)').run(code,id,'view','','');
  const standalone=await send('polls/hub/sessions',undefined,auth);
  assert.equal(standalone.status,200);assert.equal(standalone.data.items[0].title,'Zaterdagavond');
  assert.equal((await send('manage/'+id,undefined,{Authorization:'Bearer '+first.token})).status,401);
  assert.equal((await send('manage/'+id,undefined,auth)).data.state.format,'koc');
  assert.equal((await send('manage/'+id,{action:'close',revision:1},auth)).data.closed,true);
  // A published poll already contains the session; there must be only one card.
  app.sql.prepare("UPDATE signup_polls SET document=json_set(document,'$.viewCode',?) WHERE id=?").run(code,first.id);
  assert.deepEqual((await send('polls/hub/sessions',undefined,auth)).data.items,[]);
  for(let i=0;i<65;i++)app.sql.prepare('INSERT INTO signup_polls SELECT ?,series,revision,expires,document FROM signup_polls WHERE id=?').run(i.toString(16).padStart(14,'0'),first.id);
  const a=(await send('polls/hub',undefined,auth)).data,b=(await send('polls/hub?after='+a.next,undefined,auth)).data;
  assert.equal(a.items.length,64);assert.equal(b.next,null);assert.equal(new Set([...a.items,...b.items].map(p=>p.id)).size,67);
});
