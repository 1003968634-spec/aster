/* Aster's small browser adapter for the DSH Host. No DSH client bundle is loaded. */
(() => {
  'use strict';

  const enabled = Boolean(globalThis.__DSH_BOOT__ && /^https?:$/.test(location.protocol));
  const listeners = new Set();
  const state = {
    status: 'connecting', sessions: [], currentSessionId: null, messages: [],
    models: [], selectedModel: null, workspaces: [], selectedWorkspaceId: null,
    permissionPresets: [], selectedPermissionPresetId: null,
    archivedSessionIds: [], pinnedSessionIds: [], imageLimits: null,
  };
  const streams = new Map();
  const interactions = new Map();
  // Package output can be unbounded. Keep only small counters for installs
  // started by this window, and pass at most 32 KiB of log text to the UI.
  const pluginInstalls = new Map();
  const pluginLogLimit = 32 * 1024;
  const archivedTitleCache = new Map();
  let socket = null;
  let opening = null;
  let reconnectTimer = 0;
  let reconnectDelay = 1000;
  let sessionStreamId = null;
  let eventClientId = null;
  let connectionReady = null;
  let workspaceReady = null;
  let workspaceReadyResolve = null;
  let activeAttempt = null;
  let futureModel = null;
  let futurePermission = null;
  let closed = false;

  try {
    state.currentSessionId = localStorage.getItem('aster-dsh-session') || null;
    state.selectedWorkspaceId = localStorage.getItem('aster-dsh-workspace') || null;
  } catch { /* Private browsing can disable storage. */ }

  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const activeSessions = () => state.sessions.filter(item => !state.archivedSessionIds.includes(item.id));
  const copy = () => ({ ...state, sessions: activeSessions(), messages: [...state.messages],
    models: [...state.models], workspaces: [...state.workspaces],
    permissionPresets: [...state.permissionPresets],
    archivedSessionIds: [...state.archivedSessionIds],
    pinnedSessionIds: [...state.pinnedSessionIds] });
  const emit = event => { for (const listener of [...listeners]) {
    try { listener(event); } catch (error) { console.error('Aster listener failed', error); }
  } };
  const errorOf = value => Object.assign(new Error(value?.message || String(value || 'DSH request failed')),
    typeof value?.code === 'string' ? { code: value.code } : {});
  const report = error => emit({ type: 'error', message: errorOf(error).message });

  async function rpc(endpoint, args = {}) {
    const rpcId = id();
    const response = await fetch(`api/${endpoint}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId,
        method: endpoint, payload: { args } }),
    });
    if (!response.ok) throw new Error(`DSH ${endpoint}: HTTP ${response.status}`);
    const packet = await response.json();
    if (packet?.type !== 'server-response' || packet.rpcId !== rpcId)
      throw new Error(`DSH ${endpoint}: invalid response`);
    if (!packet.result?.ok) throw errorOf(packet.result?.error);
    return packet.result.value;
  }

  // $events/result is a Gateway endpoint rather than a decorated Remote method.
  async function eventResult(eventId, outcome) {
    if (!eventClientId) throw new Error('DSH event channel disconnected');
    const rpcId = id();
    const endpoint = '$events/result';
    const response = await fetch(`api/${endpoint}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint,
        payload: { args: { clientId: eventClientId, eventId, outcome } } }),
    });
    if (!response.ok) throw new Error(`DSH event answer: HTTP ${response.status}`);
    const packet = await response.json();
    if (packet?.rpcId !== rpcId || !packet.result?.ok)
      throw errorOf(packet?.result?.error || 'DSH rejected the answer');
  }

  function setStatus(status) {
    if (state.status === status) return;
    state.status = status;
    emit({ type: 'connection', status });
  }

  function sendFrame(frame) {
    if (!socket || socket.readyState !== WebSocket.OPEN)
      throw new Error('DSH stream disconnected');
    socket.send(JSON.stringify(frame));
  }

  function openStream(endpoint, args, onItem) {
    const streamId = id();
    streams.set(streamId, { endpoint, onItem });
    sendFrame({ type: 'open', streamId, endpoint, payload: { args } });
    return streamId;
  }

  function cancelStream(streamId) {
    if (!streamId) return;
    streams.delete(streamId);
    if (socket?.readyState === WebSocket.OPEN)
      sendFrame({ type: 'cancel', streamId });
  }

  function onSocketPacket(raw) {
    let frame;
    try { frame = JSON.parse(raw.data); } catch { return; }
    const stream = streams.get(frame.streamId);
    if (!stream) return;
    if (frame.type === 'item') {
      try { stream.onItem(frame.value); } catch (error) { report(error); }
    } else if (frame.type === 'error') {
      streams.delete(frame.streamId);
      report(frame.error || `DSH ${stream.endpoint} stream failed`);
    } else if (frame.type === 'end') streams.delete(frame.streamId);
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = 0;
      initialize().catch(report);
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  }

  async function connect() {
    if (!enabled) throw new Error('DSH Host is not serving this page');
    if (socket?.readyState === WebSocket.OPEN) return;
    if (opening) return opening;
    setStatus('connecting');
    opening = new Promise((resolve, reject) => {
      const url = new URL('/api/remote.mux', location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      let readyTimeout = 0;
      socket = ws;
      ws.addEventListener('open', () => {
        reconnectDelay = 1000;
        ws.addEventListener('message', onSocketPacket);
        readyTimeout = setTimeout(() => {
          connectionReady = null;
          reject(new Error('DSH event channel did not become ready'));
          ws.close();
        }, 10000);
        connectionReady = () => {
          clearTimeout(readyTimeout);
          connectionReady = null;
          setStatus('connected');
          resolve();
        };
        openStream('$events', {}, onEventFrame);
        workspaceReady = new Promise(done => { workspaceReadyResolve = done; });
        openStream('workspace/follow', {}, onWorkspaceFrame);
        if (state.currentSessionId) followSession(state.currentSessionId);
      }, { once: true });
      ws.addEventListener('error', () => {
        if (ws.readyState !== WebSocket.OPEN) reject(new Error('Cannot connect to DSH stream'));
      }, { once: true });
      ws.addEventListener('close', () => {
        if (socket !== ws) return;
        clearTimeout(readyTimeout);
        if (connectionReady) {
          connectionReady = null;
          reject(new Error('DSH stream closed before it became ready'));
        } else if (state.status === 'connecting')
          reject(new Error('DSH stream closed during connection'));
        socket = null;
        streams.clear();
        sessionStreamId = null;
        eventClientId = null;
        for (const requestId of interactions.keys())
          emit({ type: 'interaction-cancelled', requestId });
        interactions.clear();
        workspaceReadyResolve?.();
        workspaceReadyResolve = null;
        setStatus('disconnected');
        scheduleReconnect();
      });
    });
    try { await opening; } finally { opening = null; }
  }

  function onEventFrame(frame) {
    if (!frame || typeof frame !== 'object') return;
    if (frame.type === 'ready') {
      eventClientId = frame.clientId;
      connectionReady?.();
      return;
    }
    if (frame.type === 'emit') {
      if (frame.event === 'plugin-manager/changed') emit({ type: 'plugins-changed' });
      if (frame.event === 'settings/document-updated') emit({ type: 'settings-changed' });
      if (frame.event === 'plugin-manager/install-state') {
        const progress = frame.args?.[0];
        if (pluginInstalls.has(progress?.requestId))
          emit({ type: 'plugin-install-state', requestId: progress.requestId,
            phase: progress.phase, attempt: progress.attempt || null });
      }
      if (frame.event === 'plugin-manager/install-log') {
        const chunk = frame.args?.[0];
        const tracked = pluginInstalls.get(chunk?.requestId);
        if (tracked) {
          const remaining = pluginLogLimit - tracked.loggedChars;
          const raw = typeof chunk.text === 'string' ? chunk.text : '';
          const shown = raw.slice(0, Math.max(0, remaining));
          tracked.loggedChars += shown.length;
          const truncated = raw.length > shown.length;
          if (shown || (truncated && !tracked.truncated))
            emit({ type: 'plugin-install-log', requestId: chunk.requestId,
              stream: chunk.stream, text: shown, exitCode: chunk.exitCode,
              truncated });
          if (truncated) tracked.truncated = true;
        }
      }
      return;
    }
    if (frame.type === 'cancel') {
      interactions.delete(frame.eventId);
      emit({ type: 'interaction-cancelled', requestId: frame.eventId });
      return;
    }
    if (frame.type !== 'waterfall') return;
    if (frame.event === 'approval/request' || frame.event === 'user-questions/request') {
      interactions.set(frame.eventId, frame);
      emit({ type: frame.event === 'approval/request' ? 'approval' : 'questions',
        requestId: frame.eventId, sessionId: frame.agentId, request: frame.request });
    } else {
      // An unhandled waterfall must advance so another Client listener can answer it.
      eventResult(frame.eventId, { kind: 'next' }).catch(report);
    }
  }

  function onWorkspaceFrame(frame) {
    if (frame?.type === 'baseline') {
      state.workspaces = Array.isArray(frame.value?.items) ? frame.value.items.map(workspaceView) : [];
      state.archivedSessionIds = frame.value?.archivedSessionIds || [];
      state.pinnedSessionIds = frame.value?.pinnedSessionIds || [];
      if (!state.workspaces.some(item => item.id === state.selectedWorkspaceId))
        state.selectedWorkspaceId = state.workspaces[0]?.id || null;
      workspaceReadyResolve?.();
      workspaceReadyResolve = null;
    } else if (frame?.type === 'upsert') {
      const item = workspaceView(frame.workspace);
      state.workspaces = [...state.workspaces.filter(current => current.id !== item.id), item];
    } else if (frame?.type === 'remove') {
      state.workspaces = state.workspaces.filter(item => item.id !== frame.workspaceId);
      if (state.selectedWorkspaceId === frame.workspaceId)
        state.selectedWorkspaceId = state.workspaces[0]?.id || null;
    } else if (frame?.type === 'archived') {
      state.archivedSessionIds = frame.archivedSessionIds || [];
    } else if (frame?.type === 'pinned') {
      state.pinnedSessionIds = frame.pinnedSessionIds || [];
    }
    annotateSessions();
    emitContext();
  }

  function annotateSessions() {
    const archived = new Set(state.archivedSessionIds);
    const pinned = new Set(state.pinnedSessionIds);
    for (const session of state.sessions) {
      session.archived = archived.has(session.id);
      session.pinned = pinned.has(session.id);
    }
  }

  function workspaceView(value) {
    return { ...value, id: value.workspaceId, name: value.title || value.path?.split('/').pop() || value.workspaceId };
  }

  function modelId(selection) {
    if (!selection) return '';
    if (typeof selection === 'string') return selection;
    return `${selection.provider}/${selection.model}`;
  }

  function emitContext() {
    emit({ type: 'context', workspaces: [...state.workspaces],
      selectedWorkspaceId: state.selectedWorkspaceId,
      permissionPresets: [...state.permissionPresets],
      selectedPermissionPresetId: state.selectedPermissionPresetId,
      selectedModel: state.selectedModel, models: [...state.models] });
  }

  function textContent(blocks) {
    if (!Array.isArray(blocks)) return '';
    return blocks.filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => block.text).join('\n');
  }

  function messageOf(event) {
    if (event.type === 'user/message' && event.data?.source?.kind === 'user') {
      return { id: `user:${event.seq}`, role: 'user', text: textContent(event.data.content) };
    }
    if (event.type === 'assistant/message') {
      const data = event.data || {};
      return { id: `assistant:${data.turn}:${data.step}`, role: 'assistant',
        text: textContent(data.message?.content) };
    }
    return null;
  }

  function projectionUpdate(values) {
    if (!values || typeof values !== 'object') return;
    const selection = values.modelSelection?.next || values.modelSelection?.lastUsed;
    if (selection) state.selectedModel = modelId(selection);
    const permission = values.permissions?.currentValue;
    if (permission) state.selectedPermissionPresetId = permission;
    if (values.imageLimits) state.imageLimits = values.imageLimits;
    emitContext();
  }

  function updateSessionStatus(status) {
    emit({ type: 'session', sessionId: state.currentSessionId, status });
  }

  function onSessionFrame(frame) {
    const sessionId = state.currentSessionId;
    if (frame?.type === 'snapshot') {
      activeAttempt = null;
      const messages = frame.records.map(row => messageOf(row.event || {})).filter(Boolean);
      state.messages = messages.slice(-60);
      projectionUpdate(frame.projections?.values);
      emit({ type: 'session', sessionId, messages: [...state.messages],
        status: frame.assistantStream?.activeAttempt ? 'running' : 'idle' });
      return;
    }
    if (frame?.type === 'assistant-stream') { onAssistantFrame(sessionId, frame.frame); return; }
    if (frame?.type !== 'event') return;
    const event = frame.event || {};
    if (event.type === 'turn/start') updateSessionStatus('running');
    if (event.type === 'turn/end') {
      updateSessionStatus('idle');
      const reason = event.data?.reason;
      if (reason?.kind === 'error')
        report(reason.error?.message || 'DSH could not complete this reply');
    }
    if (event.type === 'schedule/change') emit({ type: 'schedules-changed', sessionId });
    if (event.type === 'model/selection' && event.data)
      projectionUpdate({ modelSelection: { next: event.data } });
    if (event.type === 'session/title' && typeof event.data?.title === 'string') {
      const summary = state.sessions.find(item => item.id === sessionId);
      if (summary) summary.title = event.data.title;
    }
    if (event.type === 'permission/preset' && event.data?.preset)
      projectionUpdate({ permissions: { currentValue: event.data.preset } });
    const message = messageOf(event);
    if (message) {
      const existing = state.messages.findIndex(item => item.id === message.id);
      if (existing >= 0) state.messages[existing] = message;
      else state.messages.push(message);
      if (state.messages.length > 60) state.messages.shift();
      emit({ type: message.role === 'assistant' ? 'message-complete' : 'message',
        sessionId, message });
      if (message.role === 'user') {
        const summary = state.sessions.find(item => item.id === sessionId);
        if (summary && (summary.title === 'A new conversation' || !summary.title)) {
          summary.title = message.text.slice(0, 68) || 'A new conversation';
          summary.preview = message.text.slice(0, 170);
        }
      }
    }
    if (event.type === 'tool/call') {
      emit({ type: 'tool', sessionId, id: event.data?.callId || `tool:${event.seq}`,
        name: event.data?.name || 'Tool', status: 'running',
        detail: String(event.data?.arguments || '').slice(0, 180) });
    } else if (event.type === 'tool/result') {
      emit({ type: 'tool', sessionId, id: event.data?.message?.toolCallId || `tool:${event.seq}`,
        name: 'Tool', status: event.data?.message?.isError ? 'failed' : 'completed',
        detail: event.data?.error?.reason || '' });
    }
  }

  function onAssistantFrame(sessionId, frame) {
    if (!frame) return;
    if (frame.type === 'start') {
      activeAttempt = { id: `assistant:${frame.turn}:${frame.step}`, attemptId: frame.attemptId, text: '' };
      updateSessionStatus('running');
      return;
    }
    if (!activeAttempt || frame.attemptId !== activeAttempt.attemptId) return;
    if (frame.type === 'chunk' && frame.chunk?.type === 'text-delta') {
      activeAttempt.text += frame.chunk.text || '';
      emit({ type: 'message-delta', sessionId, id: activeAttempt.id,
        role: 'assistant', text: activeAttempt.text, streaming: true });
    } else if (frame.type === 'end') {
      // Durable assistant/message carries the same turn:step identity and replaces the stream.
      if (frame.outcome?.kind === 'abandoned')
        emit({ type: 'message-complete', sessionId, id: activeAttempt.id,
          role: 'assistant', text: activeAttempt.text });
      activeAttempt = null;
    }
  }

  function followSession(sessionId) {
    cancelStream(sessionStreamId);
    sessionStreamId = openStream('session/follow', { request: {
      address: { kind: 'session', sessionId },
      assistantStream: true, maxMessages: 60,
    } }, onSessionFrame);
  }

  function sessionView(value) {
    const title = value.projections?.values?.title;
    return { ...value, id: value.sessionId,
      title: typeof title === 'string' ? title : title?.title || 'A new conversation',
      preview: value.blank ? '' : value.cwd || '',
      updatedAt: value.updatedAt };
  }

  async function listSessions() {
    const value = await rpc('session/list', { _request: {} });
    state.sessions = (value.items || []).map(sessionView);
    annotateSessions();
    return activeSessions();
  }

  async function searchSessions(query) {
    const value = String(query || '').trim();
    if (!value) return listSessions();
    const result = await rpc('session/search', { request: { query: value } });
    const summaries = new Map(state.sessions.map(item => [item.id, item]));
    return (result.items || []).filter(item =>
      !state.archivedSessionIds.includes(item.sessionId)).map(item => ({
      ...summaries.get(item.sessionId), id: item.sessionId,
      title: summaries.get(item.sessionId)?.title || 'A conversation',
      preview: item.snippet || '',
      updatedAt: summaries.get(item.sessionId)?.updatedAt || 0,
    }));
  }

  async function listArchivedSessions(limit = 60) {
    await connect();
    const ids = state.archivedSessionIds.slice(0, Math.max(1, Math.min(Number(limit) || 60, 300)));
    const result = new Array(ids.length);
    let next = 0;
    async function worker() {
      while (next < ids.length) {
        const index = next++;
        const sessionId = ids[index];
        const summary = state.sessions.find(item => item.id === sessionId);
        let title = summary?.title;
        if (!title && archivedTitleCache.has(sessionId))
          title = archivedTitleCache.get(sessionId);
        if (!title && !archivedTitleCache.has(sessionId)) {
          try {
            const projection = await rpc('session/projections', { request: { sessionId } });
            const value = projection?.values?.title;
            title = typeof value === 'string' ? value : value?.title;
          } catch { /* A stale archived ID can outlive its underlying log. */ }
          archivedTitleCache.set(sessionId, title || null);
          while (archivedTitleCache.size > 300)
            archivedTitleCache.delete(archivedTitleCache.keys().next().value);
        }
        result[index] = { id: sessionId, sessionId,
          title: title || `Archived · ${sessionId.slice(0, 8)}`,
          updatedAt: summary?.updatedAt || null, archived: true, pinned: false };
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    return result;
  }

  async function getSchedules(sessionId) {
    const readCapabilities = async () => {
      try { return await rpc('schedules/capabilities'); } catch (error) {
        if (!['gateway/invocation-unavailable', 'gateway/definition-unavailable',
          'gateway/service-unavailable', 'gateway/method-unavailable'].includes(error.code)) throw error;
        return { create: false, update: false, delete: false, pause: false };
      }
    };
    const [capabilities, projection] = await Promise.all([
      readCapabilities(), sessionId ? rpc('session/projections', { request: { sessionId } }) : null,
    ]);
    const value = projection?.values?.schedule;
    return { available: capabilities.create || Array.isArray(value),
      items: Array.isArray(value) ? value : [], capabilities, deliveryMode: 'session-local' };
  }

  function scheduleInput(input) {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) throw new Error('Enter the reminder instructions');
    if (input.kind === 'at') {
      const scheduledAt = String(input.scheduledAt || '');
      if (!Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= Date.now())
        throw new Error('Choose a reminder time in the future');
      return { kind: 'at', prompt, scheduledAt };
    }
    if (input.kind === 'every') {
      const everySeconds = Number(input.everySeconds);
      if (!Number.isSafeInteger(everySeconds) || everySeconds < 300)
        throw new Error('Repeating reminders must be at least five minutes apart');
      return { kind: 'every', prompt, everySeconds };
    }
    if (input.kind === 'after') {
      const afterSeconds = Number(input.afterSeconds);
      if (!Number.isSafeInteger(afterSeconds) || afterSeconds <= 0)
        throw new Error('Enter a positive whole-number delay in seconds');
      return { kind: 'after', prompt, afterSeconds };
    }
    throw new Error('Choose a supported reminder rule');
  }

  async function mutateSchedule(method, sessionId, args) {
    if (!sessionId) throw new Error('Choose a conversation for this reminder');
    const result = await rpc(`schedules/${method}`, { agentId: sessionId, ...args });
    emit({ type: 'schedules-changed', sessionId });
    if (!result?.ok) {
      const error = errorOf(result || 'DSH reminder change failed');
      if (result?.replacement) {
        error.replacement = result.replacement;
        error.newScheduleId = result.replacement.id;
        error.originalId = result.originalId;
        error.message += ` Replacement: ${result.replacement.id}. Check the refreshed list before saving again.`;
      }
      throw error;
    }
    return result.item || { deletedId: result.deletedId };
  }

  function createSchedule(sessionId, input) {
    return mutateSchedule('create', sessionId, { input: scheduleInput(input) });
  }

  function updateSchedule(sessionId, scheduleId, input) {
    if (!scheduleId) throw new Error('Choose the reminder to edit');
    return mutateSchedule('update', sessionId, { id: scheduleId, input: scheduleInput(input) });
  }

  function deleteSchedule(sessionId, scheduleId) {
    if (!scheduleId) throw new Error('Choose the reminder to delete');
    return mutateSchedule('delete', sessionId, { id: scheduleId });
  }

  async function initialize() {
    await connect();
    const results = await Promise.allSettled([
      listSessions(), rpc('session/modelCatalog'), rpc('permissionPresets/catalog'),
      Promise.race([workspaceReady, new Promise(resolve => setTimeout(resolve, 2500))]),
    ]);
    if (results[0].status === 'rejected') throw results[0].reason;
    const catalog = results[1].status === 'fulfilled' ? results[1].value : null;
    state.models = (catalog?.groups || []).flatMap(group =>
      (group.models || []).map(model => ({ id: `${group.id}/${model.id}`,
        name: `${group.name} · ${model.name}`, provider: group.id, model: model.id })));
    state.selectedModel ||= modelId(catalog?.default) || null;
    const permissions = results[2].status === 'fulfilled' ? results[2].value : null;
    state.permissionPresets = permissions?.options || [];
    state.selectedPermissionPresetId ||= permissions?.defaultPreset || null;
    if (state.currentSessionId && !state.sessions.some(item => item.id === state.currentSessionId)) {
      state.currentSessionId = null;
      try { localStorage.removeItem('aster-dsh-session'); } catch { /* Storage unavailable. */ }
    }
    emitContext();
    return copy();
  }

  async function loadSession(sessionId) {
    await connect();
    if (!sessionId) throw new Error('Choose a DSH conversation');
    const previousSessionId = state.currentSessionId;
    const previousMessages = state.messages;
    state.currentSessionId = String(sessionId);
    state.messages = [];
    try { localStorage.setItem('aster-dsh-session', state.currentSessionId); } catch { /* Optional. */ }
    try {
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { unsubscribe(); reject(new Error('DSH conversation timed out')); }, 10000);
        const unsubscribe = subscribe(event => {
          if (event.type !== 'session' || event.sessionId !== sessionId || !Array.isArray(event.messages)) return;
          clearTimeout(timeout);
          unsubscribe();
          resolve({ sessionId, messages: [...state.messages], status: event.status });
        });
        try { followSession(state.currentSessionId); }
        catch (error) { clearTimeout(timeout); unsubscribe(); reject(error); }
      });
    } catch (error) {
      cancelStream(sessionStreamId);
      sessionStreamId = null;
      state.currentSessionId = previousSessionId;
      state.messages = previousMessages;
      try {
        if (previousSessionId) localStorage.setItem('aster-dsh-session', previousSessionId);
        else localStorage.removeItem('aster-dsh-session');
      } catch { /* Optional. */ }
      if (previousSessionId && socket?.readyState === WebSocket.OPEN) {
        try { followSession(previousSessionId); }
        catch (restoreError) { report(restoreError); }
      }
      throw error;
    }
  }

  async function createSession(options = {}) {
    await connect();
    const request = {};
    if (options.workspaceId || state.selectedWorkspaceId)
      request.workspaceId = options.workspaceId || state.selectedWorkspaceId;
    if (options.cwd) request.cwd = options.cwd;
    const result = await rpc('session/create', { request });
    const sessionId = result?.sessionId;
    if (!sessionId) throw new Error('DSH did not create a conversation');
    state.sessions.unshift({ id: sessionId, sessionId, title: 'A new conversation',
      updatedAt: Date.now(), blank: true });
    state.currentSessionId = sessionId;
    state.messages = [];
    try { localStorage.setItem('aster-dsh-session', sessionId); } catch { /* Optional. */ }
    followSession(sessionId);
    if (futureModel) await selectModel(futureModel);
    if (futurePermission) await setPermission(futurePermission);
    return { sessionId };
  }

  function clearSession() {
    futureModel = state.selectedModel;
    futurePermission = state.selectedPermissionPresetId;
    cancelStream(sessionStreamId);
    sessionStreamId = null;
    state.currentSessionId = null;
    state.messages = [];
    activeAttempt = null;
    try { localStorage.removeItem('aster-dsh-session'); } catch { /* Optional. */ }
  }

  async function uploadAttachment(sessionId, attachment) {
    const blob = attachment?.file instanceof Blob ? attachment.file
      : attachment instanceof Blob ? attachment
      : new Blob([attachment.text || ''], { type: 'application/octet-stream' });
    const name = attachment.name || (attachment instanceof File ? attachment.name : 'note.txt');
    const url = new URL('api/session/uploadFileBinary', location.href);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('name', name);
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/octet-stream' }, body: blob });
    if (!response.ok) throw new Error(`DSH file upload: HTTP ${response.status}`);
    const result = await response.json();
    if (!result?.ok) throw errorOf(result?.error);
    return { type: 'file', receiptId: result.value.receiptId };
  }

  async function imagePart(attachment) {
    const blob = attachment?.file instanceof Blob ? attachment.file : attachment;
    const mediaType = blob.type;
    const allowed = state.imageLimits?.mediaTypes || ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(mediaType)) throw new Error('This image format is not supported by DSH');
    if (blob.size > (state.imageLimits?.maxImageBytes || 20 * 1024 * 1024))
      throw new Error('This image exceeds the DSH image limit');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result), { once: true });
      reader.addEventListener('error', () => reject(reader.error || new Error('Could not read image')), { once: true });
      reader.readAsDataURL(blob);
    });
    return { type: 'image', mediaType, data: String(dataUrl).split(',', 2)[1],
      name: attachment.name || blob.name || 'image' };
  }

  async function sendMessage({ sessionId, text, attachments = [] }) {
    await connect();
    if (!sessionId) throw new Error('No active DSH conversation');
    const content = [];
    if (String(text || '').trim()) content.push({ type: 'text', text: String(text) });
    for (const attachment of attachments) {
      const blob = attachment?.file instanceof Blob ? attachment.file : attachment;
      content.push(blob instanceof Blob && blob.type.startsWith('image/')
        ? await imagePart(attachment)
        : await uploadAttachment(sessionId, attachment));
    }
    if (!content.length) throw new Error('Write a message or attach a file');
    const result = await rpc('session/prompt', { request: { requestId: id(), sessionId,
      mode: 'queue', content, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
    if (!result?.accepted) throw new Error('DSH did not accept the message');
    updateSessionStatus('running');
    return result;
  }

  async function cancel(sessionId) {
    await rpc('session/cancel', { request: { sessionId } });
    updateSessionStatus('idle');
  }

  async function renameSession(sessionId, title) {
    const result = await rpc('session/rename', { request: { sessionId, title } });
    archivedTitleCache.delete(sessionId);
    const summary = state.sessions.find(item => item.id === sessionId);
    if (summary) summary.title = result.title;
    return result.title;
  }

  async function forkSession(sessionId) {
    if (!sessionId) throw new Error('Open a DSH conversation to fork it');
    const result = await rpc('session/fork', { request: { sessionId } });
    if (!result?.sessionId) throw new Error('DSH did not return a forked conversation');
    return result.sessionId;
  }

  async function pinSession(sessionId, pinned) {
    const endpoint = pinned ? 'pinSession' : 'unpinSession';
    const result = await rpc(`workspace/${endpoint}`, { request: { sessionId } });
    state.pinnedSessionIds = result.pinnedSessionIds || [];
    annotateSessions();
    return Boolean(pinned);
  }

  async function archiveSession(sessionId, archived) {
    const endpoint = archived ? 'archiveSession' : 'unarchiveSession';
    const result = await rpc(`workspace/${endpoint}`, { request: { sessionId } });
    archivedTitleCache.delete(sessionId);
    state.archivedSessionIds = result.archivedSessionIds || [];
    if (archived) state.pinnedSessionIds = state.pinnedSessionIds.filter(id => id !== sessionId);
    annotateSessions();
    if (archived && state.currentSessionId === sessionId) clearSession();
    return Boolean(archived);
  }

  async function executeCommand(sessionId, command) {
    const line = String(command || '').trim();
    if (!/^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(line))
      throw new Error('Enter a DSH command beginning with /');
    const execution = await rpc('commands/execute', { agentId: sessionId,
      line, submittedAttachments: [] });
    if (!execution) throw new Error('Unknown DSH command');
    if (execution.result?.kind === 'error')
      throw new Error(execution.result.text || 'DSH command failed');
    return execution;
  }

  function listCommands(sessionId) {
    if (!sessionId) throw new Error('Open a DSH conversation to see its commands');
    return rpc('commands/list', { agentId: sessionId });
  }

  async function listPlugins() {
    const inventory = await rpc('pluginInventory/list');
    if (inventory?.managementAvailable !== true)
      return { available: false, bundles: [], plugins: inventory?.entries || [], agentPresets: inventory?.agentPresets || [] };
    const [bundles, plugins] = await Promise.all([
      rpc('pluginManager/listBundles'), rpc('pluginManager/listPlugins'),
    ]);
    return { available: true, bundles, plugins, agentPresets: inventory?.agentPresets || [] };
  }

  async function setPluginEnabled({ kind, id: target, enabled }) {
    if (typeof enabled !== 'boolean' || !target)
      throw new Error('Choose a DSH plugin and its desired state');
    let result;
    if (kind === 'bundle') {
      result = await rpc('pluginManager/setBundleEnabled', { name: target, enabled });
    } else if (kind === 'plugin') {
      result = await rpc('pluginManager/setPluginEnabled', { id: target, enabled });
    } else throw new Error('Unknown DSH plugin type');
    if (result?.application === 'failed' || result?.application === 'cancelled')
      throw new Error(result.error?.diagnostic || result.error?.code || 'DSH plugin change failed');
    return result;
  }

  function inspectPluginBundle(spec, options = {}) {
    const target = String(spec || '').trim();
    if (!target) throw new Error('Enter a DSH bundle package name or source');
    return rpc('pluginManager/inspect', { spec: target,
      options: options.registry === undefined ? {} : { registry: options.registry } });
  }

  // Return the request ID before the potentially long pnpm call settles, so
  // the UI can offer Host-confirmed cancellation without a second process.
  function startPluginInstall(spec, options = {}) {
    const target = String(spec || '').trim();
    if (!target) throw new Error('Enter a DSH bundle package name or source');
    const requestId = id();
    const installOptions = { enabled: options.enabled === true, requestId };
    if (options.registry !== undefined) installOptions.registry = options.registry;
    if (options.approvedBuilds !== undefined)
      installOptions.approvedBuilds = [...options.approvedBuilds];
    pluginInstalls.set(requestId, { loggedChars: 0, truncated: false });
    while (pluginInstalls.size > 4) pluginInstalls.delete(pluginInstalls.keys().next().value);
    const result = rpc('pluginManager/installBundle', { spec: target, options: installOptions })
      .then(value => {
        pluginInstalls.delete(requestId);
        return value;
      }, error => {
        pluginInstalls.delete(requestId);
        throw error;
      });
    return { requestId, result };
  }

  async function waitForPluginInstall(requestId) {
    if (!requestId) throw new Error('Choose a DSH installation to recover');
    const result = await rpc('pluginManager/waitForInstall', { requestId });
    if (result !== null) pluginInstalls.delete(requestId);
    return result;
  }

  async function cancelPluginInstall(requestId) {
    if (!requestId) throw new Error('Choose a DSH installation to cancel');
    const cancellation = await rpc('pluginManager/cancelInstall', { requestId });
    if (cancellation?.status === 'cancelled' || cancellation?.status === 'not-running')
      pluginInstalls.delete(requestId);
    return cancellation;
  }

  async function removePluginBundle(name) {
    const target = String(name || '').trim();
    if (!target) throw new Error('Choose a DSH bundle to remove');
    const result = await rpc('pluginManager/removeBundle', { name: target });
    if (result?.application === 'failed' || result?.application === 'cancelled')
      throw new Error(result.error?.diagnostic || result.error?.code || 'DSH bundle removal failed');
    return result;
  }

  async function getModelProviders() {
    const [declared, registered, settings] = await Promise.all([
      rpc('llm/listConfigurableProviders'), rpc('llm/listProviders'), rpc('settings/describe'),
    ]);
    const active = new Set((registered || []).map(item => item.id));
    const namespaces = new Map((settings?.namespaces || []).map(item => [item.ns, item]));
    const rows = (declared || []).map(item => {
      let profile = namespaces.get(item.settingsNs)?.value;
      for (const segment of item.settingsPath || []) profile = profile?.[segment];
      const configuredRef = typeof profile?.apiKeyEnv === 'string' ? profile.apiKeyEnv : null;
      const ref = configuredRef || `${item.provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
      return { provider: item.provider, name: item.displayName || item.provider,
        active: active.has(item.provider), configured: profile !== undefined,
        ref, configuredRef,
        settingsNs: item.settingsNs, error: item.error || null };
    });
    const refs = [...new Set(rows.map(item => item.ref))].slice(0, 64);
    const credentials = refs.length ? await rpc('credentials/describe', { refs }) : {};
    return rows.map(item => ({ ...item,
      credential: credentials[item.ref] || { configured: false, writable: false },
    }));
  }

  async function setModelCredential(ref, value) {
    if (typeof ref !== 'string' || !ref || typeof value !== 'string' || !value.trim())
      throw new Error('Enter an API key for the selected DSH provider');
    await rpc('credentials/set', { ref, value });
    return rpc('credentials/describe', { refs: [ref] });
  }

  async function selectModel(selected) {
    const selectedId = modelId(selected);
    const model = state.models.find(item => item.id === selectedId);
    if (!model) throw new Error('That model is not available in DSH');
    if (state.currentSessionId) {
      await rpc('session/selectModel', { request: { sessionId: state.currentSessionId,
        provider: model.provider, model: model.model } });
    } else futureModel = selectedId;
    state.selectedModel = selectedId;
    emitContext();
    return selectedId;
  }

  async function answerApproval(requestId, decision) {
    const frame = interactions.get(requestId);
    if (!frame || frame.event !== 'approval/request') throw new Error('Approval has expired');
    await eventResult(requestId, { kind: 'result',
      value: decision === 'approve' ? 'allowed-once' : 'rejected' });
    interactions.delete(requestId);
  }

  async function answerQuestions(requestId, answers) {
    const frame = interactions.get(requestId);
    if (!frame || frame.event !== 'user-questions/request') throw new Error('Question has expired');
    const questions = frame.request?.questions || [];
    if (!Array.isArray(answers) || answers.length !== questions.length)
      throw new Error('Answer each DSH question');
    const encoded = questions.map((question, index) => {
      const answer = answers[index];
      const labels = (question.options || []).map(item => item.label);
      let selected;
      let custom;
      if (typeof answer === 'string') {
        const value = answer.trim();
        selected = labels.includes(value) ? [value] : [];
        custom = selected.length ? undefined : value;
      } else {
        selected = Array.isArray(answer?.selected) ? answer.selected : [];
        custom = typeof answer?.custom === 'string' ? answer.custom.trim() : undefined;
      }
      if (!selected.every(value => labels.includes(value)))
        throw new Error('DSH question contains an unknown choice');
      if (!question.multiSelect && selected.length > 1)
        throw new Error('Choose one answer for this DSH question');
      if (!selected.length && !custom) throw new Error('Answer each DSH question');
      return { id: question.id, selected, ...custom ? { custom } : {} };
    });
    await eventResult(requestId, { kind: 'result', value: { answers: encoded } });
    interactions.delete(requestId);
  }

  function setWorkspace(workspaceId) {
    if (!state.workspaces.some(item => item.id === workspaceId))
      throw new Error('That workspace is not available in DSH');
    state.selectedWorkspaceId = workspaceId;
    try { localStorage.setItem('aster-dsh-workspace', workspaceId); } catch { /* Optional. */ }
    emitContext();
    return workspaceId;
  }

  async function createWorkspace(path) {
    const result = await rpc('workspace/create', { request: { path } });
    const item = workspaceView(result.workspace);
    state.workspaces = [...state.workspaces.filter(existing => existing.id !== item.id), item];
    emitContext();
    return item;
  }

  async function setPermission(presetId) {
    if (!state.permissionPresets.some(item => item.value === presetId))
      throw new Error('That permission preset is not available in DSH');
    if (state.currentSessionId) {
      await executeCommand(state.currentSessionId, `/permission ${presetId}`);
    } else futurePermission = presetId;
    state.selectedPermissionPresetId = presetId;
    emitContext();
    return presetId;
  }

  function subscribe(handler) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  }

  globalThis.AsterBackend = { enabled, initialize, subscribe, listSessions,
    searchSessions, listArchivedSessions, getSchedules, createSchedule, updateSchedule, deleteSchedule,
    createSession, clearSession, loadSession, sendMessage, cancel,
    renameSession, forkSession, pinSession, archiveSession, executeCommand, listCommands,
    listPlugins, setPluginEnabled, inspectPluginBundle, startPluginInstall,
    waitForPluginInstall, cancelPluginInstall, removePluginBundle,
    getModelProviders, setModelCredential, selectModel,
    answerApproval, answerQuestions, setWorkspace, createWorkspace, setPermission };
})();
