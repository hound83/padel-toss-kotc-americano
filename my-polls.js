/* A private list of evenings for the person who organizes them. */
window.TossMyPolls=({P,say,modeName,dateText,el,button,link,card,field,input,actions,friendly,content,legacy})=>{
  const message=document.getElementById('message');
  let generation=0,showingList=false;
  const path=url=>url+(document.documentElement.lang==='en'?'?lang=en':'');
  function credentials(root,{setup=false,known=null}={}){
    if(known){
      const signed=el('p',say('Ingelogd als ','Signed in as '));signed.append(el('strong',known));root.append(signed);
      return ()=>({organizerName:known,useSession:true});
    }
    const grid=el('div',undefined,'grid organizer-credentials');root.append(grid);
    const name=field(grid,say('Jouw naam','Your name'),input('text'));
    name.autocomplete='username';name.required=true;name.maxLength=80;name.placeholder=say('Bijvoorbeeld Werner','For example, Werner');
    const password=field(grid,say('Wachtwoord','Password'),input('password'));
    password.autocomplete=setup?'new-password':'current-password';password.required=true;password.minLength=8;password.maxLength=128;
    if(setup){
      const hints=[
        [name,say('Kies bij je eerste poll een naam die nog vrij is. Is Werner bezet? Gebruik bijvoorbeeld Werner V.',
          'Choose an available name for your first poll. If Werner is taken, try Werner V.')],
        [password,say(`Kies ${password.minLength} tot ${password.maxLength} tekens. Alleen je naam moet uniek zijn. Gebruik voor je volgende polls hetzelfde wachtwoord.`,
          `Use ${password.minLength} to ${password.maxLength} characters. Only your name needs to be unique. Use the same password for your next polls.`)]
      ];
      for(const [control,text] of hints){
        const hint=el('small',text);
        hint.id=control.getAttribute('aria-labelledby')+'-hint';
        control.setAttribute('aria-describedby',hint.id);control.parentElement.append(hint);
      }
    }
    return ()=>({organizerName:name.value.trim(),password:password.value});
  }
  function signIn(){
    showingList=false;
    const section=card(say('Inloggen','Sign in')),form=el('form');
    form.append(el('p',say('Vul je naam in zoals bij je eerste poll, met je eventuele initiaal of achternaam. Gebruik hetzelfde wachtwoord.','Enter your name as you did for your first poll, including any initial or surname. Use the same password.')));
    const read=credentials(form),go=el('button',say('Mijn polls openen','Open my polls'),'primary');
    go.type='submit';actions(form,go);section.append(form);
    const first=link(say('Mijn eerste poll aanmaken','Create my first poll'),path('/aanmaken'));
    actions(section,first);content.replaceChildren(section,legacy());
    form.onsubmit=async event=>{
      event.preventDefault();go.disabled=true;
      try{await P.api('/mine/login',read());form.reset();message.textContent='';await refresh(true);}
      catch(error){message.textContent=friendly(error);}
      finally{go.disabled=false;}
    };
  }
  function render(name,items){
    showingList=true;
    const section=card(name);
    actions(section,link(say('Nieuwe poll aanmaken','Create new poll'),path('/aanmaken'),true),
      button(say('Uitloggen','Sign out'),async()=>{
        try{await P.api('/mine/logout',{});++generation;message.textContent='';signIn();}
        catch(error){message.textContent=friendly(error);}
      }));
    content.replaceChildren(section);
    if(!items.length)section.append(el('p',say('Je hebt nog geen beschikbare polls.','You have no available polls yet.')));
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
    items.sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
    const groups=[[say('Komende avonden','Upcoming events'),items.filter(p=>p.date>=today)],
      [say('Eerdere avonden','Past events'),items.filter(p=>p.date<today).reverse()]];
    for(const [title,events] of groups){
      if(!events.length)continue;
      const group=card(title),list=el('ul',undefined,'my-poll-list');
      for(const poll of events){
        const row=el('li'),open=link('',path('/beheer/'+poll.id));open.classList.add('my-poll');
        const art=el('img');art.alt='';art.src=P.art(poll.format,document.documentElement.lang==='en');
        const label=el('span',undefined,'hub-label');
        label.append(el('strong',poll.title),el('span',dateText(poll,true)+' · '+poll.start+' · '+modeName(poll.format)));
        open.append(art,label);row.append(open);list.append(row);
      }
      group.append(list);content.append(group);
    }
    content.append(legacy());
  }
  async function refresh(afterLogin=false){
    const serial=++generation;
    try{
      const events=[];let cursor='',owner;
      do{
        const data=await P.api('/mine'+(cursor?'?after='+encodeURIComponent(cursor):''));
        if(serial!==generation)return;
        if(owner && data.name!==owner){return refresh();}
        owner=data.name;events.push(...data.items);cursor=data.next;
      }while(cursor);
      render(owner,events);message.textContent='';
    }catch(error){
      if(serial!==generation)return;
      if(showingList || !content.querySelector('[autocomplete=current-password]'))signIn();
      if(error.status===401)message.textContent=afterLogin?say('Sta cookies voor deze site toe om ingelogd te blijven.','Allow cookies for this site to stay signed in.'):'';
      else message.textContent=friendly(error);
    }finally{if(serial===generation)content.setAttribute('aria-busy','false');}
  }
  function clear(){
    ++generation;if(showingList){content.replaceChildren();showingList=false;}
  }
  function start(){
    refresh();window.addEventListener('pagehide',clear);
    window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)clear();else refresh();
    });
  }
  return {credentials,start,refresh};
};
