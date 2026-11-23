/* Shared links, mode artwork and short-lived organizer access. */
window.TossPoll=(()=>{
  const modes={toss:['Toss','Toss','toss'],koc:['King of the Court','King of the Court','koc'],americano:['Americano','Americano','americano'],splitToss:['Gesplitste Toss','Split Toss','split']};
  function art(mode,en=false){
    const file=modes[mode]?.[2];
    return file?'./assets/mode-'+file+(file==='split' && en?'-en':'')+'.svg':'./icon.svg';
  }
  const tokenKey=id=>'toss-poll-admin-'+id;
  function token(id){return sessionStorage.getItem(tokenKey(id));}
  function remember(id,value){if(value)sessionStorage.setItem(tokenKey(id),value);else sessionStorage.removeItem(tokenKey(id));}
  function personalKey(create){
    const storage='toss-poll-own-device';
    let value=localStorage.getItem(storage);
    if(!value && create){
      value=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
      localStorage.setItem(storage,value);
    }
    return value;
  }
  async function api(path,body,options={}){
    const headers={};
    if(options.token)headers.Authorization='Bearer '+options.token;
    if(options.person)headers['X-Signup-Key']=options.person;
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch('/api/polls'+path,{method:body===undefined?'GET':'POST',headers,
      body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'});
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'unavailable'),{status:response.status});
    return data;
  }
  function rosterSignature(data){return JSON.stringify([data.settings,data.entries.filter(e=>e.place==='in').map(e=>[e.name,e.level??null])]);}
  return {modes,art,token,remember,personalKey,api,rosterSignature};
})();
