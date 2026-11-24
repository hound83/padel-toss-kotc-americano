const places = ['in','wait','reserve','review','out'];
const answers = ['yes','reserve','no','cancel'];
export function invalid(code,status=422){throw Object.assign(new Error(code),{status});}
export const nameKey = name=>name.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const clean = (s,max)=>typeof s==='string' && s.trim().length && s.trim().length<=max && !/[\u0000-\u001f\u007f]/u.test(s) ? s.trim().replace(/\s+/gu,' ') : invalid('field');
export function validPlayDate(value,now=Infinity){
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value &&
    Date.parse(value)<=now+370*86400000;
}
export function settings(input){
  if(!input || !['toss','koc','americano','splitToss'].includes(input.format) ||
    !Number.isInteger(input.courts) || input.courts<2 || input.courts>12 ||
    !Number.isInteger(input.capacity) || input.capacity<4 || input.capacity>96 ||
    !validPlayDate(input.date) ||
    ![input.start,input.end].every(v=>typeof v==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)) ||
    input.end<=input.start)invalid('settings');
  return {title:clean(input.title,80),format:input.format,date:input.date,start:input.start,end:input.end,courts:input.courts,capacity:input.capacity};
}
export function emptyPoll(config){return {settings:settings(config),phase:'open',entries:[],viewCode:null};}
function uniqueName(doc,value,entry){
  const name=clean(value,50);
  if(doc.entries.some(e=>e!==entry && nameKey(e.name)===nameKey(name)))invalid('duplicate',409);
  return name;
}
function insert(doc,e,place,index){
  const others=doc.entries.filter(row=>row!==e);
  const group=others.filter(row=>row.place===place);
  const at=Number.isInteger(index)?Math.max(0,Math.min(index,group.length)):group.length;
  const before=group[at];
  e.place=place;
  others.splice(before?others.indexOf(before):others.length,0,e);
  doc.entries=others;
}
function admitted(doc){return doc.entries.filter(e=>e.place==='in');}
function seat(doc,allowReserve=false,exclude){
  while(admitted(doc).length<doc.settings.capacity){
    const first=doc.entries.find(e=>e.place==='wait' && e!==exclude) ||
      (allowReserve && doc.entries.find(e=>e.place==='reserve' && e!==exclude));
    if(!first)break;
    insert(doc,first,'in');
  }
}
function limitSeats(doc){
  const surplus=admitted(doc).slice(doc.settings.capacity);
  for(const entry of surplus.reverse())insert(doc,entry,'wait',0);
}
export function respond(doc,person,body,now,held){
  if(doc.phase!=='open')invalid('locked',409);
  if(!answers.includes(body.answer))invalid('answer');
  let entry=doc.entries.find(e=>e.person===person);
  if(!entry && body.answer==='cancel')invalid('missing',404);
  const name=body.answer==='cancel' && entry ? entry.name : uniqueName(doc,body.name,entry);
  if(!entry){
    if(doc.entries.length>=400)invalid('full',409);
    entry={id:crypto.randomUUID(),person,name,first:now,at:now,held:Boolean(held),standing:Boolean(held)};
  }
  const old=entry.place,previous=entry.answer;
  entry.name=name;
  if(previous===body.answer)return;
  entry.answer=body.answer;entry.at=now;
  const place=['no','cancel'].includes(entry.answer)?'out':entry.held?'review':entry.answer==='yes'?'wait':'reserve';
  insert(doc,entry,place);
  seat(doc,old==='in',entry.answer==='reserve'?entry:undefined);
}
export function adminEntry(doc,body,now){
  let entry=body.id && doc.entries.find(row=>row.id===body.id);
  if(body.id && !entry)invalid('missing',404);
  if(!places.includes(body.place) || !Number.isInteger(body.position) || body.position<1 || body.position>401)invalid('place');
  const name=uniqueName(doc,body.name,entry);
  if(!entry){
    if(doc.entries.length>=400)invalid('full',409);
    entry={id:crypto.randomUUID(),person:null,first:now,at:now,answer:body.place==='reserve'?'reserve':body.place==='out'?'cancel':'yes'};
  }
  const old=entry.place;
  if(body.level!==undefined){
    if(body.level!==null && ![0,1,2].includes(body.level))invalid('level');
    entry.level=body.level;
  }
  entry.name=name;entry.held=body.place==='review';
  insert(doc,entry,body.place,body.place==='in'?Math.min(body.position,doc.settings.capacity)-1:body.position-1);
  limitSeats(doc);
  // A deliberately placed standby stays there. Fill a vacancy from other eligible players.
  if(old==='in' && body.place!=='in')seat(doc,true,entry);
  return entry;
}
export function changeSettings(doc,next){
  const previous=doc.settings;
  const updated=settings(next);
  if(doc.phase==='published' && updated.format!==previous.format)invalid('published-format',409);
  doc.settings=updated;limitSeats(doc);
  if(updated.capacity>previous.capacity)seat(doc);
}
export function publicPoll(doc,id,person){
  const result={id,settings:doc.settings,phase:doc.phase};
  if(doc.phase==='published')result.viewCode=doc.viewCode;
  if(doc.phase!=='open')return result;
  result.groups={in:[],wait:[],reserve:[],out:[]};
  for(const entry of doc.entries){
    if(entry.answer==='cancel' && entry.place==='out')continue;
    const place=entry.place==='review'?'reserve':entry.place;
    const label={name:entry.name};
    result.groups[place].push(label);
  }
  const own=person && doc.entries.find(e=>e.person===person);
  if(own)result.mine={name:own.name,answer:own.answer,place:own.place==='review'?'reserve':own.place};
  return result;
}
