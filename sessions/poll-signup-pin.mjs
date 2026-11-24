import {hash,random,verifier} from './poll-auth.mjs';
import {invalid,nameKey} from './poll-roster.mjs';

const dummySalt='d94a86201bd04d4614a0f740d9d90cd9';
const isPin=value=>typeof value==='string' && /^[0-9]{4}$/.test(value);

export async function makeSignupPin(pin){
  if(!isPin(pin))invalid('pin-format');
  const salt=random(16);
  return {salt,verifier:await verifier(pin,salt)};
}

export async function signupPerson(db,pollId,device){
  if(!device)return null;
  const match=await db.prepare('SELECT person FROM signup_recovered_devices WHERE poll=? AND device=?').bind(pollId,device).first();
  return match?.person||device;
}

export async function recoverSignup({request,db,row,device,body,now,counter}){
  if(!device)invalid('identity',403);
  const doc=JSON.parse(row.document);
  if(doc.phase!=='open')invalid('locked',409);
  await counter(db,request,'signup-pin-attempt',now,16,true,{error:'pin-limit'});
  if(typeof body?.name!=='string' || body.name.length>100 || !body.name.trim() || !isPin(body.pin))invalid('pin-login',401);
  const name=nameKey(body.name),bucket='signup-pin/'+row.id+'/'+await hash(name);
  await counter(db,request,bucket,now,5,true,{shared:true,error:'pin-limit'});
  await counter(db,request,bucket+'/day',now,10,true,{shared:true,span:86400000,error:'pin-limit'});
  const entry=doc.entries.find(e=>nameKey(e.name)===name && e.person);
  const digest=await verifier(body.pin,entry?.pin?.salt||dummySalt);
  if(!entry?.pin || digest!==entry.pin.verifier)invalid('pin-login',401);
  const person=await signupPerson(db,row.id,device);
  if(doc.entries.some(e=>e.person===person && e.person!==entry.person))invalid('pin-device',409);
  if(person===entry.person)return;
  // Link only this device and this edition. The poll revision guards a concurrent close or rename.
  const result=await db.prepare(`INSERT INTO signup_recovered_devices(poll,device,person)
    SELECT id,?,? FROM signup_polls WHERE id=? AND revision=? AND expires>?
    ON CONFLICT(poll,device) DO NOTHING`).bind(device,entry.person,row.id,row.revision,now).run();
  if(!result.meta.changes && (await signupPerson(db,row.id,device))!==entry.person)invalid('changed',409);
}
