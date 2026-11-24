/* The organizer opens the same planner on each device. Only explicit sharing uploads a schedule. */
(function(){
  'use strict';
  function setup(app){
    const $=id=>document.getElementById(id);
    const say=(nl,en)=>app.language()==='en'?en:nl;
    const dialog=$('shareDialog'),info=$('shareInfo');
    const guestUrl=code=>code ? location.origin+'/s/'+code.slice(0,4)+'-'+code.slice(4) : '';
    let centralSession=location.pathname.match(/^\/beheer\/sessie\/([a-f0-9-]{36})\/?$/)?.[1];
    let secret=centralSession || location.pathname.match(/^\/b\/([0-9a-f]{48})\/?$/)?.[1];
    let meta=null,base='',busy=false,timer,queued=false,sequence=0,applying=false,missing=false,modePending=null;
    const journal=()=> 'padel-v31-pending-'+secret?.slice(0,12);
    const notice=document.createElement('aside'),message=document.createElement('span');
    notice.className='session-notice';notice.setAttribute('role','status');notice.hidden=true;
    const download=document.createElement('button');download.type='button';download.className='btn btn-ghost';download.hidden=true;
    notice.append(message,download);document.body.prepend(notice);
    function announce(value){
      message.textContent=value;notice.hidden=!value && download.hidden;
    }
    function pending(){try{return JSON.parse(localStorage.getItem(journal()));}catch{return null;}}
    function record(document,revision){
      try{localStorage.setItem(journal(),JSON.stringify({document,revision,expires:meta?.expires}));}catch{}
    }
    function clearPending(){try{localStorage.removeItem(journal());}catch{}}
    const conflictKey=()=>journal()+'-conflict';
    function conflict(local){
      if(!local)return;
      try{localStorage.setItem(conflictKey(),JSON.stringify({local,expires:meta?.expires || Date.now()+7*86400000}));}catch{}
      download.hidden=false;
      download.textContent=say('Eigen versie downloaden','Download local version');
      download.onclick=()=>{
        const body=JSON.stringify({format:'padel-scheduler',version:2,state:local.state},null,2);
        const file=URL.createObjectURL(new Blob([body],{type:'application/json'}));
        const a=document.createElement('a');a.href=file;a.download='koriander-lokale-wijzigingen.json';a.click();
        setTimeout(()=>URL.revokeObjectURL(file),2000);
        try{localStorage.removeItem(conflictKey());}catch{}
        download.hidden=true;announce('');
      };
      announce(say('Een ander apparaat heeft het schema gewijzigd. De nieuwste stand is geopend. Je eigen versie is beschikbaar als bestand.',
        'Another device updated the schedule. The latest version is open. Your local edits are available as a file.'));
    }
    async function request(url,body,conditional=false){
      const headers={};
      if(url==='/api/manage'){
        if(centralSession)url+='/'+centralSession;
        else if(secret)headers.Authorization='Bearer '+secret;
      }
      if(body)headers['Content-Type']='application/json';
      if(conditional && meta)headers['If-None-Match']=String(meta.revision);
      const response=await fetch(url,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});
      if(response.status===304)return null;
      if(!response.ok)throw Object.assign(new Error('session'),{status:response.status});
      return response.json();
    }
    const pollButtons=[];
    let publishedPoll=null;
    function drawPollButtons(){
      const poll=app.poll?.();
      for(const b of pollButtons){
        b.hidden=!poll || !app.hasDraw();b.disabled=busy || publishedPoll===poll?.id;
        b.textContent=publishedPoll && publishedPoll===poll?.id?say('Gepubliceerd voor deelnemers','Published for players'):say('Publiceer op de aanmeldlink','Publish to the signup link');
      }
    }
    let finalState=null;
    function setMeta(value){meta={revision:value.revision,expires:value.expires,mode:value.mode,closed:value.closed,links:value.links};}
    function restore(remote){
      applying=true;
      try{setMeta(remote);app.restore(remote.state);base=JSON.stringify(app.snapshot());finalState=remote.closed?structuredClone(remote.state):null;}
      finally{applying=false;}
    }
    function unavailable(error){
      if(error.status===401 && centralSession){location.replace('/beheer?sessie='+centralSession);return;}
      if(error.status===404 && secret){
        const local=pending();if(local?.expires>Date.now())conflict(local.document);
        else try{localStorage.removeItem(conflictKey());}catch{}
        clearPending();meta=null;missing=true;clearTimeout(timer);
        announce(say('Deze beheerlink is verlopen of ongeldig. Controleer de link die je op de laptop hebt gekopieerd.',
          'This organizer link has expired or is invalid. Check the link you copied on the laptop.'));
      }else announce(say('Geen verbinding met de sessie. Lokale wijzigingen wachten op synchronisatie.',
        'No connection to the session. Local changes are waiting to sync.'));
    }
    function draw(){
      drawPollButtons();if(!dialog.open)return;
      const doc=app.snapshot(), fields=!!meta,closed=!!meta?.closed;
      const canEnter=!!doc?.view.rounds.some(rd=>rd.rows.some(row=>row.slot));
      $('sharePublish').hidden=fields || !doc;$('sharePublish').disabled=!app.hosted || busy;
      $('sharePublish').textContent=say('Sessie online zetten','Start online session');
      $('viewCaption').hidden=$('shareUrl').hidden=$('shareCopy').hidden=!fields;
      $('viewCaption').textContent=say('Kijklink','View link');
      $('shareUrl').value=guestUrl(meta?.links.find(l=>l.role==='view')?.code);
      $('entryGroup').hidden=!fields || !canEnter;
      $('modeCaption').textContent=say('Wie mag uitslagen invullen?','Who can enter scores?');
      const options=[say('Alleen de organisator','Organizer only'),say('Eén invullink voor de groep','One entry link for the group'),say('Een eigen invullink per speler','A personal link for each player')];
      Array.from($('entryMode').options).forEach((opt,i)=>{opt.textContent=options[i];});
      $('entryMode').value=modePending || meta?.mode || 'view';$('entryMode').disabled=busy || closed;
      const personal=fields && meta.mode==='personal';
      $('recipientCaption').textContent=say('Speler','Player');$('recipientCaption').hidden=$('entryPlayer').hidden=!personal;
      if(personal && doc){
        const selected=$('entryPlayer').value;
        const names=Object.entries(doc.view.playerIds).sort(([a],[b])=>a.localeCompare(b));
        $('entryPlayer').replaceChildren(...names.map(([name,id])=>new Option(name,id)));
        if(names.some(([,id])=>id===selected))$('entryPlayer').value=selected;
      }
      const code=meta?.links.find(l=>l.role===meta.mode && (personal?l.player===$('entryPlayer').value:l.role==='group'))?.code;
      $('entryUrl').hidden=$('entryCopy').hidden=!code || closed || !!modePending;$('entryUrl').value=modePending?'':guestUrl(code);
      $('entryPlayer').disabled=busy || closed;
      $('ownerGroup').hidden=!fields;$('ownerCaption').textContent=say('Beheer op een ander apparaat','Manage on another device');
      $('ownerHint').textContent=say('Stuur deze privélink naar jezelf. Hiermee opent de volledige planner.','Send this private link to yourself. It opens the full planner.');
      if(centralSession)$('ownerHint').textContent=say('Deze link opent de planner na inloggen met het centrale beheerwachtwoord.','This link opens the planner after signing in with the central organizer password.');
      $('ownerUrl').value=centralSession?location.origin+'/beheer/sessie/'+centralSession:secret?location.origin+'/b/'+secret:'';
      $('ownerCopy').textContent=say('Beheerlink kopiëren','Copy organizer link');
      $('shareEnd').hidden=!fields || closed;$('shareEnd').disabled=busy;
      $('shareEnd').textContent=say('Sessie beëindigen','End session');
      if(!app.hosted)info.textContent=say('Online delen is beschikbaar op de sessiesite.','Online sharing is available on the session site.');
      else if(!doc && !fields)info.textContent=say('Maak eerst een indeling.','Generate a schedule first.');
      else if(closed)info.textContent=say('Sessie beëindigd. De eindstand is nog zeven dagen te bekijken.','Session closed. The final results can be viewed for seven days.');
      else info.textContent=fields?say('Online opgeslagen. De laptop kan dicht. De sessie vervalt zeven dagen na de laatste wijziging.',
        'Saved online. The laptop can close. The session expires seven days after the last change.'):
        say('Bij online delen worden het schema, de spelersnamen en de uitslagen zeven dagen na de laatste wijziging bewaard.',
        'Sharing online stores the schedule, player names and results until seven days after the last change.');
    }
    async function getEntryLink(){
      const player=meta.mode==='personal'?$('entryPlayer').value:'';
      if(meta.closed || meta.mode==='view' || meta.links.some(l=>l.role===meta.mode && l.player===player))return;
      const {code}=await request('/api/manage',{action:'link',revision:meta.revision,player});
      meta.links.push({role:meta.mode,code,player});
    }
    function schedule(delay=300){
      clearTimeout(timer);
      if(secret && app.hosted)timer=setTimeout(sync,delay);
    }
    async function sync(){
      if(!secret || !app.hosted)return;
      if(busy){queued=true;return;}
      if(app.editing()){schedule(1200);return;}
      busy=true;const generation=sequence;
      try{
        const doc=meta && !meta.closed && app.snapshot();
        const signature=doc && JSON.stringify(doc);
        if(doc && signature!==base){
          record(doc,meta.revision);
          const next=await request('/api/manage',{action:'save',revision:meta.revision,document:doc});
          if(generation!==sequence)return;
          setMeta(next);base=signature;clearPending();
        }else{
          const remote=await request('/api/manage',null,true);
          if(generation!==sequence)return;
          if(remote){
            const saved=!meta && pending();
            const now=meta && app.snapshot();
            if(app.editing() || (now && JSON.stringify(now)!==base)){queued=true;return;}
            const initial=!meta;restore(remote);
            if(initial){try{const prior=JSON.parse(localStorage.getItem(conflictKey()));
              if(prior?.expires>Date.now())conflict(prior.local);else localStorage.removeItem(conflictKey());}catch{}}
            if(saved){
              if(saved.expires>Date.now() && saved.revision===remote.revision && !remote.closed){
                applying=true;try{app.restore(saved.document.state);}finally{applying=false;}
                queued=true;
              }else if(saved.expires>Date.now())conflict(saved.document);
              clearPending();
            }
          }
        }
        if(download.hidden)announce(meta?.closed?say('Sessie beëindigd. Dit is de eindstand.','Session closed. These are the final results.'):'');
      }catch(error){
        if(generation!==sequence)return;
        if(error.status===409){
          const saved=app.snapshot();
          try{const remote=await request('/api/manage');if(generation!==sequence)return;
            restore(remote);conflict(saved);clearPending();
          }catch(failure){unavailable(failure);}
        }else unavailable(error);
      }finally{
        busy=false;
        if(generation===sequence)draw();
        if(generation===sequence && !missing && !meta?.closed)schedule(queued?100:3500);
        queued=false;
      }
    }
    async function action(fn){
      while(busy){clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,70));}
      clearTimeout(timer);busy=true;draw();
      try{await fn();draw();}
      catch(error){
        if(error.status===409){announce(say('Het schema is zojuist gewijzigd. Controleer de nieuwe stand en probeer opnieuw.','The schedule just changed. Check the latest results and try again.'));queued=true;}
        else unavailable(error);
      }finally{busy=false;draw();if(secret && !meta?.closed)schedule(queued?10:800);queued=false;}
    }
    async function publish(){
      const doc=app.snapshot();if(!doc || !app.hosted)return;
      const poll=app.poll?.();let admin,token;
      if(poll){
        try{
          token=TossPoll.token(poll.id);
          admin=await TossPoll.api('/'+poll.id+'/admin',undefined,{token});
          if(admin.phase==='open')throw Error('reopened');
          if(admin.phase==='published' && admin.plannerKey!==secret && !meta?.links.some(l=>l.role==='view' && l.code===admin.viewCode))throw Error('other-plan');
          if(TossPoll.rosterSignature(admin)!==poll.signature && !confirm(say('De aanmeldlijst is gewijzigd. Dit concept toch publiceren?','Signups changed. Publish this draft anyway?')))return;
        }catch(error){
          announce(error.status===401?say('Log opnieuw in via het pollbeheer om te publiceren.','Sign in to the poll again to publish.'):
            say('Open het pollbeheer om de actuele indeling te controleren.','Open the poll organizer page to check the latest schedule.'));
          const back=document.createElement('a');back.href='/beheer/'+poll.id;back.className='btn btn-ghost';back.textContent=say('Pollbeheer','Poll settings');message.append(' ',back);return;
        }
      }
      if(!secret){
        const signature=JSON.stringify(doc),result=await request('/api/sessions',doc);
        secret=result.secret;setMeta(result);base=signature;history.replaceState(null,'','/b/'+secret);
        app.save();announce('');
      }
      if(poll){
        try{
          if(centralSession && admin.phase!=='published')throw Error('reopened');
          if(!centralSession){
            const result=await TossPoll.api('/'+poll.id+'/admin',{action:'publish',revision:admin.revision,sessionKey:secret},{token});
            if(result.plannerId){
              centralSession=result.plannerId;secret=centralSession;
              history.replaceState(null,'','/beheer/sessie/'+centralSession);
            }
          }
          publishedPoll=poll.id;announce(say('Het speelschema staat op de groepslink.','The schedule is now on the group link.'));
        }catch(error){
          announce(say('Het schema is opgeslagen. Publiceer opnieuw om de groepslink bij te werken.','The schedule is saved. Publish again to update the group link.'));
        }
      }
    }
    $('sharePublish').onclick=()=>action(publish);
    $('entryMode').onchange=async()=>{
      const mode=$('entryMode').value;modePending=mode;draw();
      await action(async()=>{
        if(!meta || meta.closed || mode===meta.mode)return;
        const next=await request('/api/manage',{action:'mode',revision:meta.revision,mode});
        setMeta(next);draw();await getEntryLink();
      });
      modePending=null;draw();
    };
    $('entryPlayer').onchange=()=>action(getEntryLink);
    $('shareEnd').onclick=()=>{
      if(!meta || meta.closed || !confirm(say('Sessie beëindigen voor alle spelers? De eindstand blijft zeven dagen zichtbaar.','End the session for all players? Results stay visible for seven days.')))return;
      action(async()=>{
        const doc=app.snapshot();
        if(doc && JSON.stringify(doc)!==base){
          setMeta(await request('/api/manage',{action:'save',revision:meta.revision,document:doc}));base=JSON.stringify(doc);
        }
        setMeta(await request('/api/manage',{action:'close',revision:meta.revision}));finalState=structuredClone(doc.state);clearPending();
        announce(say('Sessie beëindigd. Dit is de eindstand.','Session closed. These are the final results.'));
      });
    };
    $('shareClose').onclick=()=>dialog.close();
    for(const [button,field] of [['shareCopy','shareUrl'],['entryCopy','entryUrl'],['ownerCopy','ownerUrl']]){
      $(button).onclick=async()=>{try{await navigator.clipboard.writeText($(field).value);info.textContent=say('Link gekopieerd.','Link copied.');}
        catch{$(field).focus();$(field).select();}};
    }
    for(const id of ['presentBtn','kocPresent']){
      const button=document.createElement('button');button.type='button';button.className='btn btn-ghost';
      button.dataset.i18n='shareAction';button.textContent=say('Schema delen','Share schedule');
      $(id).after(button);
      const publishButton=document.createElement('button');publishButton.type='button';publishButton.className='btn btn-primary';publishButton.hidden=true;
      pollButtons.push(publishButton);button.after(publishButton);publishButton.onclick=()=>action(publish);
      button.onclick=()=>{dialog.showModal();draw();if(meta && meta.mode!=='view' && !meta.closed)action(getEntryLink);};
    }
    document.addEventListener('click',()=>{if(app.poll?.())requestAnimationFrame(drawPollButtons);});
    window.queueShareUpdate=()=>{
      drawPollButtons();
      if(applying || !secret || !meta)return;
      const doc=app.snapshot();
      if(meta.closed){
        if(finalState && doc && JSON.stringify(doc)!==base){applying=true;try{app.restore(structuredClone(finalState));}finally{applying=false;}}
        return;
      }if(doc && JSON.stringify(doc)!==base){record(doc,meta.revision);schedule(300);}
    };
    window.detachTossSession=()=>{
      clearTimeout(timer);sequence++;centralSession=null;secret=null;meta=null;base='';download.hidden=true;announce('');
      if(location.pathname.startsWith('/b/') || location.pathname.startsWith('/beheer/sessie/'))history.replaceState(null,'','/');
    };
    window.addEventListener('online',()=>schedule(0));
    document.addEventListener('visibilitychange',()=>{if(secret && (document.hidden || !meta?.closed))schedule(0);});
    if(secret && app.hosted){announce(say('Gedeelde planner openen…','Opening shared planner…'));sync();}
    else if(location.pathname.startsWith('/b/'))announce(say('Deze beheerlink is onvolledig.','This organizer link is incomplete.'));
  }
  window.PadelSessions={setup};
})();
