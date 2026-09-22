/* Compact, in-place paper selectors. These are local prototype preferences. */
(() => {
  'use strict';
  const main=document.getElementById('main');
  if (!main || !document.getElementById('desktop-paper')) return;
  const key='aster-desktop-context-v1';
  const modes=[{id:'approval',name:'Request approval'},{id:'full',name:'Full access'}];
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=(name,extra='')=>`<svg class="icon ${extra}" aria-hidden="true"><use href="#${name}"/></svg>`;
  const validPath=item=>item && typeof item.path==='string' && item.path.startsWith('/') && item.path.length<=4096;
  const workspace=item=>({path:item.path,name:String(item.name||item.path.split('/').filter(Boolean).pop()||item.path).slice(0,255)});
  let saved={};
  try {saved=JSON.parse(localStorage.getItem(key)||'{}')||{};} catch {}
  const seen=new Set();
  const state={
    workspaces:(Array.isArray(saved.workspaces)?saved.workspaces:[]).filter(item=>{
      if (!validPath(item) || seen.has(item.path)) return false;
      seen.add(item.path);return true;
    }).map(workspace),
    mode:modes.some(mode=>mode.id===saved.mode)?saved.mode:'approval'
  };
  let selector=null,choosing=null,tearing=false;
  const reduced=()=>document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rail=document.createElement('div');
  rail.className='context-notes';
  rail.setAttribute('role','group');
  rail.setAttribute('aria-label','Conversation setup');
  const status=document.createElement('span');
  status.id='context-note-status';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  rail.append(status);

  function snapshot() {return {workspaces:state.workspaces.map(item=>({...item})),mode:state.mode};}
  function announce(text) {status.textContent=text;}
  function persist() {
    try {localStorage.setItem(key,JSON.stringify(state));}
    catch {
      if (typeof window.toast==='function') window.toast('Your choices could not be saved on this Mac.');
      else announce('Your choices could not be saved on this Mac.');
    }
    window.dispatchEvent(new CustomEvent('aster-context-changed',{detail:snapshot()}));
  }
  function fanStyle(index,count) {
    const angle=count===1?0:-4+index/(count-1)*8;
    return `--fan-index:${index};--fan-angle:${angle}deg;--fan-z:${count-index}`;
  }
  function stack(kind,label,cards,count) {
    const prefix=kind==='workspaces'?'workspace':'access';
    return `<div class="note-stack ${prefix}-stack" data-selector="${kind}" style="--fan-count:${count}">
      <button type="button" class="note-trigger" id="${prefix}-stack-trigger" aria-expanded="false" aria-controls="${prefix}-note-fan"><span class="note-text">${label}</span>${icon('chevron','note-chevron')}</button>
      <div class="note-fan" id="${prefix}-note-fan" role="group" aria-label="${label}" aria-hidden="true" inert><div class="note-fan-list" style="--fan-count:${count}">${cards}</div></div>
    </div>`;
  }
  function render() {
    const count=state.workspaces.length+1;
    const workspaces=state.workspaces.map((item,index)=>`<article class="fan-note workspace-note ${index===0?'is-active':''}" data-workspace="${index}" style="${fanStyle(index,count)}">
      <button type="button" class="workspace-activate" data-primary="${index}" title="${escape(item.path)}" aria-label="Move ${escape(item.name)} to top"><span class="workspace-name">${escape(item.name)}</span></button>
      <button type="button" class="workspace-remove" data-remove="${index}" aria-label="Remove ${escape(item.name)} from selected workspaces">${icon('close')}</button></article>`).join('')+
      `<button type="button" class="workspace-add fan-note" style="${fanStyle(count-1,count)}" ${choosing?'disabled':''}>${icon('plus')}<span>${choosing?'Choosing…':'Add workspace'}</span></button>`;
    const ordered=[modes.find(item=>item.id===state.mode),...modes.filter(item=>item.id!==state.mode)];
    const access=ordered.map((item,index)=>`<button type="button" class="fan-note mode-option ${index===0?'selected':''}" data-mode="${item.id}" aria-pressed="${state.mode===item.id}" style="${fanStyle(index,ordered.length)}"><span class="mode-title">${item.name}</span>${index===0?icon('check','mode-check'):''}</button>`).join('');
    rail.querySelectorAll('.note-stack').forEach(item=>item.remove());
    status.insertAdjacentHTML('beforebegin',stack('workspaces','Workspaces',workspaces,count)+stack('access','Access mode',access,ordered.length));
    rail.querySelectorAll('.note-trigger').forEach(button=>{
      const kind=button.parentElement.dataset.selector;
      button.addEventListener('click',()=>openSelector(kind));
      button.addEventListener('keydown',event=>{
        if (event.key==='ArrowUp' || event.key==='ArrowDown') {
          event.preventDefault();openSelector(kind,true);
        }
      });
    });
    rail.querySelector('.workspace-add').addEventListener('click',pickWorkspaces);
    rail.querySelectorAll('.note-fan').forEach(fan=>fan.addEventListener('transitionend',event=>{
      if (event.target===fan && event.propertyName==='height' && fan.parentElement.classList.contains('is-open')) fan.scrollTop=fan.scrollHeight;
    }));
    rail.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>removeWorkspace(Number(button.dataset.remove))));
    rail.querySelectorAll('[data-primary]').forEach(button=>button.addEventListener('click',()=>{
      if (tearing || choosing) return;
      const [item]=state.workspaces.splice(Number(button.dataset.primary),1);
      if (item) state.workspaces.unshift(item);
      persist();selector=null;render();focusTrigger('workspaces');
    }));
    rail.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      state.mode=button.dataset.mode;
      persist();selector=null;render();focusTrigger('access');
    }));
    syncPanels();
  }
  function focusTrigger(kind) {
    if (rail.isConnected && document.documentElement.dataset.envelope==='open') rail.querySelector(`#${kind==='workspaces'?'workspace':'access'}-stack-trigger`)?.focus({preventScroll:true});
  }
  function fitFans() {
    const top=Math.max(16,main.getBoundingClientRect().top+12);
    rail.querySelectorAll('.note-stack').forEach(item=>{
      item.style.setProperty('--fan-room',`${Math.max(90,item.getBoundingClientRect().top-top-12)}px`);
    });
  }
  function syncPanels() {
    fitFans();
    rail.querySelectorAll('.note-stack').forEach(item=>{
      const open=item.dataset.selector===selector;
      item.classList.toggle('is-open',open);
      item.querySelector('.note-trigger').setAttribute('aria-expanded',String(open));
      const fan=item.querySelector('.note-fan');
      fan.inert=!open;
      fan.setAttribute('aria-hidden',String(!open));
      if (open) fan.scrollTop=fan.scrollHeight;
    });
  }
  function openSelector(kind,keyboard=false) {
    if (choosing || tearing) return;
    selector=keyboard?kind:selector===kind?null:kind;
    syncPanels();
    if (keyboard) rail.querySelector('.is-open .workspace-activate,.is-open .mode-option,.is-open .workspace-add')?.focus({preventScroll:true});
  }
  function collapse(restoreFocus=false) {
    const previous=selector;
    selector=null;syncPanels();
    if (restoreFocus && previous) focusTrigger(previous);
  }
  function pickWorkspaces() {
    if (choosing || tearing) return;
    const bridge=window.webkit?.messageHandlers?.asterNative;
    if (!bridge) {
      announce('Open Aster for macOS to choose folders.');
      window.toast?.('Open Aster for macOS to choose folders.');return;
    }
    choosing=crypto.randomUUID();render();
    bridge.postMessage({action:'chooseWorkspaces',requestId:choosing});
  }
  window.addEventListener('aster-workspaces-picked',event=>{
    if (!choosing || event.detail?.requestId!==choosing) return;
    choosing=null;
    let added=0;
    for (const item of Array.isArray(event.detail.items)?event.detail.items:[]) {
      if (!validPath(item) || state.workspaces.some(existing=>existing.path===item.path)) continue;
      state.workspaces.push(workspace(item));added++;
    }
    if (added) persist();
    render();
    if (selector==='workspaces') {
      announce(event.detail.cancelled?'':added?`${added} ${added===1?'workspace':'workspaces'} added.`:'Those workspaces are already selected.');
      rail.querySelector('.workspace-add')?.focus({preventScroll:true});
    }
  });
  async function removeWorkspace(index) {
    if (tearing || choosing) return;
    const item=state.workspaces[index];
    const note=rail.querySelector(`[data-workspace="${index}"]`);
    if (!item || !note) return;
    tearing=true;note.classList.add('tearing');
    rail.querySelectorAll('.workspace-remove,.workspace-activate,.workspace-add').forEach(button=>button.disabled=true);
    if (!reduced()) await new Promise(resolve=>{
      const timer=setTimeout(resolve,650);
      note.addEventListener('animationend',event=>{if(event.target===note){clearTimeout(timer);resolve();}},{once:true});
    });
    // Remove only the selected path from this prototype; never touch the folder.
    state.workspaces=state.workspaces.filter(existing=>existing.path!==item.path);
    tearing=false;persist();render();
    if (selector==='workspaces') {
      announce(`${item.name} removed.`);
      const remaining=rail.querySelectorAll('.workspace-remove');
      (remaining[Math.min(index,remaining.length-1)]||rail.querySelector('.workspace-add'))?.focus({preventScroll:true});
    }
  }
  document.addEventListener('pointerdown',event=>{
    if (selector && !rail.contains(event.target) && !choosing) collapse();
  });
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && selector && !choosing) {event.preventDefault();collapse(true);}
  });
  rail.addEventListener('focusout',event=>{
    // WebKit leaves focus on body when a paper button is clicked. Wait for an
    // actual keyboard focus destination; outside pointer presses close above.
    if (!event.relatedTarget || rail.contains(event.relatedTarget)) return;
    queueMicrotask(()=>{if (selector && !choosing && !tearing && !rail.contains(document.activeElement)) collapse();});
  });
  function syncPage() {
    const home=main.querySelector('.home-page');
    document.documentElement.dataset.contextPage=home?'home':'other';
    if (!home) {collapse();rail.remove();return;}
    const attach=home.querySelector('#attach-button');
    if (attach && rail.parentElement!==attach.parentElement) {
      collapse();attach.insertAdjacentElement('afterend',rail);fitFans();
    }
  }
  new MutationObserver(syncPage).observe(main,{childList:true});
  new MutationObserver(()=>{
    if (document.documentElement.dataset.envelope!=='open') collapse();
    else fitFans();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-envelope']});
  window.addEventListener('resize',fitFans);
  render();syncPage();
  window.asterContext=Object.freeze({snapshot});
})();
