import {centralLogin,organizerApi} from './organizer.mjs';
import {pollApi,pollCleanup} from './polls.mjs';
import {myPollsApi} from './poll-organizers.mjs';
import createRanking from '../ranking.js';
import {validPlayDate} from './poll-roster.mjs';

const WEEK = 7 * 86400000;
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const query = (db, sql, ...values) => db.prepare(sql).bind(...values);
const one = (db, sql, ...values) => query(db, sql, ...values).first();
const run = (db, sql, ...values) => query(db, sql, ...values).run();
const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const random = length => crypto.getRandomValues(new Uint8Array(length));
const newCode = () => Array.from(random(8), b => alphabet[b & 31]).join('');
const digest = async value => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const modes = ['view','group','personal'];
const fail = (status, error) => { throw Object.assign(new Error(error), {status}); };
const json = (body, status = 200) => Response.json(body, {status, headers:{
  'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff'
}});

function validDocument(doc){
  const state=doc?.state, view=doc?.view;
  if(!['toss','splitToss','americano','koc'].includes(state?.format) ||
     !Array.isArray(view?.rounds) || !Array.isArray(view.boards) || !view.playerIds ||
     typeof view.playerIds!=='object' || Object.keys(view.playerIds).length>256 ||
     !view.rounds.length || view.rounds.length>1000 || view.boards.length>8 ||
     (state.format==='koc' ? !state.koc : !Array.isArray(state.pools) || state.pools.length>8))fail(422,'document');
  if(state.format!=='koc'){
    if(!Array.isArray(state.activeRoster) || !Array.isArray(state.activeRosterLevels) || !state.scores || !state.laterAdditions)fail(422,'document');
    for(const pool of state.pools){
      if(!Array.isArray(pool.players) || pool.players.length>256 || !Array.isArray(pool.rounds) || pool.rounds.length>1000)fail(422,'document');
      const names=new Set(pool.players);
      for(const rd of pool.rounds){
        if(!Array.isArray(rd.courts) || rd.courts.length>48 || !rd.courts.every(c=>[c.team1,c.team2].every(team=>
          Array.isArray(team) && team.length===2 && team.every(n=>names.has(n)))))fail(422,'document');
      }
    }
  }
  for(const round of view.rounds){
    if(!Array.isArray(round.rows) || round.rows.length>96 || !round.rows.every(row=>
      typeof row.label==='string' && Array.isArray(row.teams) && row.teams.length<=2 &&
      row.teams.every(team=>Array.isArray(team) && team.every(name=>typeof name==='string' && Object.hasOwn(view.playerIds,name)))))fail(422,'document');
  }
  return {state,view};
}
function guest(row,link){
  const {state,view,planning}=JSON.parse(row.document);
  view.format=state.format;
  if(planning)view.playDate=planning.date;
  for(const rd of view.rounds)for(const match of rd.rows){
    if(row.closed || link.role==='view' || (link.role==='personal' && !match.teams.flat().some(n=>view.playerIds[n]===link.player))) delete match.ticket;
  }
  return {revision:row.revision,view:{...view,closed:!!row.closed,at:row.changed},role:link.role,player:link.player||null};
}
function applyScore(doc, entry, link){
  const {state,view}=doc;
  if(!Array.isArray(entry?.score) || entry.score.length!==2 ||
     !entry.score.every(x=>Number.isSafeInteger(x) && x>=0) || typeof entry.ticket!=='string' ||
     typeof entry.slot!=='string' || typeof entry.player!=='string')fail(422,'score');
  const round=view.rounds.find(rd=>rd.rows.some(row=>row.slot===entry.slot));
  const row=round?.rows.find(r=>r.slot===entry.slot);
  if(!row || !row.teams.flat().some(name=>view.playerIds[name]===entry.player) ||
     (link.role==='personal' && link.player!==entry.player))fail(403,'player');
  if(!row.ticket || row.ticket!==entry.ticket || row.score)fail(409,'changed');
  if(state.format==='koc'){
    const current=state.koc.guided && state.koc.roundPlan?.at(-1);
    const match=current?.matches?.find(m=>m.entryTicket===entry.ticket && current.number===round.n);
    if(!match || match.score.some(Number.isInteger))fail(409,'changed');
    if(entry.score[0]===entry.score[1])fail(422,'tie');
    match.score=[...entry.score];delete match.entryTicket;delete match.entryLineup;
  }else{
    if(!['americano','splitToss'].includes(state.format))fail(403,'readonly');
    const pool=state.pools.find(p=>p.resultsEnabled && p.rounds.some(rd=>rd.round===round.n &&
      rd.courts.some(c=>c.entryTicket===entry.ticket && [p.id,c.courtIndex,rd.round].join('-')===entry.slot)));
    const prior=state.scores[entry.slot];
    if(!pool || (state.splitDone && pool.id==='main') || (prior && [prior.t1,prior.t2].some(Number.isInteger)))fail(409,'changed');
    const match=pool.rounds.find(rd=>rd.round===round.n).courts.find(c=>c.entryTicket===entry.ticket);
    delete match.entryTicket;delete match.entryLineup;
    state.scores[entry.slot]={t1:entry.score[0],t2:entry.score[1]};
    const rank=createRanking(()=>state,(p,c,r)=>[p,c,r].join('-'),id=>{
      const i=['beginner','ervaren','gevorderd'].indexOf(id);
      return i<0?state.activeRoster:state.activeRosterLevels[i];
    });
    for(const board of view.boards){
      const {totals,h2h}=rank.computeTotals(board.poolId);
      board.rows=rank.rankPlayers(totals,h2h).map(p=>[p.rank,p.name,p.adjPoints]);
    }
  }
  row.score=[...entry.score];delete row.ticket;
}
async function requestJson(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'json');
  const cap=2*1024*1024,reader=request.body?.getReader();
  if(!reader || Number(request.headers.get('content-length'))>cap)fail(413,'size');
  let length=0,parts=[];const decoder=new TextDecoder();
  for(;;){
    const {value,done}=await reader.read();if(done)break;
    length+=value.byteLength;if(length>cap){await reader.cancel();fail(413,'size');}
    parts.push(decoder.decode(value,{stream:true}));
  }
  try{return JSON.parse(parts.join('')+decoder.decode());}catch{fail(400,'json');}
}
async function counter(db, request, name, now, max, increment){
  const span=15*60000,end=(Math.floor(now/span)+1)*span;
  const ip=request.headers.get('CF-Connecting-IP') || 'local';
  const bucket=await digest([name,end,ip].join('/'));
  if(increment){
    const row=await one(db,'INSERT INTO limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits',bucket,end);
    if(row.hits>max)fail(429,'limit');
  }else if((await one(db,'SELECT hits FROM limits WHERE bucket=?',bucket))?.hits>=max)fail(429,'limit');
}
async function resolvePlan(db,state,date,now){
  if(state.signupPoll?.id){
    if(typeof state.signupPoll.id!=='string' || !/^[a-f0-9]{14}$/.test(state.signupPoll.id))fail(422,'poll');
    const poll=await one(db,"SELECT id,json_extract(document,'$.settings.date') AS date FROM signup_polls WHERE id=? AND expires>?",state.signupPoll.id,now);
    if(!poll)fail(409,'poll');
    return {date:poll.date,pollId:poll.id};
  }
  if(!validPlayDate(date,now))fail(422,'date');
  return {date};
}
const ownerInfo = async (db,row) => {
  const links=(await query(db,'SELECT code,role,player FROM links WHERE session_id=? AND (role=? OR epoch=?)',row.id,'view',row.epoch).all()).results;
  const planning=JSON.parse(row.document).planning;
  return {revision:row.revision,mode:row.mode,closed:!!row.closed,expires:row.expires,links,playDate:planning?.date||null};
};
async function ownerRow(db, request, now){
  const key=request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{48})$/)?.[1];
  if(!key)fail(404,'missing');
  const row=await one(db,'SELECT * FROM sessions WHERE owner_hash=? AND expires>?',await digest(key),now);
  if(!row)fail(404,'missing');
  return row;
}
async function lookup(db,code,now){
  return one(db,'SELECT s.*,l.role,l.player FROM links l JOIN sessions s ON s.id=l.session_id WHERE l.code=? AND s.expires>? AND (l.role=? OR (l.role=s.mode AND l.epoch=s.epoch))',code,now,'view');
}
const insertLink = 'INSERT INTO links(code,session_id,role,epoch,player) VALUES(?,?,?,?,?)';
async function create(db, request, now){
  await counter(db,request,'create',now,20,true);
  const body=await requestJson(request),doc=validDocument(body);
  doc.planning=await resolvePlan(db,doc.state,body.playDate,now);
  const expires=Math.max(now,Date.parse(doc.planning.date))+WEEK;
  const secret=toHex(random(24)),owner=await digest(secret);
  const id=crypto.randomUUID(), epoch=crypto.randomUUID();
  for(let i=0;i<5;i++){
    const code=newCode();
    try{
      await db.batch([
        query(db,'INSERT INTO sessions(id,owner_hash,revision,mode,epoch,expires,changed,document) VALUES(?,?,1,?,?,?,?,?)',id,owner,'view',epoch,expires,now,JSON.stringify(doc)),
        query(db,insertLink,code,id,'view','', '')
      ]);
      return json({secret,revision:1,mode:'view',closed:false,expires,playDate:doc.planning.date,links:[{role:'view',code,player:''}]},201);
    }catch(error){if(!/UNIQUE/i.test(String(error)))throw error;}
  }
  fail(503,'retry');
}
async function modeLink(db,row,player){
  const doc=JSON.parse(row.document);
  if(row.closed || !['group','personal'].includes(row.mode) ||
    !doc.view.rounds.some(rd=>rd.rows.some(r=>r.slot)))fail(409,'mode');
  if(row.mode==='personal'){
    if(typeof player!=='string'|| !Object.values(doc.view.playerIds).includes(player))fail(422,'player');
  }else player='';
  const find=()=>one(db,'SELECT code FROM links WHERE session_id=? AND role=? AND epoch=? AND player=?',row.id,row.mode,row.epoch,player);
  for(let i=0;i<5;i++){
    const existing=await find();if(existing)return json(existing);
    const code=newCode();
    const res=await run(db,'INSERT OR IGNORE INTO links(code,session_id,role,epoch,player) SELECT ?,id,mode,epoch,? FROM sessions WHERE id=? AND epoch=? AND closed=0',code,player,row.id,row.epoch);
    if(res.meta.changes)return json({code});
  }
  fail(409,'changed');
}
async function manage(db,request,now,sessionId){
  const row=sessionId ? await one(db,'SELECT * FROM sessions WHERE id=? AND expires>?',sessionId,now) : await ownerRow(db,request,now);
  if(!row)fail(404,'missing');
  if(request.method==='GET'){
    if(request.headers.get('If-None-Match')===String(row.revision))return new Response(null,{status:304,headers:{'Cache-Control':'no-store'}});
    return json({...await ownerInfo(db,row),state:JSON.parse(row.document).state});
  }
  if(request.method!=='POST')fail(405,'method');
  const body=await requestJson(request);
  if(body.revision!==row.revision)fail(409,'changed');
  if(row.closed && body.action!=='schedule')fail(409,'closed');
  if(body.action==='link')return modeLink(db,row,body.player);
  let mode=row.mode,epoch=row.epoch,closed=row.closed,doc=row.document,expires=Math.max(row.expires,now+WEEK);
  if(body.action==='save'){
    const next=validDocument(body.document),planning=JSON.parse(row.document).planning;
    if(planning)next.planning=planning;
    doc=JSON.stringify(next);
  }else if(body.action==='schedule'){
    const saved=JSON.parse(row.document);
    if(saved.planning)fail(409,'changed');
    const linked=await one(db,`SELECT p.id AS pollId,json_extract(p.document,'$.settings.date') AS date
      FROM signup_polls p JOIN links l ON l.code=json_extract(p.document,'$.viewCode')
      WHERE l.session_id=? AND l.role='view' AND p.expires>? LIMIT 1`,row.id,now);
    saved.planning=linked||await resolvePlan(db,saved.state,body.playDate,now);
    doc=JSON.stringify(saved);expires=Math.max(expires,Date.parse(saved.planning.date)+WEEK);
  }else if(body.action==='close')closed=1;
  else if(body.action==='mode' && modes.includes(body.mode)){
    if(body.mode!=='view' && !JSON.parse(doc).view.rounds.some(rd=>rd.rows.some(r=>r.slot)))fail(422,'mode');
    mode=body.mode;if(mode!==row.mode)epoch=crypto.randomUUID();
  }else fail(422,'action');
  if(closed===row.closed && mode===row.mode && doc===row.document)return json(await ownerInfo(db,row));
  const changed=await run(db,'UPDATE sessions SET document=?,mode=?,epoch=?,closed=?,revision=revision+1,changed=?,expires=? WHERE id=? AND revision=? AND expires>?',doc,mode,epoch,closed,now,expires,row.id,row.revision,now);
  if(!changed.meta.changes)fail(409,'changed');
  return json(await ownerInfo(db,{...row,document:doc,revision:row.revision+1,mode,epoch,closed,expires}));
}
export async function cleanup(db,now=Date.now()){
  await db.batch([...pollCleanup(db,now),query(db,'DELETE FROM organizer_logins WHERE expires<=?',now),query(db,'DELETE FROM links WHERE session_id IN (SELECT id FROM sessions WHERE expires<=?)',now),
    query(db,'DELETE FROM sessions WHERE expires<=?',now),query(db,'DELETE FROM limits WHERE expires<=?',now)]);
}
export async function api(request,db,now=Date.now(),adminPassword){
  try{
    const url=new URL(request.url),path=url.pathname,origin=request.headers.get('Origin');
    if(origin && origin!==url.origin && request.method!=='GET')fail(403,'origin');
    const services={json,requestJson,counter};
    if(path==='/api/polls/mine' || path.startsWith('/api/polls/mine/'))return await myPollsApi(request,db,now,services);
    if(path==='/api/polls/hub' || path.startsWith('/api/polls/hub/'))return await organizerApi(request,db,now,adminPassword,services);
    if(path==='/api/polls' || path.startsWith('/api/polls/'))return await pollApi(request,db,now,services,adminPassword);
    const managedSession=path.match(/^\/api\/manage\/([a-f0-9-]{36})$/);
    if(managedSession){
      if(!await centralLogin(request,db,now,adminPassword))fail(401,'login');
      return await manage(db,request,now,managedSession[1]);
    }
    if(path==='/api/sessions' && request.method==='POST')return await create(db,request,now);
    if(path==='/api/manage')return await manage(db,request,now);
    const part=path.match(/^\/api\/s\/([^/]{1,14})$/);
    if(!part)fail(404,'missing');
    const code=part[1].replace(/-/g,'').toUpperCase();
    await counter(db,request,'miss',now,30,false);
    let entry;
    for(let i=0;i<5;i++){
      const row=/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code) && await lookup(db,code,now);
      if(!row){await counter(db,request,'miss',now,30,true);fail(404,'missing');}
      if(request.method==='GET'){
        if(request.headers.get('If-None-Match')===String(row.revision))return new Response(null,{status:304,headers:{'Cache-Control':'no-store'}});
        return json(guest(row,row));
      }
      if(request.method!=='POST')fail(405,'method');
      if(row.role==='view')fail(403,'readonly');
      if(row.closed)fail(409,'closed');
      if(!entry)entry=await requestJson(request);
      const doc=JSON.parse(row.document);
      applyScore(doc,entry,row);
      const changed=await run(db,'UPDATE sessions SET document=?,changed=?,expires=?,revision=revision+1 WHERE id=? AND revision=? AND closed=0 AND expires>?',JSON.stringify(doc),now,Math.max(row.expires,now+WEEK),row.id,row.revision,now);
      if(changed.meta.changes)return json(guest({...row,document:JSON.stringify(doc),revision:row.revision+1,changed:now},row));
    }
    fail(409,'changed');
  }catch(error){return json({error:error.status ? error.message : 'unavailable'},error.status || 503);}
}
