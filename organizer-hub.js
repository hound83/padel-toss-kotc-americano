/* Central organizer dashboard. The selected event uses the regular poll editor. */
window.TossOrganizerHub=function({P,say,modeName,dateText,el,button,link,card,field,input,actions,modal,friendly,content,canSwitch,select}){
  const main=document.getElementById('pollMain'), index=document.getElementById('hubIndex');
  const message=document.getElementById('message');
  let unlocked=false, selected=null, generation=0, signature='', cards=new Map();
  let polls=[], sessions=[];
  const requestId=()=>new URLSearchParams(location.search).get('avond');
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
  const phaseLabel=phase=>phase==='open'?say('Aanmelding open','Signups open'):phase==='planning'?say('Indeling maken','Scheduling'):say('Gepubliceerd','Published');
  function eventInUrl(id){
    const url=new URL(location.href);
    if(id)url.searchParams.set('avond',id);else url.searchParams.delete('avond');
    history.replaceState(null,'',url);
  }
  async function pick(id,updateUrl=true){
    const previous=cards.get(selected);
    if(previous)previous.toggle.setAttribute('aria-expanded','false');
    selected=cards.has(id)?id:null;
    const target=cards.get(selected);
    if(target){target.toggle.setAttribute('aria-expanded','true');target.row.append(content);}
    else main.append(content);
    content.hidden=!target;
    if(updateUrl)eventInUrl(selected);
    await select(selected);
  }
  function recordCard(parent,item){
    const {settings}=item, row=el('article',undefined,'hub-row');
    const toggle=button('',()=>{if(canSwitch())pick(selected===item.id?null:item.id);});
    toggle.className='hub-toggle';toggle.setAttribute('aria-expanded',String(selected===item.id));toggle.setAttribute('aria-controls','content');
    const img=el('img');img.src=P.art(settings.format,document.documentElement.lang==='en');img.alt='';img.width=84;img.height=58;
    const label=el('span',undefined,'hub-label');
    label.append(el('small',modeName(settings.format)+' · '+phaseLabel(item.phase)),
      el('strong',settings.title),el('span',dateText(settings)+' · '+settings.start+'–'+settings.end));
    const totals=el('span',undefined,'hub-counts');
    totals.append(el('strong',item.playing+' / '+settings.capacity),
      el('small',item.waiting+say(' wachtend',' waiting')+' · '+item.standby+say(item.standby===1?' reserve':' reserves',' standby')));
    toggle.append(img,label,totals);row.append(toggle);parent.append(row);cards.set(item.id,{row,toggle});
  }
  const sessionTime=session=>new Intl.DateTimeFormat(document.documentElement.lang,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(session.changed);
  function removeButton(kind,item){
    const event=kind==='poll', format=event?item.settings.format:item.format;
    const label=event?say('Avond verwijderen','Delete event'):say('Schema verwijderen','Delete schedule');
    const name=event?item.settings.title:(item.title||modeName(format));
    const when=event?dateText(item.settings)+' · '+item.settings.start+'–'+item.settings.end:sessionTime(item);
    const trigger=button(label,()=>{
      modal(label+'?',root=>{
        root.append(el('strong',name+' · '+when));
        const detail=event?
          say('De aanmeldingen verdwijnen en de aanmeldlink vervalt.','The signups will be deleted and the signup link will stop working.'):
          say('Het online speelschema en de uitslagen verdwijnen. De kijklink en scorelinks vervallen.','The online schedule and results will be deleted. Viewing and score links will stop working.');
        root.append(el('p',detail));
        if(event && item.viewCode)root.append(el('p',say('Het gepubliceerde speelschema wordt ook verwijderd als het alleen bij deze avond hoort.',
          'The published schedule will also be deleted if it belongs only to this event.')));
        return ()=>({kind,id:item.id,revision:item.revision});
      },async body=>{
        try{await P.api('/hub/remove',body);}
        catch(error){
          if(error.status===401)lock();
          if(error.status===409){await refresh();if(event && selected===item.id)await pick(selected,false);}
          throw error;
        }
        ++generation;signature='';
        if(event)polls=polls.filter(p=>p.id!==item.id);
        else sessions=sessions.filter(s=>s.id!==item.id);
        render();
        if(event && selected===item.id)await pick(null);
        message.textContent=event?say('Avond verwijderd.','Event deleted.'):say('Speelschema verwijderd.','Schedule deleted.');
        return index.querySelector('.hub-toolbar a');
      },{format,remove:true});
    });
    trigger.className='remove-item';
    return trigger;
  }
  function render(){
    const focused=document.activeElement, focusId=[...cards].find(([,v])=>v.toggle===focused)?.[0];
    const heldFocus=content.contains(focused)?focused:null;
    main.append(content);index.replaceChildren();cards=new Map();index.hidden=false;
    const toolbar=el('div',undefined,'hub-toolbar');
    const make=link(say('Nieuwe avond','Create event'),'/aanmaken?beheer=1'+(document.documentElement.lang==='en'?'&lang=en':''),true);
    toolbar.append(make,button(say('Uitloggen','Sign out'),async()=>{
      try{await P.api('/hub/logout',{});eventInUrl(null);lock();}
      catch(error){message.textContent=friendly(error);}
    }));index.append(toolbar);
    const day=today(), dates=polls.slice().sort((a,b)=>
      (a.settings.date+a.settings.start).localeCompare(b.settings.date+b.settings.start)||a.settings.title.localeCompare(b.settings.title));
    for(const [title,entries] of [
      [say('Vandaag','Today'),dates.filter(p=>p.settings.date===day)],
      [say('Komende avonden','Upcoming events'),dates.filter(p=>p.settings.date>day)],
      [say('Eerdere avonden','Past events'),dates.filter(p=>p.settings.date<day).reverse()]
    ]){
      if(!entries.length)continue;
      const section=el('section',undefined,'hub-section');section.append(el('h2',title));
      for(const item of entries)recordCard(section,item);
      index.append(section);
    }
    if(sessions.length){
      const section=el('section',undefined,'hub-section');section.append(el('h2',say('Losse online speelschema’s','Standalone online schedules')));
      for(const session of sessions.slice().sort((a,b)=>b.changed-a.changed)){
        const row=el('article',undefined,'hub-session');
        const art=el('img');art.src=P.art(session.format,document.documentElement.lang==='en');art.alt='';
        const body=el('div');body.append(el('h3',session.title||modeName(session.format)),el('small',modeName(session.format)+' · '+
          (session.closed?say('Eindstand','Final results'):say('Live','Live'))+' · '+
          sessionTime(session)));
        actions(body,link(say('Open planner','Open planner'),'/beheer/sessie/'+session.id),link(say('Open liveweergave','Open live view'),'/s/'+session.viewCode),removeButton('session',session));
        row.append(art,body);section.append(row);
      }
      index.append(section);
    }
    if(!polls.length && !sessions.length)index.append(el('p',say('Er zijn nog geen avonden.','There are no events yet.'),'hub-empty'));
    const target=cards.get(selected);
    if(target)target.row.append(content);
    if(heldFocus?.isConnected)heldFocus.focus({preventScroll:true});
    else if(focusId)cards.get(focusId)?.toggle.focus({preventScroll:true});
  }
  function clear(){
    ++generation;unlocked=false;signature='';selected=null;polls=[];sessions=[];
    main.append(content);select(null);index.replaceChildren();cards.clear();index.hidden=true;
    const dialog=document.getElementById('dialog');if(dialog.open)dialog.close();
    document.getElementById('fields').replaceChildren();message.textContent='';
  }
  function lock(){
    clear();content.hidden=false;content.setAttribute('aria-busy','false');
    const section=card(say('Inloggen voor beheer','Organizer sign-in')),form=el('form');
    const password=field(form,say('Algemeen beheerwachtwoord','Site organizer password'),input('password'));
    password.autocomplete='current-password';password.required=true;
    const submit=el('button',say('Inloggen','Sign in'),'primary');submit.type='submit';actions(form,submit);
    form.onsubmit=async event=>{
      event.preventDefault();submit.disabled=true;
      try{await P.api('/hub/login',{password:password.value});password.value='';message.textContent='';await refresh();}
      catch(error){message.textContent=friendly(error);}
      finally{submit.disabled=false;}
    };
    section.append(form);content.replaceChildren(section);
  }
  async function allPages(path){
    const items=[];let cursor;
    do{
      const data=await P.api(path+(cursor?'?after='+encodeURIComponent(cursor):''));
      items.push(...data.items);cursor=data.next;
    }while(cursor);
    return items;
  }
  async function refresh(prefer){
    const serial=++generation;
    try{
      const [events,draws]=await Promise.all([allPages('/hub'),allPages('/hub/sessions')]);
      if(serial!==generation)return;
      const newLogin=!unlocked;unlocked=true;
      const resume=new URLSearchParams(location.search).get('sessie');
      if(newLogin && /^[a-f0-9-]{36}$/.test(resume||'')){
        location.replace('/beheer/sessie/'+resume);return;
      }
      const nextSignature=JSON.stringify([events,draws,today(),document.documentElement.lang]);
      if(nextSignature!==signature || newLogin){
        polls=events;sessions=draws;signature=nextSignature;render();
      }
      const wanted=prefer || (newLogin?requestId():selected);
      if(newLogin || prefer || (selected && !cards.has(selected)))await pick(wanted);
      content.setAttribute('aria-busy','false');
    }catch(error){
      if(serial!==generation)return;
      if(error.status===401){lock();return;}
      if(!unlocked)lock();
      message.textContent=friendly(error);
    }
  }
  function translate(){
    if(!unlocked){lock();return;}
    render();pick(selected,false);
  }
  function start(){
    refresh();
    setInterval(()=>{if(unlocked && !document.hidden && canSwitch())refresh();},15000);
    window.addEventListener('pagehide',clear);
    window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && unlocked)refresh();});
  }
  return {start,refresh,lock,translate,removeButton};
};
