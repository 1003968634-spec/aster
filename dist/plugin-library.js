/* Presentation metadata only. DSH remains the authority for state and control. */
(() => {
  'use strict';
  const categories = Object.freeze({
    core: { title: 'Core', label: '运行核心', color: '#762b37', note: 'Agent、会话与模型执行的基础能力。分类不等于启停权限。', symbols: ['☉', '✦'], art: ['01-core-sun', '02-core-spark'] },
    system: { title: 'System', label: '系统内部', color: '#2d3c78', note: '配置、存储、连接与界面基础设施；原版 DSH WebUI 组件也归在这里。', symbols: ['☾', '▱'], art: ['03-system-moon', '04-system-grimoire'] },
    feature: { title: 'Feature', label: '功能插件', color: '#28674e', note: '文件、终端、技能、规划与协作等面向任务的能力。', symbols: ['✧', '⌁'], art: ['05-function-compass', '06-function-quill'] },
    extension: { title: 'Extension', label: '额外扩展', color: '#684084', note: '来自可移除牌盒或 DSH 内置可选牌盒的插件；原有职责分类仍然保留。', symbols: ['♧', '✴'], art: ['07-extension-gate', '08-extension-messenger'] },
    unknown: { title: 'Unclassified', label: '待分类', color: '#7e7461', note: '当前元数据不足以可靠判断职责，保留在这里等待补充。', symbols: ['◇', '◇'], art: [] },
  });
  const core = new Set(['agent', 'agent-loop', 'agent-default-model', 'session', 'llm', 'tools', 'system-prompt', 'session-projection']);
  const system = new Set(['hmr', 'settings', 'config-editor', 'authorization', 'credentials-local', 'deepseek-account-platform', 'deepseek-llm-api-extensions', 'plugin-manager', 'plugin-package-inventory-deepseek', 'typert-registry', 'typert-loader', 'storage', 'storage-json', 'storage-domain', 'token-meter', 'attachment-local', 'file-reference-local', 'media-reference-local', 'workspace', 'workspace-changes', 'shell-env', 'subprocess-local', 'jobs-local', 'fs-local', 'fs-sandbox', 'fs-observation-policy', 'sandbox-local', 'sandbox-policy', 'bash-sandbox', 'pwsh-sandbox', 'spill-local', 'spill-policy', 'tool-call-timeout-policy', 'user-approval', 'user-questions', 'permission-presets', 'agent-preset', 'agent-preset-registry', 'cordis-host-runner', 'cordis-client-runner', 'web-app', 'web-app/startup', 'ptc-runtime-node']);
  const feature = new Set(['skill', 'skill-filesystem', 'skill-badge', 'commands', 'goal', 'goal-round-driver', 'plan-mode', 'agent-instructions', 'persona', 'web', 'web-search-deepseek', 'web-fetch-http', 'mcp-resources', 'repeat-tool-reminder', 'message-feedback', 'session-log-export', 'office-to-pdf', 'schedule']);
  function role(item) {
    const moduleName = String(item.moduleName || '');
    if (moduleName === 'cordis:include' || moduleName === 'cordis:group') return 'system';
    if (moduleName.startsWith('@deepseek-ai/cordis-plugin-')) return 'system';
    if (!moduleName.startsWith('@deepseek-ai/dsh-')) return 'unknown';
    const name = moduleName.slice('@deepseek-ai/dsh-'.length);
    if (core.has(name) || /^(llm-deepseek|llm-pi-ai)(\/|$)/.test(name)) return 'core';
    if (system.has(name) || /^(api-|host-|client-|session-(persistence|query|projection-|telemetry|log-deepseek|checkpoint|reference|stats|turn-outline|title)|llm-retry)/.test(name)) return 'system';
    if (name === 'tool-subagent/model-selection-settings' || name === 'tool-cordis/host') return 'system';
    if (feature.has(name) || /^(tool-|command-|compaction-|subagent|workflow-)/.test(name) || name === 'plugin-manager/tools') return 'feature';
    return 'unknown';
  }
  function bundlesFor(item, bundles = []) {
    if (item._presetId) return [];
    return bundles.filter(bundle => (bundle.rows || []).some(row =>
      (row.entryId && row.entryId === item.entryId && row.moduleName === item.moduleName) ||
      (item.patchId && row.rowId === item.patchId && row.moduleName === item.moduleName)));
  }
  function source(item, bundles = []) {
    const owners = bundlesFor(item, bundles);
    if (owners.some(bundle => bundle.removable === true)) return { key: 'added', label: '用户加装', owners };
    if (owners.some(bundle => bundle.optional === true)) return { key: 'optional', label: '内置可选', owners };
    if (owners.some(bundle => bundle.installed === false)) return { key: 'provided', label: 'DSH 提供', owners };
    if (owners.some(bundle => bundle.installed === true)) return { key: 'profile', label: 'Profile 依赖', owners };
    return { key: 'unknown', label: item._presetId ? 'Agent 预设声明' : '来源未提供', owners };
  }
  function classify(item, bundles = []) {
    const duty = role(item), origin = source(item, bundles);
    const extra = origin.key === 'added' || origin.key === 'optional';
    return { role: duty, category: extra ? 'extension' : duty, origin, extra };
  }
  function hash(value) { let result = 2166136261; for (const c of String(value)) result = Math.imul(result ^ c.charCodeAt(0), 16777619); return result >>> 0; }
  function artwork(item, bundles = []) {
    const classification = classify(item, bundles), info = categories[classification.category];
    const variant = hash(item.moduleName || item.entryId || item.name) % 2;
    const number = { core: 1, system: 3, feature: 5, extension: 7 }[classification.category];
    return { ...classification, ...info, variant, numeral: number ? roman(number + variant) : '·', symbol: info.symbols[variant], src: info.art[variant] ? `./assets/tarot/${info.art[variant]}.webp` : null };
  }
  function roman(value) {
    let n = Math.max(1, Math.floor(Number(value) || 1)), result = '';
    for (const [v, text] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) while (n >= v) { result += text; n -= v; }
    return result;
  }
  function scopedRows(state, scope = 'host') {
    if (scope === 'host') return state?.plugins || [];
    const preset = (state?.agentPresets || []).find(item => item.id === scope.slice(7));
    const occurrences = new Map();
    return (preset?.rows || []).map(row => {
      const identity = JSON.stringify([preset.id, row.entryId ?? null, row.moduleName]);
      const occurrence = occurrences.get(identity) || 0; occurrences.set(identity, occurrence + 1);
      return { ...row, _presetId: preset.id, _presetName: preset.name || preset.id, _cardKey: `preset:${identity}:${occurrence}`, readOnlyReason: 'preset-owned' };
    });
  }
  function key(item) { return String(item._cardKey || item.entryId || item.name || ''); }
  function readOnlyReason(item, available, kind = 'plugin') {
    if (item._presetId) return '此条目由 Agent 预设管理，当前插件启停接口不能单独修改它。';
    if (!available) return '当前 DSH Host 未提供可写的插件管理接口。';
    if (item.error) return item.error.diagnostic || item.error.code || 'DSH 无法管理此条目。';
    if (item.readOnlyReason === 'management-required') return 'DSH 保护了这个管理或连接组件，当前接口不允许启停。';
    if (item.readOnlyReason === 'unaddressable') return '此实例没有可唯一定位的 Profile 配置条目，当前接口只读。';
    if (item.readOnlyReason) return String(item.readOnlyReason);
    if (kind === 'plugin' && !item.patchId) return '未提供可持久化的配置定位信息，当前接口只读。';
    return '';
  }
  function matchesState(item, filter, available, kind) {
    if (filter === 'enabled') return item.enabled === true;
    if (filter === 'off') return item.enabled === false;
    if (filter === 'attention') return Boolean(item.error || item.fiberPhase === 'failed' || (item.enabled === true && item.fiberPhase === 'pending'));
    if (filter === 'manageable') return !readOnlyReason(item, available, kind);
    if (filter === 'readonly') return Boolean(readOnlyReason(item, available, kind));
    return true;
  }
  // These are verified implementation declarations, not a live child inventory.
  const internals = Object.freeze({
    '@deepseek-ai/dsh-api-workspace-controller': ['Directory picker controller'],
    '@deepseek-ai/dsh-api-settings-controller': ['Credentials controller'],
    '@deepseek-ai/dsh-api-session-controller': ['File references', 'Media references', 'Skill catalog', 'Archived session gate'],
    '@deepseek-ai/dsh-web-app': ['Frontend static service'],
  });
  window.AsterPluginLibrary = Object.freeze({ categories, classify, artwork, scopedRows, key, readOnlyReason, matchesState, roman, internals });
})();

