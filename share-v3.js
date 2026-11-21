/* Encrypted, organizer-signed updates. A viewer URL contains no signing key. */
window.TossShare = (() => {
  const subtle = crypto.subtle;
  const encoder = new TextEncoder();
  const signing = {name:'ECDSA',namedCurve:'P-256'};
  const signature = {name:'ECDSA',hash:'SHA-256'};
  const relay = 'https://ntfy.sh/';
  const encode = bytes => btoa(Array.from(new Uint8Array(bytes), c => String.fromCharCode(c)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const decode = str => Uint8Array.from(atob(str.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
  async function pack(value){
    const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unpack(bytes){
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader(), chunks = [];
    let size = 0;
    for(;;){
      const {value,done} = await reader.read();
      if(done) break;
      size += value.length;
      if(size > 2000000){await reader.cancel();throw Error('Size');}
      chunks.push(value);
    }
    return JSON.parse(await new Blob(chunks).text());
  }
  async function create(snapshot){
    const keys = await subtle.generateKey(signing,true,['sign','verify']);
    const channel = 'koriander-'+crypto.randomUUID();
    const publicKey = encode(await subtle.exportKey('raw',keys.publicKey));
    const key = encode(crypto.getRandomValues(new Uint8Array(32)));
    const initial = encode(await pack(snapshot));
    return {channel,key,publicKey,initial,privateKey:await subtle.exportKey('jwk',keys.privateKey)};
  }
  function link(session){
    const url = new URL('./kijken.html',location.href);
    url.hash = [session.channel,session.key,session.publicKey,session.initial].join('.');
    return url.href;
  }
  function parse(hash){
    const [channel,key,publicKey,initial] = hash.slice(1).split('.');
    if(!/^koriander-[a-f0-9-]{36}$/.test(channel) || key?.length!==43 || publicKey?.length!==87 || !initial || initial.length>350000)throw Error('Link');
    return {channel,key,publicKey,initial};
  }
  async function aes(session,uses){
    return subtle.importKey('raw',decode(session.key),'AES-GCM',false,uses);
  }
  async function send(session,snapshot){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await subtle.encrypt({name:'AES-GCM',iv},await aes(session,['encrypt']),await pack(snapshot));
    const payload = encode(iv)+'.'+encode(data);
    const signer = await subtle.importKey('jwk',session.privateKey,signing,false,['sign']);
    const signed = encode(await subtle.sign(signature,signer,encoder.encode(payload)))+'.'+payload;
    const endpoint = relay+session.channel+(signed.length>3900?'?filename=round.bin':'');
    const response = await fetch(endpoint,{method:'POST',body:signed,referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(String(response.status));
  }
  async function receive(session,message){
    let signed = message.message;
    if(message.attachment){
      const url = new URL(message.attachment.url);
      if(url.origin!==new URL(relay).origin || !url.pathname.startsWith('/file/') || message.attachment.size>350000) throw Error('Attachment');
      const response = await fetch(url,{referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw Error('Attachment');
      signed=await response.text();
    }
    if(typeof signed!=='string' || signed.length>350000) throw Error('Size');
    const [sig,iv,data] = signed.split('.');
    const verifier = await subtle.importKey('raw',decode(session.publicKey),signing,false,['verify']);
    if(!await subtle.verify(signature,verifier,decode(sig),encoder.encode(iv+'.'+data)))throw Error('Signature');
    const bytes=await subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await aes(session,['decrypt']),decode(data));
    return unpack(bytes);
  }
  function listen(session,onUpdate,onConnection){
    const events = new EventSource(relay+session.channel+'/sse?since=all');
    events.onopen=()=>onConnection(true);
    events.onerror=()=>onConnection(false);
    events.addEventListener('message',async event=>{
      try{const msg=JSON.parse(event.data);if(msg.topic===session.channel && msg.event==='message')onUpdate(await receive(session,msg));}
      catch{/* Ignore invalid or expired relay messages. */}
    });
    return events;
  }
  return {create,link,parse,send,listen,initial:session=>unpack(decode(session.initial))};
})();
