/* Session-scoped DSH reminders, kept on the letter. No background polling. */
(() => {
  'use strict';
  let request = 0, loading = false, failure = '', pending = null, editorBusy = false;
  const snapshot = () => backendState.scheduleData?.sessionId === currentChat ? backendState.scheduleData : null;
  const records = () => backendEnabled ? snapshot()?.items || [] : data.rituals;
  const capabilities = () => backendEnabled ? snapshot()?.capabilities || {} : { create:true, update:true, delete:true, pause:true };
  const connected = () => !backendEnabled || backendState.status === 'connected';
  const titleOf = item => item.title || String(item.prompt || 'A little reminder').split('\n')[0];
  const escape = escapeHTML;
  function previewOf(item) {
    if (!backendEnabled) return item.prompt || '';
    const continuation = String(item.prompt || '').split('\n').slice(1).join(' ').trim();
    if (continuation) return continuation;
    const date = new Date(item.scheduledAt);
    return item.kind === 'every' && !Number.isNaN(date.valueOf())
      ? `Next · ${date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`
      : 'One little intention, at the right time.';
  }
  function timing(item) {
    if (!backendEnabled) return `${item.time} · ${item.frequency}`;
    if (item.kind === 'every') {
      const seconds = item.everySeconds;
      const [amount, unit] = seconds % 86400 === 0 ? [seconds / 86400, 'days'] : seconds % 3600 === 0 ? [seconds / 3600, 'hours'] : seconds % 60 === 0 ? [seconds / 60, 'minutes'] : [seconds, 'seconds'];
      return `Every ${amount} ${unit}`;
    }
    const date = new Date(item.scheduledAt);
    return Number.isNaN(date.valueOf()) ? 'Time to be set' : date.toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function paintBoard() {
    const board = $('#ritual-board');
    if (!board) return;
    const items = records(), caps = capabilities();
    const canCreate = connected() && Boolean(caps.create);
    const message = failure || (!connected() ? 'Connect to DSH to keep your reminders in sync.' : loading && !snapshot() ? 'Gathering your reminders…' : backendEnabled && snapshot() && !snapshot().available ? 'Scheduling is unavailable in this DSH host.' : backendEnabled ? currentChat ? 'For this conversation' : 'A new reminder begins its own conversation' : 'Local preview · no background delivery');
    const cards = items.map(item => `<button type="button" class="ritual-note ${item.enabled === false ? 'is-paused' : ''}" data-ritual-note="${escape(item.id)}" aria-label="Edit reminder: ${escape(titleOf(item))}"><span class="note-tape" aria-hidden="true"></span><span class="ritual-note-time">${escape(timing(item))}</span><strong class="ritual-note-title">${escape(titleOf(item))}</strong><span class="ritual-note-preview">${escape(previewOf(item))}</span><span class="ritual-note-caption">${item.enabled === false ? 'Paused' : 'A note for later'} <span aria-hidden="true">↗</span></span></button>`).join('');
    board.innerHTML = `<div class="ritual-board-heading"><h2>Rituals</h2><span class="ritual-board-count">${items.length ? `${items.length} ${items.length === 1 ? 'note' : 'notes'}` : 'for your future self'}</span><button type="button" data-new-ritual ${canCreate ? '' : 'disabled'} aria-label="New scheduled task">${icon('plus')}</button></div><div class="ritual-note-strip" aria-label="Reminder notes">${cards || `<button type="button" class="ritual-note ritual-note-empty" data-new-ritual ${canCreate ? '' : 'disabled'}><span class="note-tape" aria-hidden="true"></span><span class="ritual-note-time">A NOTE FOR LATER</span><strong class="ritual-note-title">A little intention.</strong><span class="ritual-note-preview">Pin something you’d like to come back to.</span><span class="ritual-note-caption">${canCreate ? '+ Pin a reminder' : loading ? 'Gathering reminders…' : 'Waiting for DSH'}</span></button>`}</div><p class="ritual-board-message" role="status" title="${escape(message)}">${escape(failure ? 'Could not sync reminders.' : message)}${failure ? ' <button type="button" data-retry-rituals>Try again</button>' : ''}</p>`;
  }
  async function refresh(invalidate = false) {
    if (!backendEnabled || !connected() || !['home','dashboard'].includes(page)) return;
    const sessionId = currentChat;
    if (pending?.sessionId === sessionId) { if (invalidate) pending.dirty = true; return pending.promise; }
    const token = ++request;
    loading = true; failure = ''; paintBoard();
    const promise = (async () => {
      try {
        const value = await backend.getSchedules(sessionId);
        if (token !== request || currentChat !== sessionId) return;
        backendState.scheduleData = { ...value, sessionId, available:Boolean(value?.available), items:Array.isArray(value?.items) ? value.items : [], capabilities:value?.capabilities || {} };
      } catch (error) {
        if (token === request && currentChat === sessionId) failure = `Could not load reminders: ${error?.message || error}`;
      } finally {
        if (token === request) {
          const dirty = pending?.dirty;
          loading = false; pending = null; paintBoard();
          if (page === 'dashboard') dashboard(false);
          if (dirty && currentChat === sessionId) await refresh();
        }
      }
    })();
    pending = { sessionId, promise, dirty:false };
    return promise;
  }
  function render(reload = false) {
    paintBoard();
    if (page === 'dashboard') dashboard(false);
    if (reload) return refresh();
  }
  function dashboard(reload = true) {
    if (page !== 'dashboard') return;
    const sessions = backendEnabled ? backendState.sessions.length : data.conversations.length;
    const models = backendEnabled ? backendState.models.length : null;
    const reminders = backendEnabled && (!currentChat || !snapshot()?.available) ? '—' : records().length;
    $('#main').innerHTML = `<section class="page dashboard-page">${pageHeader('CHAPTER III · DASHBOARD', 'Your universe, <em>at a glance.</em>', 'A quiet place to see how things are taking shape.')}<div class="dashboard-grid"><article class="dashboard-card"><span class="dashboard-label">CONVERSATIONS</span><strong class="dashboard-value">${sessions}</strong><p>${backendEnabled ? 'Active conversations reported by DSH' : 'Conversations saved on this device'}</p></article><article class="dashboard-card"><span class="dashboard-label">${backendEnabled ? 'AVAILABLE MODELS' : 'COMPANIONS'}</span><strong class="dashboard-value">${models ?? data.plugins.length}</strong><p>${backendEnabled ? 'Models in your current DSH catalog' : 'Enabled in this local preview'}</p></article><article class="dashboard-card"><span class="dashboard-label">REMINDERS</span><strong class="dashboard-value">${reminders}</strong><p>${backendEnabled ? currentChat ? 'In the current conversation' : 'No conversation selected' : 'Notes on your home letter'}</p><button type="button" class="text-button" data-page="home">Visit your notes ↗</button></article></div><div class="dashboard-placeholder"><span class="small-aster" aria-hidden="true">✧</span><h2>Room for a bigger picture.</h2><p>Future charts and activity insights will live here.<br>Your scheduled tasks are pinned to your home letter.</p></div><p class="form-hint" role="status">${escape(failure || (backendEnabled ? connected() ? 'Current DSH snapshot · reminders belong to the selected conversation' : 'DSH disconnected · showing the last available snapshot' : 'Local preview'))}</p></section>`;
    if (reload) refresh();
  }
  function localDateTime(value) {
    const date = new Date(value || Date.now() + 3600000);
    if (Number.isNaN(date.valueOf())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  }
  function beginEditor(html) {
    if (backendState.interactions.length || editorBusy) return false;
    openDialog(html);
    $('#detail-dialog').dataset.editor = 'ritual';
    $('#dialog-content textarea')?.focus({ preventScroll:true });
    return true;
  }
  function openNote(id) {
    if (!backendEnabled) { openDemo(id); return; }
    const item = id ? records().find(item => String(item.id) === String(id)) : null;
    if (id && !item) { toast('This reminder is no longer available.'); render(true); return; }
    const caps = capabilities();
    const writable = connected() && Boolean(id ? caps.update : caps.create);
    const kind = item?.kind || 'at';
    const duration = item?.everySeconds || item?.afterSeconds || 3600;
    const unit = duration % 86400 === 0 ? 86400 : duration % 3600 === 0 ? 3600 : duration % 60 === 0 ? 60 : 1;
    const sessionId = currentChat;
    const html = `<form id="ritual-editor" class="form-dialog ritual-editor"><button type="button" class="dialog-close icon-button" data-close aria-label="Close reminder editor">${icon('close')}</button><div class="eyebrow">A NOTE FOR YOUR FUTURE SELF</div><h2>${item ? 'A little change of plans.' : 'Leave yourself a note.'}</h2><label>What should Aster do?<textarea name="prompt" required maxlength="5000" rows="4" ${writable ? '' : 'readonly'} placeholder="Gather my priorities and help me plan the day…">${escape(item?.prompt || '')}</textarea></label><label>When?<select name="kind" ${writable ? '' : 'disabled'}><option value="at" ${kind === 'at' ? 'selected' : ''}>Once · at a specific time</option><option value="after" ${kind === 'after' ? 'selected' : ''}>Once · after a delay</option><option value="every" ${kind === 'every' ? 'selected' : ''}>Repeat · at an interval</option></select></label><label data-timing-at ${kind === 'at' ? '' : 'hidden'}>Date & time<input type="datetime-local" name="scheduledAt" value="${escape(localDateTime(item?.scheduledAt))}" ${writable ? '' : 'disabled'}/></label><div class="form-two-col" data-timing-interval ${kind === 'at' ? 'hidden' : ''}><label>Amount<input name="amount" type="number" min="1" step="1" value="${duration / unit}" ${writable ? '' : 'disabled'}/></label><label>Unit<select name="unit" ${writable ? '' : 'disabled'}>${[[1,'Seconds'],[60,'Minutes'],[3600,'Hours'],[86400,'Days']].map(([value,label]) => `<option value="${value}" ${unit === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><p class="form-hint">${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)} · ${sessionId ? 'Current conversation' : 'Creates a new conversation when saved'}<br>Delivered while DSH and this conversation are running. Repeat intervals start at 5 minutes.${item ? ' Editing starts the new timing from this save.' : ''}</p><p class="ritual-editor-error" role="alert" hidden></p><div class="ritual-editor-actions">${item && caps.delete ? '<button type="button" class="text-button" data-delete-reminder>Delete note</button>' : ''}<button type="button" class="outline-button" data-close>Cancel</button><button type="submit" class="solid-button" ${writable ? '' : 'disabled'}>${item ? 'Save changes' : 'Pin this reminder'} ${icon('star')}</button></div>${!writable ? '<p class="form-hint">This DSH host cannot edit this reminder right now.</p>' : ''}</form>`;
    if (!beginEditor(html)) return;
    const form = $('#ritual-editor');
    form.elements.kind.addEventListener('change', () => {
      const once = form.elements.kind.value === 'at';
      $('[data-timing-at]',form).hidden = !once;
      $('[data-timing-interval]',form).hidden = once;
    });
    form.addEventListener('submit', event => { event.preventDefault(); saveNote(form, sessionId, item); });
    $('[data-delete-reminder]',form)?.addEventListener('click', () => {
      const button = $('[data-delete-reminder]',form);
      if (button.dataset.confirm !== 'yes') { button.dataset.confirm = 'yes'; button.textContent = 'Delete this reminder? Click again'; return; }
      deleteNote(form, sessionId, item);
    });
  }
  function inputOf(form) {
    const input = { kind:form.elements.kind.value, prompt:form.elements.prompt.value.trim() };
    if (!input.prompt) throw new Error('Write what you would like Aster to do.');
    if (input.kind === 'at') {
      const date = new Date(form.elements.scheduledAt.value);
      if (Number.isNaN(date.valueOf()) || date.valueOf() <= Date.now()) throw new Error('Choose a date and time in the future.');
      input.scheduledAt = date.toISOString();
    } else {
      const amount = Number(form.elements.amount.value), unit = Number(form.elements.unit.value);
      if (!Number.isSafeInteger(amount) || amount < 1 || ![1,60,3600,86400].includes(unit) || !Number.isSafeInteger(amount * unit)) throw new Error('Enter a positive whole-number interval.');
      if (input.kind === 'every' && amount * unit < 300) throw new Error('Repeating reminders must be at least five minutes apart.');
      input[input.kind === 'every' ? 'everySeconds' : 'afterSeconds'] = amount * unit;
    }
    return input;
  }
  function setBusy(form, value) {
    editorBusy = value;
    for (const control of form.querySelectorAll('button,input,textarea,select')) {
      if (value) { control.dataset.wasDisabled = String(control.disabled); control.disabled = true; }
      else { control.disabled = control.dataset.wasDisabled === 'true'; delete control.dataset.wasDisabled; }
    }
    form.setAttribute('aria-busy', String(value));
  }
  function showError(form, error) {
    const node = $('.ritual-editor-error',form);
    node.textContent = String(error?.message || error); node.hidden = false;
  }
  async function saveNote(form, sessionId, item) {
    if (editorBusy || form.dataset.partialSave === 'true') return;
    sessionId = form.dataset.createdSession || sessionId;
    let input;
    try { input = inputOf(form); } catch (error) { showError(form,error); return; }
    if (!connected()) { showError(form,'Connect to DSH before saving.'); return; }
    setBusy(form,true);
    try {
      if (!sessionId) {
        const result = await backend.createSession({ workspaceId:backendState.selectedWorkspaceId || undefined });
        const createdId = result?.id || result?.sessionId || (typeof result === 'string' ? result : null);
        if (!createdId) throw new Error('DSH did not return a conversation ID.');
        sessionId = String(createdId);
        currentChat = sessionId;
        backendState.sessions.unshift({ id:sessionId, title:'A reminder conversation', updatedAt:new Date().toISOString() });
        // Keep the editor bound to the newly created session if saving needs a retry.
        form.dataset.createdSession = sessionId;
        renderBackendSessionActions();
      }
      const targetId = item?.id;
      if (targetId) await backend.updateSchedule(sessionId, targetId, input);
      else await backend.createSchedule(form.dataset.createdSession || sessionId, input);
      setBusy(form,false); closeDialog();
      await refresh(true); toast(item ? 'Your reminder has been updated.' : 'A note for later, safely pinned.');
    } catch (error) {
      setBusy(form,false);
      if (error?.newScheduleId) {
        form.dataset.partialSave = 'true';
        form.querySelector('[type=submit]').disabled = true;
        const remove = $('[data-delete-reminder]',form); if (remove) remove.hidden = true;
      }
      showError(form,error); await refresh(true);
    }
  }
  async function deleteNote(form, sessionId, item) {
    if (editorBusy || !item) return;
    setBusy(form,true);
    try { await backend.deleteSchedule(sessionId,item.id); setBusy(form,false); closeDialog(); await refresh(true); toast('The reminder has been removed.'); }
    catch (error) { setBusy(form,false); showError(form,error); await refresh(true); }
  }
  function openDemo(id) {
    const item = data.rituals.find(item => item.id === id) || { title:'', prompt:'', time:'09:00', frequency:'Every day', enabled:true };
    if (!beginEditor(`<form id="demo-note-editor" class="form-dialog ritual-editor"><button type="button" class="dialog-close icon-button" data-close aria-label="Close reminder editor">${icon('close')}</button><div class="eyebrow">A NOTE FOR YOUR FUTURE SELF</div><h2>${id ? 'A little change of plans.' : 'Leave yourself a note.'}</h2><label>Name<input name="title" maxlength="60" required value="${escape(item.title)}"/></label><label>What should Aster do?<textarea name="prompt" rows="4" maxlength="5000" required>${escape(item.prompt)}</textarea></label><div class="form-two-col"><label>Time<input name="time" type="time" required value="${escape(item.time)}"/></label><label>Repeat<select name="frequency">${['Every day','Weekdays','Every Monday','Every Friday'].map(value => `<option ${item.frequency === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><p class="form-hint">Local preview · no background tasks will run.</p><div class="ritual-editor-actions">${id ? `<button type="button" class="text-button" data-demo-delete>Delete note</button><button type="button" class="outline-button" data-demo-pause>${item.enabled ? 'Pause' : 'Resume'}</button>` : ''}<button type="submit" class="solid-button">${id ? 'Save changes' : 'Pin this reminder'}</button></div></form>`)) return;
    const form = $('#demo-note-editor');
    form.addEventListener('submit', event => {
      event.preventDefault(); const values = new FormData(form);
      const next = { id:id || `ritual-${Date.now()}`, title:String(values.get('title')).trim(), prompt:String(values.get('prompt')).trim(), time:values.get('time'), frequency:values.get('frequency'), enabled:item.enabled };
      if (!next.title || !next.prompt) return;
      if (id) data.rituals = data.rituals.map(record => record.id === id ? next : record); else data.rituals.push(next);
      save(); closeDialog(); render();
    });
    $('[data-demo-pause]',form)?.addEventListener('click', () => { item.enabled = !item.enabled; save(); closeDialog(); render(); });
    $('[data-demo-delete]',form)?.addEventListener('click', () => { data.rituals = data.rituals.filter(record => record.id !== id); save(); closeDialog(); render(); });
  }
  document.addEventListener('click', event => {
    const target = event.target;
    if (target.closest('[data-new-ritual]')) { openNote(); return; }
    const note = target.closest('[data-ritual-note]');
    if (note) { openNote(note.dataset.ritualNote); return; }
    if (target.closest('[data-retry-rituals]')) render(true);
  });
  window.asterRituals = { render, dashboard, invalidate:() => refresh(true), busy:() => editorBusy, sessionChanged() { if (snapshot()?.sessionId !== currentChat) render(true); } };
  render(true);
})();
