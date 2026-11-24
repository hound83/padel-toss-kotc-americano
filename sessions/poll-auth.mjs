import {invalid} from './poll-roster.mjs';

const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
export const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const encode=s=>new TextEncoder().encode(s);
export const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encode(s))));

export function acceptablePassword(value){
  if(typeof value!=='string' || value.length<8 || value.length>128)invalid('password-length');
  return value;
}
export async function verifier(password,salt){
  const key=await crypto.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encode(salt),iterations:100000},key,256)));
}
