import {invalid} from './poll-roster.mjs';
import {acceptablePassword,hash,random,verifier} from './poll-auth.mjs';

const lifetime=12*60*60;
const cookieName='__Host-padel-polls';
const dummySalt='4768a1fd67cbdf0085f178862b525940';

function organizerName(value){
  if(typeof value!=='string' || value.length>160 || /[\p{Cc}\p{Cf}]/u.test(value))invalid('organizer-name');
  const label=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
  if(!label || label.length>80)invalid('organizer-name');
  return {label,key:label.toLowerCase()};
}

async function currentToken(request){
  const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-padel-polls=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token?hash(token):null;
}
export async function currentOrganizer(request,db,now){
  const token=await currentToken(request);
  return token?db.prepare(`SELECT o.name_key,o.display_name FROM poll_organizer_logins l
    JOIN poll_organizers o ON o.name_key=l.organizer WHERE l.token=? AND l.expires>?`).bind(token,now).first():null;
}
function setCookie(response,token,age){
  response.headers.set('Set-Cookie',cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age);
  return response;
}
export async function organizerSession(request,db,now,key){
  const token=random(32),previous=await currentToken(request);
  const statements=[];
  if(previous)statements.push(db.prepare('DELETE FROM poll_organizer_logins WHERE token=?').bind(previous));
  statements.push(db.prepare('INSERT INTO poll_organizer_logins VALUES(?,?,?)').bind(await hash(token),key,now+lifetime*1000));
  return {statements,respond:response=>setCookie(response,token,lifetime)};
}

// A new name is claimed atomically. Two concurrent first polls can't assign the same name to different passwords.
export async function organizerCredentials(request,db,now,body,counter,allowNew){
  const {label,key}=organizerName(body.organizerName);
  if(body.useSession===true){
    const session=await currentOrganizer(request,db,now);
    if(session?.name_key!==key)invalid('organizer-login',401);
    return db.prepare('SELECT * FROM poll_organizers WHERE name_key=?').bind(key).first();
  }
  await counter(db,request,'poll-organizer-password',now,12,true);
  const password=acceptablePassword(body.password);
  const select=()=>db.prepare('SELECT * FROM poll_organizers WHERE name_key=?').bind(key).first();
  let owner=await select();
  if(!owner && allowNew){
    const salt=random(16),digest=await verifier(password,salt);
    const inserted=await db.prepare(`INSERT INTO poll_organizers(name_key,display_name,salt,verifier) VALUES(?,?,?,?)
      ON CONFLICT(name_key) DO NOTHING`).bind(key,label,salt,digest).run();
    if(inserted.meta.changes)return {name_key:key,display_name:label,salt,verifier:digest};
    owner=await select();
  }
  const digest=await verifier(password,owner?.salt||dummySalt);
  if(!owner || digest!==owner.verifier)invalid(owner && allowNew?'organizer-name-used':'organizer-login',401);
  return owner;
}

export async function myPollsApi(request,db,now,{json,requestJson,counter}){
  const url=new URL(request.url),action=url.pathname.slice('/api/polls/mine'.length);
  if(action==='/login' && request.method==='POST'){
    const body=await requestJson(request);
    if(!body || body.useSession!==undefined)invalid('field');
    const owner=await organizerCredentials(request,db,now,body,counter,false);
    const session=await organizerSession(request,db,now,owner.name_key);
    await db.batch(session.statements);
    return session.respond(json({name:owner.display_name}));
  }
  if(action==='/logout' && request.method==='POST'){
    const token=await currentToken(request);
    if(token)await db.prepare('DELETE FROM poll_organizer_logins WHERE token=?').bind(token).run();
    return setCookie(json({ok:true}),'',0);
  }
  if(request.method!=='GET')invalid('method',405);
  const owner=await currentOrganizer(request,db,now);
  if(!owner)invalid('organizer-login',401);
  if(action==='/status')return json({name:owner.display_name});
  if(action!=='')invalid('missing',404);
  const after=url.searchParams.get('after')||'';
  if(after && !/^[a-f0-9]{14}$/.test(after))invalid('field');
  const {results}=await db.prepare(`SELECT p.id,
    json_extract(p.document,'$.settings.title') AS title, json_extract(p.document,'$.settings.date') AS date,
    json_extract(p.document,'$.settings.start') AS start, json_extract(p.document,'$.settings.format') AS format
    FROM poll_organizer_series m JOIN signup_polls p ON p.series=m.series
    WHERE m.organizer=? AND p.expires>? AND p.id>? ORDER BY p.id LIMIT 65`).bind(owner.name_key,now,after).all();
  const items=results.slice(0,64);
  return json({name:owner.display_name,items,next:results.length>items.length?items.at(-1).id:null});
}
