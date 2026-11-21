// Show a clipped name in full for keyboard and mouse users without moving a match row.
(() => {
  const hint = document.createElement('span');
  hint.hidden = true;
  Object.assign(hint.style, {
    position:'fixed', zIndex:'10000', pointerEvents:'none', maxWidth:'calc(100vw - 1rem)',
    padding:'.3rem .6rem', borderRadius:'.35rem', background:'#213b55', color:'#fff',
    font:'600 1rem/1.35 system-ui,sans-serif', overflowWrap:'anywhere'
  });
  hint.setAttribute('aria-hidden','true');
  document.body.append(hint);
  function show(event){
    const target = event.target.closest?.('.player-label,.person');
    if (!target || target.scrollWidth <= target.clientWidth) {hint.hidden = true;return;}
    hint.textContent = target.textContent;
    hint.hidden = false;
    const rect = target.getBoundingClientRect();
    hint.style.left = Math.max(4,Math.min(rect.left,innerWidth-hint.offsetWidth-4))+'px';
    hint.style.top = (rect.bottom+hint.offsetHeight+4 <= innerHeight ? rect.bottom+2 : Math.max(2,rect.top-hint.offsetHeight-2))+'px';
  }
  for(const event of ['focusin','pointerover']) document.addEventListener(event,show);
  for(const event of ['focusout','pointerout','click','scroll']) document.addEventListener(event,()=>{hint.hidden=true;},true);
})();
