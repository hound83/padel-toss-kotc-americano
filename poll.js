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
    const mineNav=$('myPollsNav');mineNav.hidden=!(id && admin && !hubRoute);
    mineNav.href='/mijn-polls'+(en?'?lang=en':'');mineNav.textContent=say('Mijn polls','My polls');
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
  function places(format=current?.settings.format){return {in:say('Deelnemers','Playing'),wait:say('Wachtlijst · Ja','Waiting · Yes'),...(format==='koc'?{reserve:say('Reserve','Standby')}:{}),out:say('Afgemeld','Unavailable')};}
  function friendly(err){
    const labels={'hub-unconfigured':say('Het algemene beheerwachtwoord is nog niet ingesteld.','The site organizer password has not been set.'),storage:say('Sta lokale opslag toe om je eigen reactie te kunnen beheren, of vraag de organisator je aan te melden.','Enable browser storage to manage your own response, or ask the organizer to sign you up.'),duplicate:say('Die naam staat al op de lijst. Gebruik ook een achternaam of initiaal.','That name is taken. Add an initial or last name.'),
      'reserve-format':say('Alleen bij King of the Court kun je reserve kiezen.','Standby is available for King of the Court only.'),
      'rating-format':say('Vul je actuele rating in met twee cijfers achter de komma, bijvoorbeeld 7,89.','Enter your current rating with two decimal places, for example 7.89.'),
      place:say('Ververs de pagina en kies een beschikbare lijst en plek.','Refresh the page and choose an available list and position.'),
      'pin-login':say('Controleer je naam en de pincode voor deze avond.','Check your name and the PIN for this event.'),
      'pin-format':say('Vul precies vier cijfers in.','Enter exactly four digits.'),
      'pin-limit':say('Te veel pogingen. Probeer het later opnieuw of vraag de organisator om hulp.','Too many attempts. Try again later or ask the organizer for help.'),
      'pin-device':say('Dit apparaat hoort al bij een andere inschrijving voor deze avond.','This device already has another signup for this event.'),
      'pin-set':say('Deze inschrijving heeft al een pincode.','This signup already has a PIN.'),
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
      'organizer-password-length':say('Kies een wachtwoord van 6 tot 128 tekens.','Choose a password with 6 to 128 characters.'),
      'password-length':say('Kies een beheercode van 8 tot 128 tekens.','Choose an organizer code with 8 to 128 characters.'),
      'published-format':say('Heropen de aanmelding om de speelvorm te wijzigen.','Reopen signups before changing the format.')};
    return labels[err.message]||say('Opslaan of ophalen lukt niet. Controleer je verbinding en probeer opnieuw.','Could not save or refresh. Check your connection and try again.');
  }
  function modal(title,build,save,{format=current?.settings.format,remove=false,submitLabel}={}){
    $('dialogArt').src=P.art(format,en);$('dialogTitle').textContent=title;$('fields').replaceChildren();$('dialogError').textContent='';
    $('submitEdit').textContent=submitLabel||(remove?say('Ja, verwijderen','Yes, delete'):say('Opslaan','Save'));
    $('submitEdit').className=remove?'confirm-remove':'primary';
    $('dismiss').textContent=remove?say('Annuleren','Cancel'):say('Sluiten','Close');
    const read=build($('fields'));dialogAction=()=>save(read());if(!$('dialog').open)$('dialog').showModal();
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
      if(error.message==='changed' || (error.status===401 && !['organizer-name-used','pin-login'].includes(error.message))){
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
  function creatorField(root){
    const name=field(root,say('Jouw naam','Your name'),input('text'));
    name.autocomplete='name';name.required=true;name.maxLength=80;
    const hint=el('small',say('Zo zien beheerders wie deze avond heeft aangemaakt.','This tells organizers who created this event.'));
    hint.id=name.getAttribute('aria-labelledby')+'-hint';name.setAttribute('aria-describedby',hint.id);name.parentElement.append(hint);
    return name;
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
    if(central){
      const name=creatorField(form);
      readOwner=()=>({central:true,creatorName:name.value.trim()});
    }else{ownerFields();form.append(owner);}
    const go=el('button',central?say('Aanmelding openen','Open signups'):say('Nieuwe poll aanmaken','Create new poll'),'primary');go.type='submit';actions(form,go);
    form.onsubmit=async e=>{
      e.preventDefault();if(pending)return;pending=true;go.disabled=true;
      try{
        const result=await P.api('',{settings:read(),...readOwner()});
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
  function pinField(parent,title,creating){
    const pin=field(parent,title,input('password'));
    pin.inputMode='numeric';pin.pattern='[0-9]{4}';pin.maxLength=4;pin.minLength=4;pin.required=true;
    pin.autocomplete=creating?'new-password':'off';
    return pin;
  }
  function ratingField(parent,title,value){
    const rating=field(parent,title,input('text',displayRating(value)));
    rating.inputMode='decimal';rating.pattern='[0-9]{1,2}[.,][0-9]{2}';rating.maxLength=5;
    rating.placeholder=en?'7.89':'7,89';
    return rating;
  }
  function displayRating(value){return (value||'').replace('.',en?'.':',');}
  function recoverResponse(){
    modal(say('Mijn inschrijving openen','Open my signup'),root=>{
      root.append(el('p',say('Vul de naam in die nu op je inschrijving staat en de vier cijfers die je voor deze avond hebt gekozen. Daarna kun je je voornaam of reactie wijzigen.','Enter the name currently on your signup and the four digits you chose for this event. You can then change your first name or response.')));
      const name=field(root,say('Naam op de aanmeldlijst','Name on the signup list'),input('text',editor.name.value));
      name.required=true;name.maxLength=50;name.autocomplete='given-name';
      const pin=pinField(root,say('Pincode voor deze avond','PIN for this event'),false);
      return ()=>({name:name.value.trim(),pin:pin.value});
    },async body=>{
      await P.api(base+'/recover',body,{person:P.personalKey(true)});
      resetEditor();await load(true);$('message').textContent=say('Je inschrijving is geopend.','Your signup is open.');
    },{submitLabel:say('Inschrijving openen','Open signup')});
  }
  function signupHelp(){
    const help=el('details',undefined,'signup-help');
    help.append(el('summary',say('Wie kan mijn inschrijving aanpassen?','Who can edit my signup?')),
      el('p',say('Zolang de aanmelding open is, kun je je eigen reactie aanpassen. Open de aanmeldlink in dezelfde browser, of gebruik op een ander apparaat je naam en de pincode voor deze avond.',
        'While signups are open, you can edit your own response. Open the link in the same browser, or use your name and event PIN on another device.')),
      el('p',say('Pincode vergeten of hulp nodig? Vraag de maker van de poll. Die kan via Mijn polls met de eigen naam en het wachtwoord jouw inschrijving aanpassen. Een beheerder met het algemene beheerwachtwoord kan alle geplande avonden beheren.',
        'Forgot your PIN or need help? Ask the person who created the poll. They can open My polls with their name and password and edit your signup. A site organizer with the site password can manage all planned events.')));
    return help;
  }
  function responseForm(mine){
    const section=card(say('Jouw reactie','Your response')),form=el('form');
    try{localStorage.removeItem('toss-poll-name');}catch{}
    const name=field(form,say('Jouw naam','Your name'),input('text',mine?.name||''));
    name.id='myName';name.autocomplete='given-name';name.maxLength=50;name.required=true;
    const nameHint=el('small',say('Elke naam kan één keer op de lijst. Met een optionele pincode wordt je voornaam je inlognaam voor deze avond. Is je naam al bezet? Voeg een initiaal toe.','Each name can sign up once. With an optional PIN, your first name becomes your sign-in name for this event. If your name is taken, add an initial.'));
    nameHint.id='signupNameHint';form.append(nameHint);name.setAttribute('aria-describedby',nameHint.id);
    const controls=el('div',undefined,'actions'),own=el('p',undefined,'own-state');own.id='ownStatus';
    controls.setAttribute('role','group');controls.setAttribute('aria-label',say('Kies je reactie','Choose your response'));
    const koc=current.settings.format==='koc';
    const yes=koc?['yes','Ja, ik doe mee (actuele rating 8,00 of lager)','Yes, I’m playing (current rating 8.00 or lower)']:['yes','Ja, ik doe mee','Yes, I’m playing'];
    const choices=[yes,...(koc?[['reserve','Alleen reserve','Standby only']]:[]),['no','Ik kan niet','Unavailable']];
    for(const [key,nl,english] of choices){
      const choice=button(say(nl,english),()=>{editor.selected=key;responses(current);});
      choice.dataset.answer=key;controls.append(choice);
    }
    const ratingBox=el('div',undefined,'signup-rating');
    const rating=koc?ratingField(ratingBox,say('Jouw actuele rating','Your current rating'),mine?.rating):null;
    const ratingWarning=el('p',undefined,'rating-warning');ratingWarning.id='ratingWarning';ratingWarning.setAttribute('role','alert');
    if(rating){
      const example=el('small',say('Vul twee cijfers na de komma in, bijvoorbeeld 7,89.','Use two decimal places, for example 7.89.'));
      example.id='ratingHint';rating.setAttribute('aria-describedby','ratingHint ratingWarning');
      ratingBox.append(example,ratingWarning);rating.oninput=()=>responses(current);
    }
    const pinOption=el('div',undefined,'signup-pin'),check=el('label',undefined,'check'),wantPin=input('checkbox');
    check.append(wantPin,el('span',say('Mijn voornaam voor deze avond vastleggen met een pincode','Set up my first name and PIN for this event')));pinOption.append(check);
    const pinBox=el('div');pinOption.append(pinBox);
    const pin=pinField(pinBox,say('Kies een pincode van vier cijfers','Choose a four-digit PIN'),true);
    const hint=el('small',say('Open op je andere telefoon of laptop dezelfde aanmeldlink en kies ‘Mijn inschrijving openen’. Vul je huidige naam en deze pincode in. Daarna kun je je voornaam of reactie wijzigen. De code geldt alleen voor deze avond.','On your other phone or laptop, open the same signup link and choose “Open my signup”. Enter your current name and this PIN to change your first name or response. The PIN is for this event only.'));
    hint.id='signupPinHint';pin.setAttribute('aria-describedby',hint.id);pinBox.append(hint);
    const notice=el('p',undefined,'signup-warning');notice.setAttribute('aria-live','polite');
    const save=button(say('Reactie bevestigen','Confirm response'),vote,true);
    const open=button(say('Mijn inschrijving openen','Open my signup'),recoverResponse);open.className='text-action';
    name.addEventListener('input',()=>responses(current));
    wantPin.onchange=()=>{if(!wantPin.checked)pin.value='';responses(current);if(wantPin.checked)pin.focus();};
    form.onsubmit=event=>event.preventDefault();
    form.append(controls,ratingBox,own,pinOption,notice);actions(form,save);
    form.append(el('p',koc?say('Vol? Dan komt ‘Ja’ op de wachtlijst, vóór ‘Alleen reserve’.','Full? A ‘Yes’ joins the waitlist ahead of standby volunteers.'):
      say('Is de avond vol? Met ‘Ja’ kom je op de wachtlijst.','Event full? Choose Yes to join the waitlist.'),'hint'));
    section.append(form,open,signupHelp());content.prepend(section);
    return {section,form,name,controls,own,pinOption,wantPin,pinBox,pin,ratingBox,rating,ratingWarning,notice,save,open,selected:null,lastName:mine?.name,lastRating:mine?.rating};
  }
  function responses(data){
    const mine=data.mine;
    if(!editor)editor=responseForm(mine);
    const {name,controls,own,pinOption,wantPin,pinBox,pin,ratingBox,rating,ratingWarning,notice,save,open}=editor;
    if(mine && name.value===editor.lastName)name.value=mine.name;
    editor.lastName=mine?.name;
    const selected=editor.selected||mine?.answer;
    ratingBox.hidden=!rating || selected!=='yes';
    let ratingChanged=false,aboveLimit=false;
    if(rating){
      if(rating.value===displayRating(editor.lastRating))rating.value=displayRating(mine?.rating);
      editor.lastRating=mine?.rating;
      rating.disabled=ratingBox.hidden;rating.required=!rating.disabled;
      ratingChanged=!rating.disabled && rating.value.replace(',','.')!==(mine?.rating||'');
      aboveLimit=!rating.disabled && rating.validity.valid && Number(rating.value.replace(',','.'))>8;
      ratingWarning.hidden=!aboveLimit;
      const warning=aboveLimit?say('Je rating ligt boven 8,00. Je kunt Ja bevestigen, maar je kunt je speelplek verliezen. Verplaatst de organisator je later naar Reserve, dan sluit je achteraan aan met het tijdstip van die verplaatsing.','Your rating is above 8.00. You can confirm Yes, but you may lose your place. If the organizer moves you to standby, you join the end of that list at the time of the move.'):'';
      if(ratingWarning.textContent!==warning)ratingWarning.textContent=warning;
    }
    for(const choice of controls.children)choice.setAttribute('aria-pressed',String(selected===choice.dataset.answer));
    own.textContent=mine?(mine.answer==='cancel' && mine.place==='out'?say('Kies en bevestig je reactie om je weer aan te melden.','Choose and confirm a response to sign up again.'):say('Je staat bij ','You are listed under ')+places()[mine.place]+'.'):'';
    pinOption.hidden=Boolean(mine?.hasPin);pinBox.hidden=pin.disabled=pinOption.hidden || !wantPin.checked;
    open.hidden=Boolean(mine);
    const changing=selected!==mine?.answer;
    const givesUp=changing && ((mine?.place==='in' && ['reserve','no'].includes(selected)) || (mine?.place==='wait' && ['reserve','no'].includes(selected)) || (mine?.place==='reserve' && selected==='no'));
    const correction=mine?.correction;
    if(correction && correction.until>Date.now()){
      const time=new Intl.DateTimeFormat(en?'en-GB':'nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Amsterdam'}).format(correction.until);
      const answer=correction.answer==='yes'?say('Ja','Yes'):say('Alleen reserve','Standby only');
      notice.textContent=say('Bevestig ‘'+answer+'’ vóór '+time+' om je eerdere aanmeldtijd terug te krijgen. Iemand die al is doorgeschoven houdt de plek.',
        'Confirm “'+answer+'” before '+time+' to recover your previous signup time. Anyone already promoted keeps their place.');
    }else notice.textContent=givesUp?say('Na bevestigen komt je plek vrij. Binnen 10 minuten kun je terug met je eerdere aanmeldtijd. Iemand die al is doorgeschoven houdt de plek.',
      'Confirming frees your place. You have 10 minutes to return with your previous signup time. Anyone already promoted keeps their place.'):'';
    notice.hidden=!notice.textContent;
    save.textContent=aboveLimit?say('Toch Ja bevestigen','Confirm Yes anyway'):say('Reactie bevestigen','Confirm response');
    save.disabled=pending || !selected || !(changing || ratingChanged || (mine && name.value.trim()!==mine.name) || !pin.disabled);
  }
  async function vote(){
    if(pending || editor.save.disabled || !editor.form.reportValidity())return;
    const {name,pin,rating}=editor,answer=editor.selected||current.mine?.answer;
    const ratingValue=rating && !rating.disabled?rating.value.replace(',','.'):undefined;
    const onlyPin=!pin.disabled && current.mine?.answer===answer && current.mine.name===name.value.trim() && (ratingValue===undefined || ratingValue===current.mine.rating);
    const body=onlyPin?{action:'set-pin'}:{name:name.value.trim(),answer};
    if(!onlyPin && ratingValue!==undefined)body.rating=ratingValue;
    if(!pin.disabled)body.pin=pin.value;
    pending=true;sequence++;editor.form.inert=true;
    try{
      const data=await P.api(base,body,{person:P.personalKey(true)});
      if(rating && data.mine.rating)rating.value=displayRating(data.mine.rating);
      editor.selected=null;editor.wantPin.checked=false;editor.pin.value='';editor.name.value=data.mine.name;
      publicPage(data);$('message').textContent=say('Je reactie is opgeslagen.','Your response has been saved.');
    }catch(error){$('message').textContent=friendly(error);if(['locked','changed'].includes(error.message))await load(true);}
    finally{pending=false;if(editor){editor.form.inert=false;responses(current);}}
  }
  let expandedOutFor=null;
  function groups(data,manage){
    const old=$('groups'),list=el('div',undefined,'list'),queues=el('div',undefined,'queues');list.id='groups';
    const labels=places(data.settings.format);
    for(const key of Object.keys(labels)){
      const rows=manage?data.entries.filter(e=>e.place===key):data.groups[key];
      const collapsed=key==='out',box=el(collapsed?'details':'section',undefined,'group');box.dataset.place=key;
      const title=el('h3',labels[key]);title.append(el('span',key==='in'?rows.length+' / '+data.settings.capacity:String(rows.length),'count'));
      if(collapsed){
        const summary=el('summary');summary.append(title);box.append(summary);box.open=expandedOutFor===data.id;
        box.ontoggle=()=>{if(box.isConnected)expandedOutFor=box.open?data.id:null;};
      }else box.append(title);
      if(!rows.length)box.append(el('p',say('Nog niemand','No one yet'),'empty'));
      const ul=el('ol',undefined,'rows');box.append(ul);
      rows.forEach((entry,index)=>{
        const row=el('li',undefined,'row');row.append(el('span',String(index+1),'rank'));
        const person=el('span',entry.name,'person');row.append(person);
        if(manage){
          person.append(el('small',new Intl.DateTimeFormat(en?'en-GB':'nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(entry.at)));
          if(data.settings.format==='koc' && entry.rating)person.append(el('small','Rating '+displayRating(entry.rating)));
          row.dataset.id=entry.id;row.classList.add('player-card');
          const grip=el('span',undefined,'player-grip');grip.setAttribute('aria-hidden','true');grip.title=say('Sleep om te verplaatsen','Drag to move');row.prepend(grip);
          const edit=button(say('Aanpassen','Edit'),()=>entryModal(entry));edit.setAttribute('aria-label',say(entry.name+' aanpassen','Edit '+entry.name));row.append(edit);
        }
        ul.append(row);
      });
      (key==='in'?list:queues).append(box);
    }
    list.append(queues);
    if(manage)window.TossPlayerCards(list,data.entries,{
      busy:playerId=>{dragId=playerId;if(playerId)sequence++;},
      move:(entry,place,position)=>perform({action:'entry',revision:data.revision,id:entry.id,name:entry.name,place,position})
        .catch(error=>{$('message').textContent=friendly(error);})
    });
    if(old)old.replaceWith(list);else content.append(list);
  }
  function publicPage(data){
    if(!current || current.phase!==data.phase || current.settings.format!==data.settings.format)resetEditor();
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
  function entryFields(root,entry,poll){
    const name=field(root,say('Naam','Name'),input('text',entry?.name||''));name.required=true;name.maxLength=50;
    const rating=poll.settings.format==='koc'?ratingField(root,say('Actuele rating (optioneel)','Current rating (optional)'),entry?.rating):null;
    const place=field(root,say('Verplaats naar','Move to'),select(Object.entries(places()),entry?.place||'in'));
    const pos=field(root,say('Plek','Position'),el('select'));
    function positions(initial=false){
      const others=poll.entries.filter(e=>e.place===place.value && e.id!==entry?.id);
      const max=place.value==='in'?Math.min(poll.settings.capacity,others.length+1):others.length+1;
      pos.replaceChildren(...Array.from({length:max},(_,i)=>new Option(String(i+1),String(i+1))));
      const original=poll.entries.filter(e=>e.place===entry?.place).findIndex(e=>e.id===entry?.id);
      pos.value=String(initial && entry?Math.min(max,original+1):max);
    }
    positions(true);place.onchange=()=>positions();
    let level;
    if(poll.settings.format==='splitToss'){
      level=field(root,say('Speelgroep','Playing group'),select([['',say('Gelijk verdelen','Balance groups')],['0',say('Zilver','Silver')],['1',say('Goud','Gold')],['2',say('Platina','Platinum')]],entry?.level?.toString()||''));
    }
    if(entry && !(entry.answer==='cancel' && entry.place==='out')){
      actions(root,button(say('Aanmelding intrekken','Withdraw this signup'),async()=>{
        if(!confirm(say('Aanmelding van ','Withdraw signup for ')+entry.name+'?'))return;
        try{await perform({action:'withdraw',id:entry.id,revision:poll.revision});$('dialog').close();}
        catch(error){$('dialogError').textContent=friendly(error);}
      }));
    }
    if(entry){
      const remove=button(say('Speler verwijderen','Delete player'),()=>{
        modal(say('Speler verwijderen?','Delete player?'),confirmation=>{
          confirmation.append(el('strong',entry.name+' · '+poll.settings.title),el('p',say(
            'Deze speler verdwijnt uit de aanmeldlijst van deze avond. Ook de eventuele pincode vervalt. Een vrijgekomen plek gaat naar de eerstvolgende speler. Een al gepubliceerd speelschema kun je afzonderlijk wijzigen.',
            'This player will be removed from this event’s signup list. Their PIN, if set, will expire. The next eligible player takes a freed place. A published schedule can be edited separately.')));
          return ()=>({action:'remove-entry',id:entry.id,revision:poll.revision});
        },perform,{remove:true,format:poll.settings.format});
      });
      remove.className='remove-item';actions(root,remove);
    }
    return ()=>({action:'entry',revision:poll.revision,id:entry?.id,name:name.value.trim(),place:place.value,position:Number(pos.value),level:level?.value?Number(level.value):null,...(rating?{rating:rating.value||null}:{})});
  }
  function entryModal(entry=null,chooseExisting=false){
    const poll=current,editing=Boolean(entry)||chooseExisting;
    modal(editing?say('Speler aanpassen','Edit player'):say('Speler toevoegen','Add a player'),root=>{
      if(!editing)return entryFields(root,null,poll);
      const players=[...poll.entries].sort((a,b)=>a.name.localeCompare(b.name,en?'en':'nl',{sensitivity:'base'}));
      const options=[['',say('Selecteer een speler','Select a player')],...players.map(p=>[p.id,p.name])];
      const picker=field(root,say('Kies een speler','Choose a player'),select(options,entry?.id||''));
      picker.required=true;
      const details=el('div');root.append(details);
      let read;
      function choose(){
        details.replaceChildren();$('dialogError').textContent='';
        const selected=poll.entries.find(p=>p.id===picker.value);
        read=selected?entryFields(details,selected,poll):null;
      }
      picker.onchange=choose;choose();
      return ()=>{if(!read)throw Error('field');return read();};
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
    if(data.entries.length)tools.append(el('p',say('Sleep een spelerskaartje naar een lijst of plek. Op je telefoon sleep je aan de stippen.','Drag a player card to a list or position. On your phone, drag the dotted handle.'),'hint'));
    const editPlayers=data.entries.length?[button(say('Aanpassen','Edit player'),()=>entryModal(null,true))]:[];
    actions(tools,button(say('Speler toevoegen','Add a player'),()=>entryModal()),...editPlayers,button(say('Avond wijzigen','Edit event'),()=>modal(say('Avond wijzigen','Edit event'),r=>configFields(r,current.settings),s=>perform({action:'settings',settings:s}))),
      button(say('Herhaal volgende week','Repeat next week'),safe(()=>{
        if(data.next || !data.askRepeatName)return perform({action:'repeat'});
        modal(say('Herhaal volgende week','Repeat next week'),root=>{
          const name=creatorField(root);
          return ()=>({action:'repeat',revision:data.revision,creatorName:name.value.trim()});
        },perform);
      })));
    if(!hubRoute){
      if(!data.hasOrganizer && P.token(id))actions(section,button(say('Toevoegen aan Mijn polls','Add to my polls'),safe(async()=>{
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
    if(((pending || dragId) && !force) || !id)return;
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
