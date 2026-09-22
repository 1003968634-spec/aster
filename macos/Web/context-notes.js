/* Conversation settings are paper notes. Folder selection stays on this Mac. */
(() => {
  'use strict';
  const paper = document.getElementById('desktop-paper');
  const box = document.getElementById('gift-box');
  const main = document.getElementById('main');
  if (!paper || !box || !main) return;
  const key = 'aster-desktop-context-v1';
  const modes = [{id:'approval',name:'Request approval'},{id:'full',name:'Full access'}];
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
  let saved={};
  try { saved=JSON.parse(localStorage.getItem(key)||'{}')||{}; } catch {}
  const seen = new Set();
  const state = {
    workspaces:(Array.isArray(saved.workspaces)?saved.workspaces:[]).filter(item => {
      if (!item || typeof item.path!=='string' || !item.path.startsWith('/') || item.path.length>4096 || seen.has(item.path)) return false;
      seen.add(item.path);return true;
    }).map(item => ({path:item.path,name:String(item.name||item.path.split('/').filter(Boolean).pop()||item.path).slice(0,255)})),
    mode:modes.some(mode=>mode.id===saved.mode)?saved.mode:'approval'
  };
  let selector=null, returnFocus=null, choosing=null, tearing=false;
  const reduced=()=>document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rail=document.createElement('aside');
  rail.className='context-notes';
  rail.setAttribute('aria-label','Conversation setup');
  box.insertBefore(rail,main);
  const dialog=document.createElement('dialog');
  dialog.id='context-note-dialog';
  dialog.className='context-note-dialog';
  dialog.setAttribute('aria-labelledby','context-note-title');
  document.body.append(dialog);

  function persist() {
    try {localStorage.setItem(key,JSON.stringify(state));}
    catch {
      // A toast survives the dialog being closed or rebuilt by the selection.
      if (typeof window.toast==='function') window.toast('Your choices could not be saved on this Mac.');
      else announce('Your choices could not be saved on this Mac.');
    }
    window.dispatchEvent(new CustomEvent('aster-context-changed',{detail:snapshot()}));
  }
  function snapshot() {return {workspaces:state.workspaces.map(item=>({...item})),mode:state.mode};}
  function layers(count) {
    return `<span class="note-layers" aria-hidden="true" style="--sheet-count:${Math.max(1,count)}">${Array.from({length:Math.max(1,count)},(_,index)=>`<i class="note-layer" style="--sheet-index:${index};z-index:${Math.max(1,count)-index}"></i>`).join('')}</span>`;
  }
  function renderRail() {
    const count=state.workspaces.length;
    const top=count?state.workspaces[0].name:'Select folders';
    const mode=modes.find(item=>item.id===state.mode);
    rail.innerHTML=`<button type="button" class="note-new" id="new-chat"><span class="note-text">New conversation</span>${icon('plus')}</button>
      <div class="note-stack workspace-stack"><button type="button" class="note-trigger" id="workspace-stack-trigger" aria-haspopup="dialog" aria-expanded="${selector==='workspaces'}" aria-controls="context-note-dialog" title="${count?escape(state.workspaces.map(item=>item.path).join('\n')):'Choose local folders'}">${layers(count)}<span class="note-text"><small class="note-kicker">Workspaces</small><strong class="note-value">${escape(top)}</strong>${count?`<small class="note-count">${count} selected</small>`:''}</span><svg class="icon note-chevron" aria-hidden="true"><use href="#chevron"/></svg></button></div>
      <div class="note-stack access-stack mode-stack"><button type="button" class="note-trigger" id="access-stack-trigger" aria-haspopup="dialog" aria-expanded="${selector==='access'}" aria-controls="context-note-dialog">${layers(modes.length)}<span class="note-text"><small class="note-kicker">Access mode</small><strong class="note-value">${mode.name}</strong></span><svg class="icon note-chevron" aria-hidden="true"><use href="#chevron"/></svg></button></div>`;
    document.getElementById('workspace-stack-trigger').addEventListener('click',()=>openSelector('workspaces'));
    document.getElementById('access-stack-trigger').addEventListener('click',()=>openSelector('access'));
  }
  function fanAngle(index,count) {return count===1?0:-8+index/(count-1)*16;}
  function renderDialog() {
    const isWorkspaces=selector==='workspaces';
    let cards='';
    let count=0;
    if (isWorkspaces) {
      count=state.workspaces.length;
      cards=state.workspaces.map((item,index)=>`<article class="fan-note workspace-note ${index===0?'is-active':''}" data-workspace="${index}" style="--fan-index:${index};--fan-angle:${fanAngle(index,count)}deg">
        <button type="button" class="workspace-activate" data-primary="${index}" title="${escape(item.path)}" aria-label="Move ${escape(item.name)} to the top"><strong class="workspace-name">${escape(item.name)}</strong><span class="workspace-path">${escape(item.path)}</span></button>
        <button type="button" class="workspace-remove" data-remove="${index}" aria-label="Remove ${escape(item.name)} from selected workspaces" title="Remove workspace">${icon('close')}</button></article>`).join('');
      if (!count) cards='<div class="note-empty">Choose a folder for your thoughts.</div>';
    } else {
      const ordered=[modes.find(item=>item.id===state.mode),...modes.filter(item=>item.id!==state.mode)];
      count=ordered.length;
      cards=ordered.map((item,index)=>`<button type="button" class="fan-note mode-option ${index===0?'selected':''}" data-mode="${item.id}" aria-pressed="${state.mode===item.id}" style="--fan-index:${index};--fan-angle:${fanAngle(index,count)}deg"><span class="mode-title">${item.name}</span>${state.mode===item.id?'<svg class="icon mode-check" aria-hidden="true"><use href="#check"/></svg>':''}</button>`).join('');
    }
    dialog.innerHTML=`<div class="note-focus-heading"><h2 id="context-note-title">${isWorkspaces?'Your workspaces':'Access mode'}</h2><button type="button" class="note-focus-close" aria-label="Close ${isWorkspaces?'workspace':'access mode'} selector">${icon('close')}</button></div>
      <div class="note-fan-scroll"><div class="note-fan ${isWorkspaces?'workspace-fan':'access-fan'}" style="--fan-count:${count}">${cards}</div></div>
      <div class="note-focus-footer">${isWorkspaces?`<button type="button" class="workspace-add" ${choosing?'disabled':''}>${icon('plus')}<span>${choosing?'Choosing folders…':'Add workspaces'}</span></button>`:''}<p id="context-note-status" role="status" aria-live="polite"></p></div>`;
    dialog.querySelector('.note-focus-close').addEventListener('click',()=>dialog.close());
    dialog.querySelector('.workspace-add')?.addEventListener('click',pickWorkspaces);
    dialog.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>removeWorkspace(Number(button.dataset.remove))));
    dialog.querySelectorAll('[data-primary]').forEach(button=>button.addEventListener('click',()=>{
      if (tearing) return;
      const index=Number(button.dataset.primary);
      const [item]=state.workspaces.splice(index,1);
      if (item) state.workspaces.unshift(item);
      persist();dialog.close();renderRail();
    }));
    dialog.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      state.mode=button.dataset.mode;
      persist();dialog.close();renderRail();
    }));
  }
  function openSelector(kind) {
    if (choosing || tearing) return;
    returnFocus=kind==='workspaces'?'workspace-stack-trigger':'access-stack-trigger';
    selector=kind;
    renderRail();renderDialog();
    if (!dialog.open) dialog.showModal();
    (dialog.querySelector('.workspace-activate,.mode-option,.workspace-add')||dialog.querySelector('.note-focus-close'))?.focus({preventScroll:true});
  }
  function announce(text) {
    const status=document.getElementById('context-note-status');
    if (status) status.textContent=text;
  }
  function pickWorkspaces() {
    if (choosing || tearing) return;
    const bridge=window.webkit?.messageHandlers?.asterNative;
    if (!bridge) {announce('Open Aster for macOS to choose folders.');return;}
    choosing=crypto.randomUUID();
    renderDialog();
    bridge.postMessage({action:'chooseWorkspaces',requestId:choosing});
  }
  window.addEventListener('aster-workspaces-picked',event=>{
    if (!choosing || event.detail?.requestId!==choosing) return;
    choosing=null;
    let added=0;
    for (const item of Array.isArray(event.detail.items)?event.detail.items:[]) {
      if (!item || typeof item.path!=='string' || !item.path.startsWith('/') || state.workspaces.some(existing=>existing.path===item.path)) continue;
      state.workspaces.push({path:item.path,name:String(item.name||item.path.split('/').filter(Boolean).pop()||item.path).slice(0,255)});added++;
    }
    if (added) persist();
    renderRail();
    if (dialog.open && selector==='workspaces') {
      renderDialog();
      announce(event.detail.cancelled?'':added?`${added} ${added===1?'workspace':'workspaces'} added.`:'Those workspaces are already selected.');
      dialog.querySelector('.workspace-add')?.focus({preventScroll:true});
    }
  });
  async function removeWorkspace(index) {
    if (tearing || choosing) return;
    const item=state.workspaces[index];
    const note=dialog.querySelector(`[data-workspace="${index}"]`);
    if (!item || !note) return;
    tearing=true;
    note.classList.add('tearing');
    dialog.querySelectorAll('.workspace-remove,.workspace-activate,.workspace-add').forEach(button=>button.disabled=true);
    if (!reduced()) await new Promise(resolve=>{
      const timer=setTimeout(resolve,650);
      note.addEventListener('animationend',event=>{if(event.target===note){clearTimeout(timer);resolve();}},{once:true});
    });
    // Only the selection is removed; this never deletes a folder or its contents.
    state.workspaces=state.workspaces.filter(existing=>existing.path!==item.path);
    tearing=false;persist();renderRail();
    if (dialog.open && selector==='workspaces') {
      renderDialog();announce(`${item.name} removed.`);
      const remaining=dialog.querySelectorAll('.workspace-remove');
      (remaining[Math.min(index,remaining.length-1)]||dialog.querySelector('.workspace-add'))?.focus({preventScroll:true});
    }
  }
  dialog.addEventListener('click',event=>{
    if (event.target!==dialog) return;
    const rect=dialog.getBoundingClientRect();
    if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close();
  });
  dialog.addEventListener('close',()=>{
    selector=null;renderRail();
    if (document.documentElement.dataset.envelope==='open') document.getElementById(returnFocus)?.focus({preventScroll:true});
  });
  function syncPage() {
    const isHome=!!main.querySelector('.home-page');
    document.documentElement.dataset.contextPage=isHome?'home':'other';
    rail.hidden=!isHome;
    if (!isHome && dialog.open) dialog.close();
  }
  new MutationObserver(syncPage).observe(main,{childList:true});
  new MutationObserver(()=>{
    if (document.documentElement.dataset.envelope!=='open' && dialog.open) dialog.close();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-envelope']});
  renderRail();syncPage();
  window.asterContext=Object.freeze({snapshot});
})();
