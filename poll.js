(()=>{
  'use strict';
  const P=window.TossPoll, $=id=>document.getElementById(id);
  const match=location.pathname.match(/^\/(aanmelden|beheer)\/([a-f0-9]{14})/);
  const hubRoute=/^\/beheer\/?$/.test(location.pathname);
  const mineRoute=/^\/mijn-polls\/?$/.test(location.pathname);
  const admin=hubRoute || match?.[1]==='beheer';
  let id=match?.[2],base=id?'/'+id:'',hub,mine,organizerName=null;
  const adminToken=()=>hubRoute?null:P.token(id);
  let en=new URLSearchParams(location.search).get('lang')==='en' || P.preference('toss-poll-lang')==='en';
  let current=null, pending=false, sequence=0, dialogAction, dragId, editor=null;
  const say=(nl,english)=>en?english:nl;
  const lastPollLabel=()=>say('Laatste poll op dit apparaat openen','Open the last poll on this device');
  const modeName=mode=>P.modes[mode]?.[en?1:0]||'Padel';
  const content=$('content');
  function el(tag,text,cls){
    const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;
  }
  function button(label,fn,primary=false){
    const b=el('button',label,primary?'primary':'');b.type='button';b.onclick=fn;return b;
  }
  function link(label,url,primary=false){const a=el('a',label,'button'+(primary?' primary':''));a.href=url;return a;}
  function card(title){const result=el('section',undefined,'card');result.append(el('h2',title));return result;}
  let fieldSerial=0;
  function field(parent,title,control){
    const label=el('label',undefined,'field'),caption=el('span',title);
    caption.id='poll-field-'+(++fieldSerial);control.setAttribute('aria-labelledby',caption.id);
    label.append(caption,control);parent.append(label);return control;
  }
  function input(type,value=''){const node=el('input');node.type=type;node.value=value;return node;}
  function select(options,value){
    const node=el('select');for(const [id,title] of options)node.add(new Option(title,id));node.value=value;return node;
  }
  function actions(parent,...children){const box=el('div',undefined,'actions');box.append(...children);parent.append(box);return box;}
  function header(settings,phase){
    document.documentElement.lang=en?'en':'nl';$('language').textContent=en?'NL':'EN';
    P.organizerLinks(en);
    const mode=settings?.format||'toss';
    $('art').src=P.art(mode,en);$('art').hidden=false;
    const activity=admin?say('Aanmeldingen beheren','Manage signups'):id?say('Aanmelden','Sign up'):say('Aanmeldpoll maken','Create a signup poll');
    $('phase').hidden=hubRoute;
    $('phase').textContent=hubRoute?'':activity+' · '+modeName(mode);
    $('heading').textContent=settings?.title||(!id?say('Nieuwe tossavond','New padel event'):say('Aanmeldingen','Signups'));
    $('event').textContent=settings?.date?dateText(settings)+' · '+settings.start+'–'+settings.end:'';
    document.title=$('heading').textContent+' · '+activity;
    $('listJump').hidden=true;
    const manageLink=$('manageLink');manageLink.hidden=!id || admin;
    if(id){manageLink.href='/beheer/'+id+(en?'?lang=en':'');manageLink.textContent=say('Deze avond beheren','Manage this event');}
    if(hubRoute){
      $('heading').textContent=say('Avonden beheren','Manage events');
      $('event').textContent='';document.title=$('heading').textContent+' · Padel Planner';
    }
    if(mineRoute){
      $('heading').textContent=say('Mijn polls','My polls');$('phase').hidden=true;$('event').textContent='';
      document.title=$('heading').textContent+' · Padel Planner';
    }
    if(phase==='planning' && !admin)$('phase').textContent=say('Indeling in voorbereiding','Preparing the schedule')+' · '+modeName(mode);
  }
  function dateText(s,year=false){return new Intl.DateTimeFormat(en?'en-GB':'nl-NL',{weekday:'long',day:'numeric',month:'long',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(s.date+'T12:00:00Z'));}
  function places(){return {in:say('Deelnemers','Playing'),wait:say('Wachtlijst · Ja','Waiting · Yes'),reserve:say('Reserve','Standby'),review:say('Alleen na akkoord','Needs approval'),out:say('Afgemeld','Unavailable')};}
  function friendly(err){
    const labels={'hub-unconfigured':say('Het algemene beheerwachtwoord is nog niet ingesteld.','The site organizer password has not been set.'),storage:say('Sta lokale opslag toe om je eigen reactie te kunnen beheren, of vraag de organisator je aan te melden.','Enable browser storage to manage your own response, or ask the organizer to sign you up.'),duplicate:say('Die naam staat al op de lijst. Gebruik ook een achternaam of initiaal.','That name is taken. Add an initial or last name.'),
      'organizer-login':say('Controleer je naam en wachtwoord.','Check your name and password.'),
      'organizer-name-used':say('Deze naam is al in gebruik. Is dit jouw naam in de planner? Vul je bestaande wachtwoord in. Kies anders een naam met je initiaal of achternaam.',
        'This name is already in use. Is it your name in the planner? Enter your existing password. Otherwise add an initial or surname to your name.'),
      'organizer-name':say('Vul je eigen naam in (maximaal 80 tekens).','Enter your own name (up to 80 characters).'),
      'organizer-linked':say('Deze poll hoort al bij een organisator.','This poll already belongs to an organizer.'),
      login:hubRoute?say('Controleer het algemene beheerwachtwoord.','Check the site organizer password.'):say('Controleer de beheercode van deze poll.','Check the organizer code for this poll.'),
      settings:say('Controleer datum, tijden, banen en aantal plekken.','Check the date, times, courts and places.'),
      field:say('Controleer de ingevulde velden.','Check the fields.'),locked:say('De aanmelding is gesloten.','Signups have closed.'),
      changed:say('De lijst is intussen gewijzigd. De nieuwste lijst is opgehaald. Controleer je keuze.','The list changed. Check your choice against the updated list.'),
      limit:say('Te veel pogingen. Probeer het over een kwartier opnieuw.','Too many attempts. Try again in 15 minutes.'),
      missing:say('Deze avond is niet meer beschikbaar. Controleer de link of neem contact op met de organisator.','This event is unavailable. Check the link or contact the organizer.'),
      'password-length':say('Kies een beheercode van 8 tot 128 tekens.','Choose an organizer code with 8 to 128 characters.'),
      'published-format':say('Heropen de aanmelding om de speelvorm te wijzigen.','Reopen signups before changing the format.')};
    return labels[err.message]||say('Opslaan of ophalen lukt niet. Controleer je verbinding en probeer opnieuw.','Could not save or refresh. Check your connection and try again.');
  }
  function modal(title,build,save,{format=current?.settings.format,remove=false}={}){
    $('dialogArt').src=P.art(format,en);$('dialogTitle').textContent=title;$('fields').replaceChildren();$('dialogError').textContent='';
    $('submitEdit').textContent=remove?say('Ja, verwijderen','Yes, delete'):say('Opslaan','Save');
    $('submitEdit').className=remove?'confirm-remove':'primary';
    $('dismiss').textContent=remove?say('Annuleren','Cancel'):say('Sluiten','Close');
    const read=build($('fields'));dialogAction=()=>save(read());$('dialog').showModal();
    if(remove)$('dismiss').focus();
  }
  $('dismiss').onclick=()=>$('dialog').close();
  $('dialog').oncancel=e=>{if($('submitEdit').disabled)e.preventDefault();};
  $('dialogForm').onsubmit=async e=>{
    e.preventDefault();if(pending || $('submitEdit').disabled)return;
    $('submitEdit').disabled=$('dismiss').disabled=true;
    try{
      const focusAfter=await dialogAction();$('dialog').close();
      if(focusAfter instanceof HTMLElement)focusAfter.focus({preventScroll:true});
    }
    catch(error){
      if(error.message==='changed' || (error.status===401 && error.message!=='organizer-name-used')){
        $('dialog').close();$('message').textContent=friendly(error);
      }else $('dialogError').textContent=friendly(error);
    }
    finally{$('submitEdit').disabled=$('dismiss').disabled=false;}
  };
  function configFields(root,initial,onChange){
    const grid=el('div',undefined,'grid');root.append(grid);
    const format=field(grid,say('Speelvorm','Format'),select(Object.keys(P.modes).map(k=>[k,modeName(k)]),initial.format));
    const title=field(grid,say('Naam van de avond','Event name'),input('text',initial.title));title.maxLength=80;title.required=true;
    const date=field(grid,say('Datum','Date'),input('date',initial.date));date.required=true;
    const start=field(grid,say('Begintijd','From'),input('time',initial.start));
    const end=field(grid,say('Eindtijd','Until'),input('time',initial.end));start.required=end.required=true;
    const courts=field(grid,say('Banen','Courts'),input('number',initial.courts));courts.min=2;courts.max=12;courts.required=true;
    const capacity=field(grid,say('Plekken','Places'),input('number',initial.capacity));capacity.min=4;capacity.max=96;capacity.required=true;
    const read=()=>({format:format.value,title:title.value,date:date.value,start:start.value,end:end.value,courts:Number(courts.value),capacity:Number(capacity.value)});
    if(onChange){
      let lastSuggested=initial.title,autoCapacity=true;
      capacity.addEventListener('input',()=>{autoCapacity=false;});
      function suggestCapacity(){
        const count=courts.valueAsNumber;
        if(autoCapacity && Number.isInteger(count) && count>=2 && count<=12){
          capacity.value=Math.min(96,count*(['toss','splitToss'].includes(format.value)?8:4));
        }
      }
      format.onchange=()=>{
        if(title.value===lastSuggested)title.value=modeName(format.value);
        lastSuggested=modeName(format.value);
        suggestCapacity();
      };
      // Finish the suggestion while the court field still has focus. Changing a
      // selected capacity on blur would move its caret before the first typed digit.
      courts.addEventListener('input',suggestCapacity);
      grid.addEventListener('input',()=>{const v=read();if(v.date)onChange(v);});
      grid.addEventListener('change',()=>{const v=read();if(v.date)onChange(v);});
    }
    return read;
  }
  function create(){
    const fmt=P.modes[new URLSearchParams(location.search).get('format')]?new URLSearchParams(location.search).get('format'):'toss';
    const today=new Date();const date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const initial={format:fmt,title:modeName(fmt),courts:fmt==='koc'?4:3,capacity:fmt==='koc'?16:fmt==='americano'?12:24,date,start:'21:00',end:'23:00'};
    header(initial);const section=card(say('Avond instellen','Event settings')),form=el('form');section.append(form);
    const read=configFields(form,initial,header);
    const central=new URLSearchParams(location.search).get('beheer')==='1';
    const owner=el('div'),ownerError=el('p',undefined,'error');let readOwner;
    ownerError.setAttribute('role','alert');
    owner.addEventListener('input',()=>{ownerError.textContent='';});
    function ownerFields(){
      owner.replaceChildren(el('h3',say('Jij als organisator','You as organizer')));
      readOwner=mine.credentials(owner,{setup:true,known:organizerName});
      ownerError.textContent='';owner.append(ownerError);
    }
    if(!central){ownerFields();form.append(owner);}
    const go=el('button',central?say('Aanmelding openen','Open signups'):say('Nieuwe poll aanmaken','Create new poll'),'primary');go.type='submit';actions(form,go);
    form.onsubmit=async e=>{
      e.preventDefault();if(pending)return;pending=true;go.disabled=true;
      try{
        const result=await P.api('',central?{settings:read(),central:true}:{settings:read(),...readOwner()});
        if(central)location.assign('/beheer?avond='+result.id);
        else{rememberAdmin(result);location.assign('/beheer/'+result.id+(en?'?lang=en':''));}
      }catch(error){
        if(central && error.status===401){location.assign('/beheer');return;}
        if(!central && error.status===401 && organizerName){
          organizerName=null;ownerFields();$('message').textContent=say('Log opnieuw in met je naam en wachtwoord.','Sign in again with your name and password.');return;
        }
        if(error.message==='organizer-name-used'){
          $('message').textContent='';ownerError.textContent=friendly(error);ownerError.scrollIntoView({block:'nearest'});return;
        }
        $('message').textContent=friendly(error);
      }finally{pending=false;go.disabled=false;}
    };
    if(!central)actions(section,link(say('Mijn polls openen','Open my polls'),'/mijn-polls'+(en?'?lang=en':'')));
    content.replaceChildren(section);
  }
  async function startCreate(){
    const serial=++sequence;
    if(new URLSearchParams(location.search).get('beheer')!=='1'){
      try{organizerName=(await P.api('/mine/status')).name;}catch{organizerName=null;}
    }
    if(serial!==sequence)return;
    create();content.setAttribute('aria-busy','false');
  }
  function reopenPoll(){
    const section=el('details',undefined,'card poll-legacy'),form=el('form');
    section.append(el('summary',say('Eerdere poll openen met een link of poll-ID','Open an earlier poll with its link or ID')));
    const last=P.preference('toss-poll-last'),path=key=>'/beheer/'+key+(en?'?lang=en':'');
    if(/^[a-f0-9]{14}$/.test(last))actions(section,link(lastPollLabel(),path(last)));
    const ref=field(form,say('Aanmeldlink of poll-ID','Signup link or poll ID'),input('text'));
    ref.required=true;ref.autocapitalize='none';ref.spellcheck=false;
    const hint=el('small',say('Vul daarna je beheercode in als daarom wordt gevraagd. Dit werkt op elk apparaat.',
      'Enter your organizer code when asked. This works on any device.'));
    hint.id='pollLookupHint';ref.setAttribute('aria-describedby',hint.id);form.append(hint);
    const open=el('button',say('Poll openen','Open poll'));open.type='submit';actions(form,open);
    ref.oninput=()=>ref.setCustomValidity('');
    form.onsubmit=event=>{
      event.preventDefault();
      let key=ref.value.trim();
      if(!/^[a-f0-9]{14}$/i.test(key)){
        try{
          const url=new URL(key,location.origin);
          key=url.origin===location.origin && (url.pathname.match(/^\/(?:aanmelden|beheer)\/([a-f0-9]{14})\/?$/i)?.[1] ||
            (/^\/beheer\/?$/.test(url.pathname) && url.searchParams.get('avond')));
        }catch{key=null;}
      }
      if(typeof key==='string' && /^[a-f0-9]{14}$/i.test(key)){location.assign(path(key.toLowerCase()));return;}
      ref.setCustomValidity(say('Plak de aanmeldlink van deze planner of vul de poll-ID van 14 tekens in.',
        'Paste a signup link from this planner or enter the 14-character poll ID.'));ref.reportValidity();
    };
    section.append(form);return section;
  }
  function rememberAdmin(r){P.remember(r.id,r.token);P.preference('toss-poll-last',r.id);}
  function login(){
    content.replaceChildren();const section=card(say('Inloggen voor beheer','Organizer sign-in')),form=el('form');
    const pw=field(form,say('Beheercode van deze poll','Organizer code for this poll'),input('password'));pw.required=true;pw.autocomplete='current-password';
    const go=el('button',say('Inloggen','Sign in'),'primary');go.type='submit';actions(form,go,link(say('Openbare aanmeldpagina','Public signup page'),'/aanmelden/'+id));section.append(form);content.append(section);
    form.onsubmit=async e=>{e.preventDefault();go.disabled=true;
      try{const result=await P.api(base+'/login',{password:pw.value});rememberAdmin({...result,id});$('message').textContent='';await load();}
      catch(error){$('message').textContent=friendly(error);}finally{go.disabled=false;}};
  }
  function resetEditor(){editor=null;content.replaceChildren();}
  function who(){
    try{return P.personalKey(false);}catch{return null;}
  }
  function responses(data){
    const mine=data.mine;
    if(!editor){
      const section=card(say('Jouw reactie','Your response')),form=el('form');
      const name=field(form,say('Jouw naam','Your name'),input('text',mine?.name||P.preference('toss-poll-name')||''));
      name.id='myName';name.autocomplete='given-name';name.maxLength=50;name.required=true;
      const controls=el('div',undefined,'actions'),own=el('p',undefined,'own-state');own.id='ownStatus';
      for(const [key,nl,english] of [['yes','Ja, ik doe mee','Yes, I’m playing'],['reserve','Alleen reserve','Standby only'],['no','Ik kan niet','Unavailable']]){
        const b=button(say(nl,english),()=>vote(key));b.dataset.answer=key;controls.append(b);
      }
      const cancel=button(say('Mijn aanmelding intrekken','Withdraw my signup'),()=>{if(confirm(say('Je eigen aanmelding intrekken?','Withdraw your own signup?')))vote('cancel');});
      form.onsubmit=e=>{e.preventDefault();vote('yes');};form.append(controls,own,cancel);
      form.append(el('p',say('Vol? Dan komt ‘Ja’ op de wachtlijst, vóór ‘Alleen reserve’.','Full? A ‘Yes’ joins the waitlist ahead of standby volunteers.'),'hint'));section.append(form);
      editor={section,form,name,controls,own,cancel};content.prepend(section);
    }
    for(const b of editor.controls.children)b.setAttribute('aria-pressed',String(mine?.answer===b.dataset.answer));
    editor.cancel.hidden=!mine || mine.answer==='cancel';
    editor.own.textContent=mine?(mine.answer==='cancel' && mine.place==='out'?say('Je aanmelding is ingetrokken.','You withdrew your signup.'):say('Je staat bij ','You are listed under ')+places()[mine.place]+'.'):'';
  }
  async function vote(answer){
    if(pending || !editor.form.reportValidity())return;
    pending=true;sequence++;editor.controls.inert=true;
    try{
      const data=await P.api(base,{name:editor.name.value.trim(),answer},{person:P.personalKey(true)});
      P.preference('toss-poll-name',editor.name.value.trim());publicPage(data);$('message').textContent=say('Je reactie is opgeslagen.','Your response has been saved.');
    }catch(error){$('message').textContent=friendly(error);if(error.message==='locked')await load(true);}
    finally{pending=false;if(editor)editor.controls.inert=false;}
  }
  function groups(data,manage){
    const old=$('groups'),list=el('div',undefined,'list'),queues=el('div',undefined,'queues');list.id='groups';
    const labels=places();
    const keys=manage?Object.keys(labels):['in','wait','reserve','out'];
    for(const key of keys){
      const rows=manage?data.entries.filter(e=>e.place===key):data.groups[key];
      const box=el('section',undefined,'group');box.dataset.place=key;
      const title=el('h3',labels[key]);title.append(el('span',key==='in'?rows.length+' / '+data.settings.capacity:String(rows.length),'count'));box.append(title);
      if(!rows.length)box.append(el('p',say('Nog niemand','No one yet'),'empty'));
      const ul=el('ol',undefined,'rows');box.append(ul);
      rows.forEach((entry,index)=>{
        const row=el('li',undefined,'row');row.append(el('span',String(index+1),'rank'));
        const person=el('span',entry.name,'person');row.append(person);
        if(manage){
          person.append(el('small',new Intl.DateTimeFormat(en?'en-GB':'nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(entry.at)+(entry.standing?say(' · groepsoordeel bewaard',' · group note saved'):'')));
          row.dataset.id=entry.id;row.draggable=true;row.ondragstart=e=>{dragId=entry.id;e.dataTransfer.setData('text/plain',entry.id);};row.ondragend=()=>{dragId=null;};
          const edit=button(say('Wijzig','Edit'),()=>entryModal(entry));edit.setAttribute('aria-label',say('Wijzig ','Edit ')+entry.name);row.append(edit);
        }
        ul.append(row);
      });
      if(manage){
        box.ondragover=e=>{if(dragId){e.preventDefault();box.classList.add('over');}};
        box.ondragleave=()=>box.classList.remove('over');
        box.ondrop=e=>{e.preventDefault();box.classList.remove('over');const entry=data.entries.find(x=>x.id===dragId);dragId=null;if(!entry)return;
          const before=rows.findIndex(x=>x.id===e.target.closest('li')?.dataset.id),position=before<0?rows.length+1:before+1;
          perform({action:'entry',id:entry.id,name:entry.name,place:key,position}).catch(error=>{$('message').textContent=friendly(error);});};
      }
      (key==='in'?list:queues).append(box);
    }
    list.append(queues);
    if(old)old.replaceWith(list);else content.append(list);
  }
  function publicPage(data){
    if(!current || current.phase!==data.phase)resetEditor();
    current=data;header(data.settings,data.phase);
    if(data.phase==='open'){
      const jump=$('listJump');jump.hidden=false;
      jump.textContent=data.groups.in.length+' / '+data.settings.capacity+' · '+say('Bekijk aanmeldingen','View signups');
      responses(data);groups(data,false);
    }else{
      resetEditor();const section=card(data.phase==='planning'?say('De indeling wordt gemaakt','The organizer is scheduling'):say('Het speelschema is klaar','The schedule is ready'));
      if(data.phase==='published')actions(section,link(say('Bekijk de baanindeling','View the court schedule'),'/s/'+data.viewCode,true));
      else section.append(el('p',say('Zodra de banen zijn ingedeeld, vind je het schema via deze link.','The court schedule will be available at this link.')));
      content.append(section);
    }
  }
  async function perform(body){
    if(pending)throw Error('changed');
    const eventId=id;
    pending=true;sequence++;
    try{
      const next=await P.api(base+'/admin',{revision:current.revision,...body},{token:adminToken()});
      if(eventId!==id)return;
      if(body.action==='repeat'){if(hubRoute){await hub.refresh(next.id);return;}P.remember(next.id,P.token(id));P.preference('toss-poll-last',next.id);location.assign('/beheer/'+next.id);return;}
      managePage(next);if(hubRoute)hub.refresh();$('message').textContent=say('Opgeslagen.','Saved.');
      return next;
    }catch(error){if(error.status===409 || error.status===401)await load(true);throw error;}
    finally{pending=false;}
  }
  function entryModal(entry){
    modal(entry?say('Speler wijzigen','Edit player'):say('Speler toevoegen','Add a player'),root=>{
      const name=field(root,say('Naam','Name'),input('text',entry?.name||''));name.required=true;name.maxLength=50;
      const place=field(root,say('Verplaats naar','Move to'),select(Object.entries(places()),entry?.place||'in'));
      const pos=field(root,say('Plek','Position'),el('select'));
      function positions(initial=false){
        const others=current.entries.filter(e=>e.place===place.value && e.id!==entry?.id);
        const max=place.value==='in'?Math.min(current.settings.capacity,others.length+1):others.length+1;
        pos.replaceChildren(...Array.from({length:max},(_,i)=>new Option(String(i+1),String(i+1))));
        const original=current.entries.filter(e=>e.place===entry?.place).findIndex(e=>e.id===entry?.id);
        pos.value=String(initial && entry?Math.min(max,original+1):max);
      }
      positions(true);place.onchange=()=>positions();
      let level;
      if(current.settings.format==='splitToss'){
        level=field(root,say('Speelgroep','Playing group'),select([['',say('Gelijk verdelen','Balance groups')],['0',say('Zilver','Silver')],['1',say('Goud','Gold')],['2',say('Platina','Platinum')]],entry?.level?.toString()||''));
      }
      const check=el('label',undefined,'check'),standing=input('checkbox');standing.checked=Boolean(entry?.standing);check.append(standing,el('span',say('Ook volgende edities van deze speelvorm alleen na mijn akkoord','Future editions of this format also require my approval')));root.append(check);
      standing.onchange=()=>{if(standing.checked){place.value='review';positions();}};
      if(entry && !(entry.answer==='cancel' && entry.place==='out')){
        actions(root,button(say('Aanmelding intrekken','Withdraw this signup'),async()=>{
          if(!confirm(say('Aanmelding van ','Withdraw signup for ')+entry.name+'?'))return;
          try{await perform({action:'withdraw',id:entry.id});$('dialog').close();}
          catch(error){$('dialogError').textContent=friendly(error);}
        }));
      }
      return ()=>({action:'entry',id:entry?.id,name:name.value.trim(),place:place.value,position:Number(pos.value),level:level?.value?Number(level.value):null,standing:standing.checked});
    },perform);
  }
  async function copyPublic(){
    const url=location.origin+'/aanmelden/'+id;
    try{await navigator.clipboard.writeText(url);$('message').textContent=say('Groepslink gekopieerd.','Group link copied.');}
    catch{const box=$('publicUrl');box.hidden=false;box.select();}
  }
  function managePage(data){
    current=data;resetEditor();header(data.settings,data.phase);
    const section=card(data.phase==='open'?say('Aanmelding open','Signups open'):data.phase==='planning'?say('Bezig met indelen','Preparing the schedule'):say('Schema gepubliceerd','Schedule published'));
    const controls=el('div',undefined,'actions');section.append(controls);
    const safe=fn=>async()=>{try{await fn();}catch(error){$('message').textContent=friendly(error);}};
    const plannerUrl=data.plannerId?'/beheer/sessie/'+data.plannerId:data.plannerKey?'/b/'+data.plannerKey:'/?poll='+id;
    if(data.phase==='open'){
      controls.append(button(say('Ga indelen','Start scheduling'),safe(async()=>{
        if(!confirm(say('Aanmelding sluiten en de namenlijst verbergen voor bezoekers?','Close signups and hide the list from visitors?')))return;
        await perform({action:'plan'});location.assign('/?poll='+id);
      }),true));
    }else{
      controls.append(link(say('Open planner','Open planner'),plannerUrl,true),button(say('Aanmelding heropenen','Reopen signups'),safe(async()=>{
        if(confirm(say('De namenlijst weer voor iedereen met de link openen?','Show the signup list again to anyone with the link?')))await perform({action:'reopen'});
      })));
    }
    if(navigator.share)controls.append(button(say('Groepslink delen','Share group link'),safe(async()=>{
      try{await navigator.share({title:data.settings.title,text:data.settings.title+' · '+dateText(data.settings),url:location.origin+'/aanmelden/'+id});}
      catch(error){if(error.name!=='AbortError')await copyPublic();}
    })));
    controls.append(button(say('Groepslink kopiëren','Copy group link'),copyPublic),link(say('Bekijk als bezoeker','Public view'),'/aanmelden/'+id));
    if(data.phase==='published' && data.viewCode)controls.append(link(say('Open liveweergave','Open live view'),'/s/'+data.viewCode));
    const url=input('text',location.origin+'/aanmelden/'+id);url.id='publicUrl';url.readOnly=true;url.hidden=true;section.append(url);
    const identifier=el('p',say('Poll-ID · ','Poll ID · '),'hint');identifier.append(el('code',id));section.append(identifier);
    const tools=card(say('Aanmeldlijst beheren','Manage signup list'));
    actions(tools,button(say('Speler toevoegen','Add a player'),()=>entryModal()),button(say('Avond wijzigen','Edit event'),()=>modal(say('Avond wijzigen','Edit event'),r=>configFields(r,current.settings),s=>perform({action:'settings',settings:s}))),
      button(say('Herhaal volgende week','Repeat next week'),safe(()=>perform({action:'repeat'}))));
    if(!hubRoute){
      actions(tools,link(say('Mijn polls','My polls'),'/mijn-polls'+(en?'?lang=en':'')));
      if(!data.hasOrganizer && P.token(id))actions(tools,button(say('Toevoegen aan Mijn polls','Add to my polls'),safe(async()=>{
        let known=null;
        try{known=(await P.api('/mine/status')).name;}catch(error){if(error.status!==401)throw error;}
        modal(say('Toevoegen aan Mijn polls','Add to my polls'),root=>{
          root.append(el('p',say('Deze avond en de herhalingen ervan komen bij jouw polls te staan.','This event and its repeats will appear in your polls.')));
          return mine.credentials(root,{setup:true,known});
        },async values=>{
          await P.api(base+'/organizer',values,{token:P.token(id)});
          P.remember(id,null);await load(true);$('message').textContent=say('Toegevoegd aan Mijn polls.','Added to my polls.');
        });
      })));
    }
    if(hubRoute)actions(tools,hub.removeButton('poll',data));
    else actions(tools,button(say('Uitloggen','Sign out'),safe(async()=>{
      if(P.token(id))await P.api(base+'/logout',{},{token:P.token(id)}).catch(e=>{if(e.status!==401)throw e;});
      await P.api('/mine/logout',{});await P.api('/hub/logout',{});P.remember(id,null);current=null;login();
    })));
    content.append(section,tools);groups(data,true);
  }
  async function load(force=false){
    if((pending && !force) || !id)return;
    const serial=++sequence;
    try{
      const data=await P.api(base+(admin?'/admin':''),undefined,admin?{token:adminToken()}:{person:who()});
      if(serial!==sequence)return;
      if(admin){if(force || data.revision!==current?.revision)managePage(data);}
      else if(force || JSON.stringify(data)!==JSON.stringify(current) || (data.phase==='open' && !$('groups')))publicPage(data);
    }catch(error){
      if(serial!==sequence)return;
      if(error.status===404){
        current=null;resetEditor();header(null);
        if(hubRoute)await hub.refresh();
        else if(admin){
          if(P.preference('toss-poll-last')===id)P.preference('toss-poll-last','');
          actions(content,link(say('Nieuwe poll aanmaken','Create new poll'),'/aanmaken'+(en?'?lang=en':'')));
        }
        $('message').textContent=friendly(error);return;
      }
      if(!admin){resetEditor();current=null;}
      if(admin && error.status===401){
        if(hubRoute){hub.lock();return;}
        P.remember(id,null);current=null;
        if(!content.querySelector('[autocomplete=current-password]')){
          try{const data=await P.api(base);if(serial!==sequence)return;header(data.settings,data.phase);}catch{}
          login();
        }
        if(!force)return;
      }
      $('message').textContent=friendly(error);
    }finally{content.setAttribute('aria-busy','false');}
  }
  $('language').onclick=()=>{en=!en;P.preference('toss-poll-lang',en?'en':'nl');resetEditor();current=null;if(hubRoute){header(null);hub.translate();}else if(mineRoute){header(null);mine.refresh();}else if(id)load(true);else startCreate();};
  function active(){return !document.hidden && !$('dialog').open && !dragId && (!admin || current || P.token(id));}
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && !admin){sequence++;$('groups')?.remove();}
    else if(!document.hidden)load();
  });
  window.addEventListener('pageshow',()=>{if(id)load();});
  mine=window.TossMyPolls({P,say,modeName,dateText,el,button,link,card,field,input,actions,friendly,content,legacy:reopenPoll});
  header(null);
  if(hubRoute){
    hub=window.TossOrganizerHub({P,say,modeName,dateText,el,button,link,card,field,input,actions,modal,friendly,content,
      canSwitch:()=>!pending && !$('dialog').open && !dragId,
      select:async key=>{
        ++sequence;id=key;base=id?'/'+id:'';current=null;resetEditor();header(null);
        if(id)await load(true);
      }});
    hub.start();
    setInterval(()=>{if(id && active())load();},5000);
  }else if(mineRoute)mine.start();
  else if(!id)startCreate();
  else {load();setInterval(()=>{if(active())load();},5000);}
})();
