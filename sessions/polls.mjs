import {centralLogin} from './organizer.mjs';
import {emptyPoll, changeSettings, adminEntry, nameKey, publicPoll, respond, invalid} from './poll-roster.mjs';

const day=86400000;
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const encode=s=>new TextEncoder().encode(s);
const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encode(s))));
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>stmt(db,sql,...args).first();
const ttl=(config,now)=>Math.max(now+14*day,Date.parse(config.date)+14*day);
const personKey=async(request,series)=>{
  const key=request.headers.get('X-Signup-Key');
  if(!key)return null;
  if(!/^[a-f0-9]{64}$/.test(key))invalid('identity',403);
  return hash(series+'/'+key);
};
function acceptablePassword(value){
  if(typeof value!=='string' || value.length<8 || value.length>128)invalid('password-length');
  return value;
}
async function verifier(password,salt){
  const key=await crypto.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encode(salt),iterations:100000},key,256)));
}
async function issueLogin(db,series,now){
  const token=random(32);
  await stmt(db,'INSERT INTO signup_logins VALUES(?,?,?)',await hash(token),series,now+12*3600000).run();
  return token;
}
async function loggedIn(db,request,series,now){
  const token=request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if(!token || !await first(db,'SELECT 1 AS ok FROM signup_logins WHERE token=? AND series=? AND expires>?',await hash(token),series,now))invalid('login',401);
}
function rowInsert(db,id,series,doc,now){
  return stmt(db,'INSERT INTO signup_polls(id,series,revision,expires,document) VALUES(?,?,1,?,?)',id,series,ttl(doc.settings,now),JSON.stringify(doc));
}
function adminView(row,doc){
  return {id:row.id,revision:row.revision,settings:doc.settings,phase:doc.phase,viewCode:doc.viewCode,next:doc.next||null,plannerKey:doc.plannerKey||null,
    entries:doc.entries.map(({person,...visible})=>visible)};
}
function checkDate(config,now){
  if(Date.parse(config.date)>now+370*day)invalid('date');
}
export async function pollApi(request,db,now,{json,requestJson,counter},adminPassword){
  const path=new URL(request.url).pathname;
  if(path==='/api/polls' && request.method==='POST'){
    await counter(db,request,'poll-create',now,20,true);
    const body=await requestJson(request),doc=emptyPoll(body.settings);
    checkDate(doc.settings,now);
    const id=random(7),series=crypto.randomUUID(),salt=random(16);
    const viaHub=body.central===true;
    if(viaHub && !await centralLogin(request,db,now,adminPassword))invalid('login',401);
    const password=await verifier(viaHub?random(32):acceptablePassword(body.password),salt);
    await db.batch([stmt(db,'INSERT INTO signup_series VALUES(?,?,?)',series,salt,password),rowInsert(db,id,series,doc,now)]);
    return json(viaHub?{id}:{id,token:await issueLogin(db,series,now)},201);
  }
  const route=path.match(/^\/api\/polls\/([a-f0-9]{14})(?:\/(login|admin|logout))?$/);
  if(!route)invalid('missing',404);
  const [,id,kind]=route;
  const read=()=>first(db,'SELECT * FROM signup_polls WHERE id=? AND expires>?',id,now);
  let row=await read();
  if(!row)invalid('missing',404);
  if(kind==='login'){
    if(request.method!=='POST')invalid('method',405);
    await counter(db,request,'poll-password-'+row.series,now,10,true);
    const series=await first(db,'SELECT salt,verifier FROM signup_series WHERE id=?',row.series);
    const body=await requestJson(request);
    if(typeof body.password!=='string' || body.password.length>128 || await verifier(body.password,series.salt)!==series.verifier)invalid('login',401);
    return json({token:await issueLogin(db,row.series,now)});
  }
  const siteAdmin=kind==='admin' && await centralLogin(request,db,now,adminPassword);
  if(kind && !siteAdmin)await loggedIn(db,request,row.series,now);
  async function organizerView(version,doc){
    const view=adminView(version,doc);
    if(siteAdmin){
      // A central login opens the planner with its cookie. Never hand a long-lived
      // owner link to that browser as a side effect of viewing a signup list.
      delete view.plannerKey;
      const link=doc.viewCode && await first(db,"SELECT s.id FROM sessions s JOIN links l ON l.session_id=s.id WHERE l.code=? AND l.role='view' AND s.expires>?",doc.viewCode,now);
      view.plannerId=link?.id||null;
    }
    return view;
  }
  if(kind==='logout'){
    if(request.method!=='POST')invalid('method',405);
    await stmt(db,'DELETE FROM signup_logins WHERE token=?',await hash(request.headers.get('Authorization').slice(7))).run();
    return json({ok:true});
  }
  const person=kind?null:await personKey(request,row.series);
  if(request.method==='GET'){
    const doc=JSON.parse(row.document);
    return json(kind?await organizerView(row,doc):publicPoll(doc,id,person));
  }
  if(request.method!=='POST')invalid('method',405);
  const body=await requestJson(request);
  if(!body || typeof body!=='object')invalid('field');
  if(!kind){
    if(!person)invalid('identity',403);
    await counter(db,request,'poll-response-'+id,now,300,true);
  }
  const standing=!kind && typeof body.name==='string' && await first(db,
    'SELECT 1 AS found FROM signup_holds WHERE series=? AND format=? AND (person=? OR name=?)',
    row.series,JSON.parse(row.document).settings.format,person,nameKey(body.name));
  for(let attempt=0;attempt<20;attempt++){
    if(!row)invalid('missing',404);
    const doc=JSON.parse(row.document),extra=[];
    let writeGuard='',guardValues=[];
    if(!kind){
      // Receipt order is assigned by the server, including equal-millisecond submissions.
      const accepted=Math.max(now,doc.lastAccepted||0);
      respond(doc,person,body,accepted,standing);
      if(JSON.stringify(doc)===row.document)return json(publicPoll(doc,id,person));
      doc.lastAccepted=accepted;
    }else{
      if(body.revision!==row.revision)invalid('changed',409);
      if(body.action==='entry'){
        const before=doc.entries.find(e=>e.id===body.id);
        const oldName=before && nameKey(before.name);
        const entry=adminEntry(doc,body,now);
        if(body.standing!==undefined){
          if(typeof body.standing!=='boolean')invalid('field');
          // The version guard makes the accompanying change to the series part of the same write.
          const guard='EXISTS(SELECT 1 FROM signup_polls WHERE id=? AND revision=?)';
          extra.push(stmt(db,'DELETE FROM signup_holds WHERE series=? AND format=? AND (name=? OR name=? OR person=?) AND '+guard,
            row.series,doc.settings.format,oldName||nameKey(entry.name),nameKey(entry.name),entry.person||'',id,row.revision));
          if(body.standing)extra.push(stmt(db,'INSERT INTO signup_holds(series,format,name,person) SELECT ?,?,?,? WHERE '+guard,
            row.series,doc.settings.format,nameKey(entry.name),entry.person,id,row.revision));
          entry.standing=body.standing;
        }
      }else if(body.action==='withdraw'){
        const entry=doc.entries.find(e=>e.id===body.id);
        if(!entry)invalid('missing',404);
        adminEntry(doc,{id:entry.id,name:entry.name,place:'out',position:1},now);
        entry.answer='cancel';entry.held=Boolean(entry.standing);
      }else if(body.action==='settings'){
        changeSettings(doc,body.settings);checkDate(doc.settings,now);
      }else if(body.action==='plan'){
        if(doc.phase==='open')doc.phase='planning';
      }else if(body.action==='reopen'){
        doc.phase='open';doc.viewCode=null;delete doc.plannerKey;
      }else if(body.action==='publish'){
        if(doc.phase==='open')invalid('phase',409);
        if(!/^[a-f0-9]{48}$/.test(body.sessionKey||''))invalid('session',422);
        const link=await first(db,"SELECT l.code,s.document FROM sessions s JOIN links l ON l.session_id=s.id AND l.role='view' WHERE s.owner_hash=? AND s.expires>?",await hash(body.sessionKey),now);
        if(!link || JSON.parse(link.document).state.format!==doc.settings.format)invalid('session',422);
        // The organizer can remove a standalone schedule while another browser publishes it.
        writeGuard=" AND EXISTS(SELECT 1 FROM links l JOIN sessions s ON s.id=l.session_id WHERE l.code=? AND l.role='view' AND s.expires>?)";
        guardValues=[link.code,now];
        doc.phase='published';doc.viewCode=link.code;doc.plannerKey=body.sessionKey;
      }else if(body.action==='repeat'){
        if(doc.next)return json({id:doc.next});
        const next={...doc.settings,date:new Date(Date.parse(doc.settings.date)+7*day).toISOString().slice(0,10)};
        // A later week can survive deletion and re-creation of the week before it.
        const existing=await first(db,"SELECT id FROM signup_polls WHERE series=? AND expires>? AND json_extract(document,'$.settings.date')=? ORDER BY id LIMIT 1",row.series,now,next.date);
        if(existing){
          doc.next=existing.id;
          writeGuard=" AND EXISTS(SELECT 1 FROM signup_polls WHERE id=? AND expires>? AND json_extract(document,'$.settings.date')=?)";
          guardValues=[existing.id,now,next.date];
        }else{
          doc.next=random(7);
          extra.push(stmt(db,'INSERT INTO signup_polls(id,series,revision,expires,document) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM signup_polls WHERE id=? AND revision=?)',
            doc.next,row.series,ttl(next,now),JSON.stringify(emptyPoll(next)),id,row.revision));
        }
      }else invalid('action');
    }
    // Keep an already shared link on the poll's date, even after a later reopening.
    if(kind && doc.viewCode && (body.action==='publish' || body.action==='settings')){
      extra.push(stmt(db,`UPDATE sessions SET document=json_set(document,'$.planning',json_object('date',?,'pollId',?)),
        expires=MAX(expires,?),revision=revision+1
        WHERE id=(SELECT session_id FROM links WHERE code=? AND role='view') AND expires>?
        AND (json_extract(document,'$.planning.pollId') IS NOT ? OR json_extract(document,'$.planning.date') IS NOT ?)
        AND EXISTS(SELECT 1 FROM signup_polls WHERE id=? AND revision=?)`,
        doc.settings.date,id,Date.parse(doc.settings.date)+7*day,doc.viewCode,now,id,doc.settings.date,id,row.revision));
    }
    const updated=stmt(db,'UPDATE signup_polls SET document=?,revision=revision+1,expires=? WHERE id=? AND revision=?'+writeGuard,
      JSON.stringify(doc),ttl(doc.settings,now),id,row.revision,...guardValues);
    const last=(await db.batch([...extra,updated])).at(-1);
    if(last.meta.changes){
      if(kind && body.action==='repeat')return json({id:doc.next});
      return json(kind?await organizerView({...row,revision:row.revision+1},doc):publicPoll(doc,id,person));
    }
    if(kind)invalid('changed',409);
    await new Promise(resolve=>setTimeout(resolve,2+Math.random()*Math.min(50,4*(attempt+1))));
    row=await read();
  }
  invalid('retry',409);
}
export function pollCleanup(db,now){
  return [stmt(db,'DELETE FROM signup_logins WHERE expires<=?',now),stmt(db,'DELETE FROM signup_polls WHERE expires<=?',now),
    stmt(db,'DELETE FROM signup_series WHERE NOT EXISTS(SELECT 1 FROM signup_polls WHERE series=signup_series.id)')];
}
