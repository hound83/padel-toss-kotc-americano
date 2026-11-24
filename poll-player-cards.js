/* Mouse and touch share the same drop position and the same revision-checked move. */
window.TossPlayerCards=function(list,players,{busy,move}){
  let card,entry,target,touch,ghost,frame=0,events;
  function highlight(next){
    target?.group.classList.remove('over');
    target?.row?.classList.remove('drop-before','drop-after');
    target=next;
    target?.group.classList.add('over');
    if(target?.row)target.row.classList.add(target.after?'drop-after':'drop-before');
  }
  function locate(element,y){
    const group=element?.closest('[data-place]');
    if(!group || !list.contains(group))return null;
    const place=group.dataset.place;
    const queue=players.filter(p=>p.id!==entry.id && p.place===place);
    let row=element.closest('.player-card');
    if(row===card)return null;
    // Moving an above-limit Yes to standby starts a new position at the end.
    if(place==='reserve' && ['in','wait'].includes(entry.place) && Number(entry.rating)>8)row=null;
    let position=queue.length+1,after=false;
    if(row){
      const bounds=row.getBoundingClientRect();
      after=y>bounds.top+bounds.height/2;
      position=queue.findIndex(p=>p.id===row.dataset.id)+1+Number(after);
    }
    return {group,row,place,position,after};
  }
  function begin(row){
    card=row;entry=players.find(player=>player.id===card.dataset.id);
    busy(entry.id);card.classList.add('dragging');
    events=new AbortController();
    const options={signal:events.signal};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')finish(false);},options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);},options);
    window.addEventListener('blur',()=>finish(false),options);
  }
  function finish(save){
    if(!card)return;
    const drop=target,player=entry;
    events.abort();cancelAnimationFrame(frame);ghost?.remove();
    card.classList.remove('dragging');highlight(null);
    const contact=touch;
    card=entry=touch=ghost=null;frame=0;busy(null);
    if(contact && list.hasPointerCapture(contact.id))list.releasePointerCapture(contact.id);
    if(save && drop)move(player,drop.place,drop.position);
  }
  list.ondragstart=e=>{
    const row=e.target.closest('.player-card');
    if(!row || touch){e.preventDefault();return;}
    begin(row);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',entry.id);
  };
  list.ondragover=e=>{if(card && !touch){e.preventDefault();highlight(locate(e.target,e.clientY));}};
  list.ondragleave=e=>{if(!list.contains(e.relatedTarget))highlight(null);};
  list.ondrop=e=>{if(card && !touch){e.preventDefault();highlight(locate(e.target,e.clientY));finish(true);}};
  list.ondragend=()=>finish(false);

  function followFinger(){
    if(!touch?.moving)return;
    const edge=60,y=touch.y;
    const scroll=y<edge?-Math.min(16,Math.ceil((edge-y)/3)):y>innerHeight-edge?Math.min(16,Math.ceil((y-innerHeight+edge)/3)):0;
    if(scroll)window.scrollBy(0,scroll);
    highlight(locate(document.elementFromPoint(touch.x,y),y));
    if(scroll)frame=requestAnimationFrame(followFinger);else frame=0;
  }
  list.onpointerdown=e=>{
    if(card || e.pointerType==='mouse' || !e.isPrimary || !e.target.closest('.player-grip'))return;
    e.preventDefault();begin(e.target.closest('.player-card'));
    touch={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moving:false};
    list.setPointerCapture(e.pointerId);
  };
  list.onpointermove=e=>{
    if(!touch || e.pointerId!==touch.id)return;
    touch.x=e.clientX;touch.y=e.clientY;
    if(!touch.moving){
      if(Math.hypot(touch.x-touch.startX,touch.y-touch.startY)<6)return;
      touch.moving=true;
      ghost=document.createElement('span');ghost.className='player-drag-preview';ghost.setAttribute('aria-hidden','true');
      ghost.textContent=entry.name;document.body.append(ghost);
    }
    ghost.style.left=Math.max(4,Math.min(innerWidth-ghost.offsetWidth-4,touch.x+12))+'px';
    ghost.style.top=Math.max(4,touch.y-ghost.offsetHeight-10)+'px';
    if(!frame)followFinger();
  };
  list.onpointerup=e=>{
    if(!touch || e.pointerId!==touch.id)return;
    if(touch.moving)highlight(locate(document.elementFromPoint(e.clientX,e.clientY),e.clientY));
    finish(touch.moving);
  };
  list.onpointercancel=list.onlostpointercapture=e=>{if(touch?.id===e.pointerId)finish(false);};
};