/* Loaded before app.js; these functions run only after its app context exists. */
(() => {
  'use strict';
  const library = window.AsterPluginLibrary;
  const PAGE_SIZE = 16;
  const h = value => escapeHTML(value ?? '');
  const rowKey = library.key;
  const favorites = () => Array.isArray(data.pluginFavorites) ? data.pluginFavorites : [];
  const favoriteKey = (item, kind) => `${kind}:${rowKey(item)}`;
  function controlReason(item, kind) {
    if (backendState.status !== 'connected') return 'DSH 连接已断开；重新连接并刷新后才能管理这张牌。';
    if (backendState.pluginStale) return '上次更改后的状态尚未确认，请先刷新牌库。';
    return library.readOnlyReason(item, backendState.pluginData?.available, kind);
  }
  function record(kind, id) {
    if (kind === 'bundle') return (backendState.pluginData?.bundles || []).find(item => item.name === id);
    const host = (backendState.pluginData?.plugins || []).find(item => rowKey(item) === id);
    if (host) return host;
    for (const preset of backendState.pluginData?.agentPresets || []) {
      const match = library.scopedRows(backendState.pluginData, `preset:${preset.id}`).find(item => rowKey(item) === id);
      if (match) return match;
    }
    return null;
  }
  function status(item) {
    if (item.error || item.fiberPhase === 'failed') return 'Needs attention';
    if (item.enabled === 'conditional') return 'Conditional';
    if (item.fiberPhase === 'loading') return 'Starting…';
    if (item.fiberPhase === 'unloading') return 'Stopping…';
    if (item.enabled === false) return 'Off';
    if (item.fiberPhase === 'pending') return 'Waiting';
    if (item.fiberPhase === 'active') return 'Running';
    return item.enabled === true ? 'Enabled' : 'State unavailable';
  }
  function art(item) { return library.artwork(item, backendState.pluginData?.bundles || []); }
  function face(item, back = item.enabled !== true) {
    const image = art(item);
    if (back && image.src) return `<img class="plugin-back-art" src="${image.src}" width="400" height="700" alt="" loading="lazy" decoding="async"/>`;
    return `<span class="plugin-front" aria-hidden="true"><span class="plugin-front-number">${image.numeral}</span><span class="plugin-front-star">✦</span><span class="plugin-front-symbol">${image.symbol}</span><span class="plugin-front-rule"></span><span class="plugin-front-name">${h(backendPluginName(item))}</span><span class="plugin-front-description">${h(localizedPluginText(item.meta?.description, image.label))}</span><span class="plugin-front-ribbon">${image.title}</span></span>`;
  }
  function starMarkup(item) {
    const relations = backendPluginRelations(item);
    if (!relations.length) return '';
    return `<div class="dsh-relation-stars" role="group" aria-label="${relations.length} 个 DSH 关联插件">${relations.map(relation => `<button class="dsh-relation-star" type="button" data-related-plugin="${h(relation.entryId)}" data-relation-owner="${h(rowKey(item))}" title="${h(backendPluginName(relation))} · ${h(relation.reason || 'DSH connection')}" aria-label="查看与 ${h(backendPluginName(relation))} 的关联"><span aria-hidden="true"></span></button>`).join('')}</div>`;
  }
  function card(item, kind) {
    const id = kind === 'bundle' ? item.name : rowKey(item), name = backendPluginName(item);
    const image = art(item), enabled = item.enabled === true, readonly = controlReason(item, kind);
    const pending = backendState.pluginPending.has(`${kind}:${id}`), favorite = favorites().includes(favoriteKey(item, kind));
    if (kind === 'bundle') {
      const rows = (item.rows || []).filter(row => row.moduleName !== 'cordis:group'), extra = item.removable || item.optional;
      const counts = Object.entries(library.categories).filter(([key]) => !['extension','unknown'].includes(key)).map(([key, value]) => ({ ...value, count: rows.filter(row => library.classify(row).role === key).length })).filter(value => value.count);
      return `<article class="plugin-library-item plugin-box-item" data-plugin-entry="${h(id)}"><button type="button" class="plugin-box" data-open-plugin="${h(id)}" data-open-kind="bundle" aria-label="打开牌盒 ${h(name)}"><span class="plugin-box-spine">ASTER · COLLECTION</span><span class="plugin-box-number">BUNDLE</span><span class="plugin-box-glyph">✧</span><span class="plugin-box-title">${h(name)}</span><span class="plugin-box-count">${rows.length} cards · ${(item.overrides || []).length} overrides</span><span class="plugin-box-seal">${enabled ? 'Open collection' : 'Resting collection'}</span></button><div class="plugin-card-caption"><div class="plugin-caption-line"><span>${extra ? 'Extension box' : 'DSH collection'}</span><span>${pending ? 'Updating…' : enabled ? 'Enabled' : 'Off'}</span></div><h2>${h(name)}</h2><p>${counts.map(value => `${value.title} ${value.count}`).join(' · ') || 'A set of plugins & configuration'}</p><span class="plugin-card-hint">${readonly ? '只读牌盒 · 点击查看' : '点击查看成员与配置调整'}</span></div></article>`;
    }
    return `<article class="plugin-library-item ${enabled ? 'awakened' : 'dormant'} ${item.fiberPhase === 'failed' ? 'is-failed' : ''}" data-category="${image.category}" data-plugin-entry="${h(id)}"><div class="plugin-card-scene"><button type="button" class="plugin-card-open" data-open-plugin="${h(id)}" data-open-kind="plugin" data-enabled="${enabled}" aria-haspopup="dialog" aria-label="查看 ${h(name)} · ${h(status(item))}">${face(item)}</button>${starMarkup(item)}${favorite ? '<span class="plugin-favorite-mark" title="已收藏">⌑</span>' : ''}</div><div class="plugin-card-caption"><div class="plugin-caption-line"><span>${image.title} · ${image.label}</span><span class="plugin-live-status">${pending ? 'Updating…' : status(item)}</span></div><h2>${h(name)}</h2><p>${h(image.origin.label)}${item._presetName ? ` · ${h(item._presetName)}` : ''}</p><span class="plugin-card-hint">${readonly ? '只读 · 点击查看详情' : '点击详情 · 管理这张牌'}</span></div></article>`;
  }
  function render(refresh = true) {
    if (backendState.pluginSearchComposing) { if (refresh) fetchInventory(); return; }
    const scroll = $('#main').scrollTop;
    const active = document.activeElement;
    const focus = active?.dataset?.openPlugin;
    const focusedField = ['plugin-search', 'plugin-scope', 'plugin-state'].includes(active?.id) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    const previous = new Map($$('#main [data-open-plugin]').map(button => [button.dataset.openPlugin, button.dataset.enabled]));
    const state = backendState.pluginData, tab = backendState.pluginTab || 'plugins';
    if (state && backendState.pluginScope !== 'host' && !(state.agentPresets || []).some(preset => `preset:${preset.id}` === backendState.pluginScope)) { backendState.pluginScope = 'host'; backendState.pluginPage = 0; }
    const kind = tab === 'bundles' ? 'bundle' : 'plugin';
    const rows = kind === 'bundle' ? state?.bundles || [] : library.scopedRows(state, backendState.pluginScope || 'host');
    const query = (backendState.pluginSearch || '').trim().toLowerCase();
    const category = backendState.pluginCategory || 'all';
    const available = Boolean(state?.available && backendState.status === 'connected' && !backendState.pluginStale);
    const categoryMatch = (item, key) => { const c = library.classify(item, state?.bundles || []); return key === 'all' || (key === 'extension' ? c.extra : c.role === key); };
    const matching = rows.filter(item => (kind === 'bundle' || categoryMatch(item, category)) && library.matchesState(item, backendState.pluginState || 'all', available, kind) && (!backendState.pluginFavoritesOnly || favorites().includes(favoriteKey(item, kind))) && `${backendPluginName(item)} ${item.entryId || ''} ${item.name || ''} ${item.moduleName || ''} ${localizedPluginText(item.meta?.description)}`.toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    backendState.pluginPage = Math.min(Math.max(0, backendState.pluginPage || 0), pages - 1);
    const start = backendState.pluginPage * PAGE_SIZE, visible = matching.slice(start, start + PAGE_SIZE);
    const filters = [['all', 'All', '全部'], ...Object.entries(library.categories).map(([key, value]) => [key, value.title, value.label])].filter(([key]) => key !== 'unknown' || rows.some(item => library.classify(item, state?.bundles || []).role === key));
    const preset = (state?.agentPresets || []).find(item => `preset:${item.id}` === backendState.pluginScope);
    const note = kind === 'bundle' ? '牌盒包含插件与配置调整。启用牌盒会加入整套配置，单张牌的实际状态以 DSH 返回为准。' : category === 'all' ? '正面是已启用的能力，背面是暂歇的牌。点牌查看详情，八芒星标记当前关联。罗马数字为系列图案编号，可由多个插件共用。' : library.categories[category]?.note || '';
    let content = visible.map(item => card(item, kind)).join('');
    if (!state) content = `<div class="empty-state">${backendState.pluginError ? h(backendState.pluginError) : '正在读取 DSH 插件牌库…'}</div>`;
    else if (!content) content = '<div class="empty-state">这里暂时没有牌。试试其他分类、作用范围或筛选条件。</div>';
    $('#main').innerHTML = `<section class="page plugins-page plugin-library-page">${pageHeader('CHAPTER II · THE ATELIER', 'Your plugin <em>collection.</em>', 'A place for every kind of magic.')}<div class="plugin-library-top"><div class="plugin-collection-tabs" role="group" aria-label="插件或牌盒"><button type="button" data-backend-plugin-tab="plugins" aria-pressed="${kind === 'plugin'}">Cards · 插件</button><button type="button" data-backend-plugin-tab="bundles" aria-pressed="${kind === 'bundle'}">Boxes · 牌盒</button></div><div class="plugin-library-actions"><button type="button" class="outline-button" id="refresh-plugin-library" ${backendState.status !== 'connected' || backendState.pluginLoading ? 'disabled' : ''}>${backendState.pluginLoading ? '读取中…' : 'Refresh'}</button><button type="button" class="outline-button" id="add-dsh-plugin" ${!available ? 'disabled' : ''}>${icon('plus')} Add bundle</button></div></div>${kind === 'plugin' ? `<div class="plugin-category-tabs" role="group" aria-label="插件分类">${filters.map(([key, title, label]) => `<button type="button" data-plugin-category="${key}" data-category="${key}" aria-pressed="${category === key}"><strong>${title}</strong><span>${label}</span><small>${rows.filter(item => categoryMatch(item, key)).length}</small></button>`).join('')}</div>` : ''}<div class="plugin-library-toolbar"><label class="plugin-search-label"><span>Find a card</span><input type="search" id="plugin-search" value="${h(backendState.pluginSearch)}" placeholder="名称、能力或插件 ID…" autocomplete="off"/></label>${kind === 'plugin' ? `<label><span>Scope · 作用范围</span><select id="plugin-scope"><option value="host">Host · 当前运行配置</option>${(state?.agentPresets || []).map(item => `<option value="preset:${h(item.id)}" ${backendState.pluginScope === `preset:${item.id}` ? 'selected' : ''}>Agent · ${h(item.name || item.id)}${item.isDefault ? ' · 默认' : ''}</option>`).join('')}</select></label>` : ''}<label><span>State · 状态</span><select id="plugin-state">${[['all','全部状态'],['enabled','已启用'],['off','已关闭'],['attention','需要留意'],['manageable','可以管理'],['readonly','只读 / 受保护']].map(([value, label]) => `<option value="${value}" ${backendState.pluginState === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" class="plugin-favorite-filter" id="plugin-favorites" aria-pressed="${Boolean(backendState.pluginFavoritesOnly)}">⌑ 收藏</button></div><p class="plugin-library-note">${h(note)}</p>${preset?.broken ? `<p class="plugin-library-warning">${h(preset.broken)}</p>` : ''}${state && !available ? `<p class="plugin-library-warning">${backendState.status !== 'connected' ? 'DSH 已断开连接，当前显示上次的清单。' : backendState.pluginStale ? '上次更改后的状态尚未确认，请刷新牌库后继续管理。' : '当前 Host 仅提供清单，插件可查看，启停与安装暂不可用。'}</p>` : ''}${backendState.pluginError && state ? `<p class="plugin-library-warning">${h(backendState.pluginError)} · 显示上次读取的结果。</p>` : ''}<div class="plugin-results-line" aria-live="polite"><span>${matching.length} ${kind === 'bundle' ? 'boxes' : 'cards'}${query || category !== 'all' ? ' in this collection' : ''}</span><span>${matching.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, matching.length)} / ${matching.length}</span></div><div class="plugin-library-grid ${kind === 'bundle' ? 'plugin-box-grid' : ''}">${content}</div>${pages > 1 ? `<nav class="plugin-pagination" aria-label="插件分页"><button type="button" class="outline-button" data-plugin-page="${backendState.pluginPage - 1}" ${backendState.pluginPage === 0 ? 'disabled' : ''}>← Previous</button><span>${backendState.pluginPage + 1} / ${pages}</span><button type="button" class="outline-button" data-plugin-page="${backendState.pluginPage + 1}" ${backendState.pluginPage + 1 === pages ? 'disabled' : ''}>Next →</button></nav>` : ''}</section>`;
    $('#main').scrollTop = scroll;
    if (dialogFocus?.dataset?.openPlugin) {
      const replacement = $$('#main [data-open-plugin]').find(button => button.dataset.openPlugin === dialogFocus.dataset.openPlugin && button.dataset.openKind === dialogFocus.dataset.openKind);
      if (replacement) dialogFocus = replacement;
    }
    if (focus) $$('[data-open-plugin]').find(button => button.dataset.openPlugin === focus)?.focus({ preventScroll: true });
    if (focusedField) {
      const field = document.getElementById(focusedField.id); field?.focus({ preventScroll: true });
      if (field && focusedField.start != null) field.setSelectionRange(focusedField.start, focusedField.end);
    }
    if (data.settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches) for (const button of $$('#main [data-open-plugin]')) {
      if (previous.has(button.dataset.openPlugin) && previous.get(button.dataset.openPlugin) !== button.dataset.enabled) button.animate([{ transform: 'perspective(800px) rotateY(75deg)' }, { transform: 'perspective(800px) rotateY(0)' }], { duration: 340, easing: 'ease-out' });
    }
    if (refresh && backendState.status === 'connected') fetchInventory();
  }
  async function fetchInventory() {
    if (backendState.pluginLoading) { backendState.pluginRefreshQueued = true; return; }
    const request = ++backendState.pluginRequest;
    backendState.pluginLoading = true;
    const refresh = $('#refresh-plugin-library'); if (refresh) { refresh.disabled = true; refresh.textContent = '读取中…'; }
    try {
      const value = await backend.listPlugins();
      if (request !== backendState.pluginRequest) return;
      backendState.pluginData = value; backendState.pluginError = ''; backendState.pluginStale = false;
    } catch (error) {
      if (request === backendState.pluginRequest) { backendState.pluginError = `无法读取 DSH 插件：${error?.message || error}`; backendState.pluginStale = true; }
    } finally {
      backendState.pluginLoading = false;
      if (page === 'plugins') render(false);
      syncDetail();
      if (backendState.pluginRefreshQueued) { backendState.pluginRefreshQueued = false; if (backendState.status === 'connected') fetchInventory(); }
    }
  }
  function memberMarkup(bundle) {
    const rows = bundle.rows || [], overrides = bundle.overrides || [];
    const lookup = backendState.pluginData?.plugins || [];
    const line = row => { const live = row.entryId && lookup.find(item => item.entryId === row.entryId && item.moduleName === row.moduleName); return `<li>${row.moduleName === 'cordis:group' ? `<span>${h(row.rowId)} · 配置分组</span><small>同级条目的容器</small>` : live ? `<button type="button" data-open-plugin="${h(live.entryId)}" data-open-kind="plugin">${h(backendPluginName(live))}</button><small>${h(status(live))}</small>` : `<span>${h(backendPluginName(row))}</span><small>${h(row.rowId || '')} · 未匹配运行实例</small>`}</li>`; };
    return `<section class="plugin-detail-section"><h3>Included entries <small>${rows.length}</small></h3><p>此牌盒声明加入的插件与配置分组。</p><ul class="plugin-member-list">${rows.map(line).join('') || '<li>未声明成员，或 DSH 无法读取牌盒。</li>'}</ul></section><section class="plugin-detail-section"><h3>Configuration changes <small>${overrides.length}</small></h3><p>这些现有条目的配置被牌盒调整，不属于它新增的成员。</p><ul class="plugin-member-list">${overrides.map(id => `<li><span>${h(id)}</span></li>`).join('') || '<li>没有额外配置覆盖。</li>'}</ul></section>`;
  }
  function open(kind, id) {
    const item = record(kind, id); if (!item) { toast('这张牌已不在当前清单中，请刷新牌库。'); return; }
    const name = backendPluginName(item), image = art(item), readonly = controlReason(item, kind);
    const pending = backendState.pluginPending.has(`${kind}:${id}`), busy = backendState.pluginPending.size > 0, favorite = favorites().includes(favoriteKey(item, kind));
    const relations = kind === 'plugin' ? backendPluginRelations(item) : [];
    const internals = library.internals[item.moduleName] || [];
    const feedback = backendState.pluginFeedback.get(`${kind === 'bundle' ? 'bundles' : 'plugins'}:${id}`);
    const previousFocus = $('#detail-dialog').open ? dialogFocus : null;
    const preview = kind === 'bundle' ? `<div class="plugin-detail-box">✧<strong>${h(name)}</strong><span>${(item.rows || []).filter(row => row.moduleName !== 'cordis:group').length} cards</span></div>` : `<div class="plugin-detail-card" data-category="${image.category}">${face(item, true)}</div>`;
    const controls = `<div class="plugin-detail-controls"><button type="button" class="solid-button" data-dsh-plugin-kind="${kind}" data-dsh-plugin-id="${h(id)}" data-plugin-action="toggle" aria-pressed="${item.enabled === true}" aria-busy="${pending}" ${readonly || busy ? 'disabled' : ''}>${pending ? 'Updating…' : busy ? '等待更改完成'  : item.enabled === true ? 'Turn off · 关闭' : 'Enable · 启用'}</button><button type="button" class="outline-button" data-pin-plugin="${h(id)}" data-pin-kind="${kind}" aria-pressed="${favorite}">${favorite ? '取消收藏' : '⌑ 收藏这张牌'}</button>${kind === 'bundle' && item.removable ? `<button type="button" class="text-button" data-remove-bundle="${h(id)}" ${busy || backendState.status !== 'connected' || backendState.pluginStale ? 'disabled' : ''}>Uninstall bundle</button>` : ''}</div>`;
    openDialog(`<div class="plugin-management-detail" data-detail-kind="${kind}" data-detail-id="${h(id)}"><button type="button" class="dialog-close icon-button" data-close aria-label="关闭插件详情">${icon('close')}</button><div class="plugin-detail-hero">${preview}<div class="plugin-detail-intro"><div class="eyebrow">${kind === 'bundle' ? 'BUNDLE · A COLLECTION' : `${image.title.toUpperCase()} · ${image.label}`}</div><h2>${h(name)}</h2><p>${h(localizedPluginText(item.meta?.description, item.description || 'DSH 未提供这张牌的说明。'))}</p><div class="plugin-detail-tags"><span>${h(status(item))}</span>${kind === 'plugin' ? `<span>${h(library.categories[image.role].title)} · 职责</span><span>${h(image.origin.label)}</span>` : `<span>${item.optional ? '内置可选' : item.removable ? '用户加装' : item.installed ? 'Profile 依赖' : 'DSH 提供'}</span>`}<span>${item._presetName ? `Agent · ${h(item._presetName)}` : 'Host · 当前配置'}</span></div>${controls}${readonly ? `<p class="plugin-detail-readonly">${h(readonly)}</p>` : image.role === 'core' && kind === 'plugin' ? '<p class="plugin-detail-readonly">这是运行基础能力，关闭可能中断依赖它的 Agent 功能。请先检查下方关联。</p>' : ''}${feedback ? `<p class="plugin-detail-feedback" role="status">${h(feedback)}</p>` : ''}${item.enabled === 'conditional' ? '<p class="plugin-detail-readonly">启用状态由预设条件决定，尚无运行实例时不推断结果。</p>' : ''}</div></div>${kind === 'bundle' ? memberMarkup(item) : `<section class="plugin-detail-section"><h3>Connections <small>${relations.length}</small></h3><p>每颗八芒星代表一个当前解析到的关联插件；清单未提供依赖方向，未连接也不代表没有静态依赖。</p><ul class="plugin-member-list">${relations.map(relation => `<li><button type="button" data-related-plugin="${h(relation.entryId)}" data-relation-owner="${h(id)}">✴ ${h(backendPluginName(relation))}</button><small>${h(relation.reason || 'DSH connection')}</small></li>`).join('') || '<li>DSH 当前没有返回已解析关联。</li>'}</ul></section>${image.origin.owners.length ? `<section class="plugin-detail-section"><h3>Belongs to</h3><div class="plugin-detail-box-links">${image.origin.owners.map(bundle => `<button type="button" class="outline-button" data-open-plugin="${h(bundle.name)}" data-open-kind="bundle">${h(backendPluginName(bundle))}</button>`).join('')}</div></section>` : ''}${internals.length ? `<section class="plugin-detail-section"><h3>Inside this card</h3><p>代码声明的内部组件，随主插件运行。当前接口没有独立启停或子组件运行状态。</p><ul class="plugin-internal-list">${internals.map(component => `<li>${h(component)}<span>随主插件运行</span></li>`).join('')}</ul></section>` : ''}`}<details class="plugin-technical-details"><summary>Technical details · 插件标识</summary><dl><dt>Module</dt><dd>${h(item.moduleName || item.name)}</dd><dt>${item._presetId ? 'Preset row' : 'Entry'}</dt><dd>${h(item.entryId || item.name || '未提供')}</dd>${item.patchId ? `<dt>Profile row</dt><dd>${h(item.patchId)}</dd>` : ''}${item.version ? `<dt>Version</dt><dd>${h(item.version)}</dd>` : ''}${item.condition ? `<dt>Condition</dt><dd>${h(item.condition)}</dd>` : ''}<dt>Card artwork</dt><dd>${image.numeral} · 罗马数字是系列图案编号；插件身份以 Entry 为准。</dd></dl></details><p class="plugin-detail-local-note">收藏只保存在 Aster 本机。启停操作由 DSH 保存；牌面始终以刷新后的实际状态为准。</p></div>`);
    $('#detail-dialog').dataset.pluginDetail = 'true';
    if (previousFocus) dialogFocus = previousFocus;
  }
  function relation(ownerId, relatedId) {
    const item = record('plugin', ownerId), relation = item && backendPluginRelations(item).find(row => row.entryId === relatedId);
    if (!relation) { toast('这条关联已不在最新清单中，请重新查看插件详情。'); return; }
    const previousFocus = $('#detail-dialog').open ? dialogFocus : null;
    const related = record('plugin', relatedId);
    openDialog(`<div class="form-dialog plugin-relation-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="关闭关联详情">${icon('close')}</button><div class="eyebrow">A SHARED CONSTELLATION</div><h2>${h(backendPluginName(item))}<span class="dsh-relation-heading-star">✴</span>${h(backendPluginName(relation))}</h2><p class="dsh-plugin-review">${h(relation.reason || 'DSH reports a resolved service connection.')}</p><p class="form-hint">这是当前服务关联，不表示同属一个牌盒或存在父子关系。</p><div class="interaction-actions"><button type="button" class="outline-button" data-open-plugin="${h(ownerId)}" data-open-kind="plugin">返回这张牌</button>${related ? `<button type="button" class="solid-button" data-open-plugin="${h(relatedId)}" data-open-kind="plugin">查看关联插件</button>` : ''}</div></div>`);
    if (previousFocus) dialogFocus = previousFocus;
  }
  function pin(kind, id) {
    const item = record(kind, id); if (!item) return;
    const key = favoriteKey(item, kind), current = favorites();
    data.pluginFavorites = current.includes(key) ? current.filter(value => value !== key) : [...current, key];
    save(); if (page === 'plugins') render(false); open(kind, id);
  }
  function syncDetail() {
    const dialog = $('#detail-dialog'), detail = dialog.open && $('#detail-dialog [data-detail-id]');
    if (!detail) return;
    const { detailKind: kind, detailId: id } = detail.dataset;
    if (!record(kind, id)) { closeDialog(); toast('这张牌已不在当前清单中。'); return; }
    const scroll = dialog.scrollTop, technicalOpen = Boolean($('#detail-dialog .plugin-technical-details')?.open);
    const action = document.activeElement?.dataset?.pluginAction, pin = document.activeElement?.dataset?.pinPlugin;
    open(kind, id);
    const technical = $('#detail-dialog .plugin-technical-details'); if (technical) technical.open = technicalOpen;
    dialog.scrollTop = scroll;
    if (action) $('#detail-dialog [data-plugin-action]')?.focus({ preventScroll: true });
    else if (pin) $('#detail-dialog [data-pin-plugin]')?.focus({ preventScroll: true });
  }
  window.AsterPluginUI = Object.freeze({ render, open, relation, record, pin, status, fetchInventory, syncDetail, controlReason });
})();
