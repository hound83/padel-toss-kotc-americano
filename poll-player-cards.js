/* One pointer gesture for mouse, pen and touch. Form inputs retain their normal editing behavior. */
window.TossCardDrag=function(list,{identify,locate,move,busy=()=>{}}){
  let drag=null,frame=0,ghost=null,target=null,blockClick=false;
  function highlight(next){
    target?.group.classList.remove('over');
    target?.targets?.forEach(row=>row.classList.remove('over'));
    target?.row?.classList.remove('drop-before','drop-after');
    target=next;
    target?.group.classList.add('over');
    target?.targets?.forEach(row=>row.classList.add('over'));
    if(ghost){
      ghost.querySelector('strong').textContent=(next?.names || drag.entry.names || [drag.entry.name]).join(' & ');
      const caption=ghost.querySelector('small');
      caption.textContent=next?.label || '';caption.hidden=!caption.textContent;
    }
    if(target?.row)target.row.classList.add(target.after?'drop-after':'drop-before');
  }
  function track(){
    if(!drag?.moving)return;
    const edge=56,{x,y,entry,card}=drag;
    const delta=y<edge?-Math.ceil((edge-y)/3):y>innerHeight-edge?Math.ceil((y-innerHeight+edge)/3):0;
    const before=scrollY;
    if(delta)window.scrollBy(0,Math.max(-16,Math.min(16,delta)));
    highlight(locate(document.elementFromPoint(x,y),y,entry,card));
    frame=scrollY!==before?requestAnimationFrame(track):0;
  }
  function finish(save){
    if(!drag)return;
    const {entry,card,events,id,moving}=drag;
    const drop=save && moving && target;
    events.abort();cancelAnimationFrame(frame);frame=0;ghost?.remove();ghost=null;
    (entry.rows || [card]).forEach(row=>row.classList.remove('dragging'));highlight(null);drag=null;
    if(list.hasPointerCapture(id))list.releasePointerCapture(id);
    if(moving){blockClick=true;setTimeout(()=>{blockClick=false;},0);}
    busy(null);
    if(drop)move(entry,drop);
  }
  list.onclickCaptureCleanup?.();
  const preventClick=e=>{if(blockClick){e.preventDefault();e.stopImmediatePropagation();}};
  list.addEventListener('click',preventClick,true);
  list.onclickCaptureCleanup=()=>{finish(false);list.removeEventListener('click',preventClick,true);};
  list.ondragstart=e=>{if(e.target.closest('.player-card'))e.preventDefault();};
  list.onpointerdown=e=>{
    if(drag || !e.isPrimary || e.button!==0)return;
    const grip=e.target.closest('.player-grip'),card=e.target.closest('.player-card');
    if(!card || !list.contains(card) || (!grip && (e.pointerType!=='mouse' || e.target.closest('input,select,textarea,button,a,label'))))return;
    const entry=identify(card);
    if(!entry)return;
    const events=new AbortController(),options={signal:events.signal};
    drag={entry,card,events,id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moving:false};
    busy(entry.id);
    document.addEventListener('pointermove',event=>{
      if(!drag || event.pointerId!==drag.id)return;
      drag.x=event.clientX;drag.y=event.clientY;
      if(!drag.moving){
        if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<5)return;
        drag.moving=true;(entry.rows || [card]).forEach(row=>row.classList.add('dragging'));list.setPointerCapture(drag.id);
        ghost=document.createElement('span');ghost.className='player-drag-preview';ghost.setAttribute('aria-hidden','true');
        const names=document.createElement('strong'),caption=document.createElement('small');
        names.textContent=(entry.names || [entry.name]).join(' & ');caption.hidden=true;
        ghost.append(names,caption);document.body.append(ghost);
      }
      event.preventDefault();
      ghost.style.left=Math.max(4,Math.min(innerWidth-ghost.offsetWidth-4,drag.x+12))+'px';
      ghost.style.top=Math.max(4,drag.y-ghost.offsetHeight-10)+'px';
      if(!frame)track();
    },{...options,passive:false});
    document.addEventListener('pointerup',event=>{
      if(event.pointerId!==drag?.id)return;
      if(drag.moving)highlight(locate(document.elementFromPoint(event.clientX,event.clientY),event.clientY,entry,card));
      finish(true);
    },options);
    document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.id)finish(false);},options);
    list.addEventListener('lostpointercapture',event=>{if(event.target===list && event.pointerId===drag?.id)finish(false);},options);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')finish(false);},options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);},options);
    window.addEventListener('blur',()=>finish(false),options);
  };
};
window.TossPlayerCards=function(list,players,{busy,move}){
  window.TossCardDrag(list,{
    identify:card=>players.find(p=>p.id===card.dataset.id),busy,
    locate(element,y,entry,card){
      const group=element?.closest('[data-place]');
      if(!group || !list.contains(group))return null;
      const place=group.dataset.place,queue=players.filter(p=>p.id!==entry.id && p.place===place);
      let row=element.closest('.player-card');
      if(row===card)return null;
      if(place==='reserve' && ['in','wait'].includes(entry.place) && Number(entry.rating)>8)row=null;
      const after=row?y>row.getBoundingClientRect().top+row.offsetHeight/2:false;
      const position=row?queue.findIndex(p=>p.id===row.dataset.id)+1+Number(after):queue.length+1;
      const title=group.querySelector('h3')?.firstChild?.textContent?.trim() || '';
      const prefix=document.documentElement.lang==='en'?'Place ':'Plek ';
      return {group,row,place,position,after,label:title+' · '+prefix+position};
    },
    move:(entry,drop)=>move(entry,drop.place,drop.position)
  });
};
