/* A desktop-only cover: the original workspace stays mounted between openings. */
(() => {
  'use strict';
  const root = document.documentElement;
  const workspace = document.getElementById('gift-box');
  if (!workspace || window.asterEnvelope) return;

  const bridge = (action, detail = {}) => {
    const receiver = window.webkit?.messageHandlers?.asterNative;
    if (receiver) receiver.postMessage({ action, ...detail });
    return !!receiver;
  };
  const paper = document.createElement('div');
  paper.id = 'desktop-paper';
  paper.inert = true;
  paper.setAttribute('aria-hidden', 'true');
  for (const element of [...document.querySelectorAll('body > .watercolor-backdrop, body > .paper-grain')]) paper.append(element);
  paper.append(workspace);
  document.body.append(paper);

  // Coordinates remain in the original photograph. SVG only masks the raster
  // layers; it never paints a replacement envelope or changes the closed art.
  const photo = (name, reverse = false) => `<img class="envelope-photo${reverse ? ' envelope-reverse-photo' : ''}" src="./assets/${name}" alt="" draggable="false"/>`;
  const bodyContour = 'M55 110 Q58 105 72 105 H1474 Q1489 105 1489 112 V908 Q1489 918 1479 918 H62 Q51 917 51 907 V117 Q51 112 55 110Z';
  const flapContour = 'M55 108 C340 103 1225 108 1487 109 C1486 136 1480 177 1450 215 Q1165 430.8 880 646.7 C803.3 703.8 726.7 705.3 650 645 Q380 433 110 228 C95 216 82 203 75 183 C65 160 59 138 55 108Z';
  // Follow the photographed lips, including the upward-pointing lower pocket.
  const pocketContour = 'M51 105 L548 545 L710 460 Q767 429 826 460 L978 545 L1492 105 V920 H50Z';
  const maskDefinition = (id, contour) => `<clipPath id="${id}" clipPathUnits="objectBoundingBox"><path transform="matrix(${1 / 1442} 0 0 ${1 / 816} ${-50 / 1442} ${-104 / 816})" d="${contour}"/></clipPath>`;
  const definitions = content => `<svg class="envelope-mask-defs" width="0" height="0" aria-hidden="true"><defs>${content}</defs></svg>`;
  const bodyArtwork = (prefix, foreground = false) => `${definitions(maskDefinition(`${prefix}-outline`, bodyContour) + (foreground ? maskDefinition(`${prefix}-mouth`, pocketContour) : ''))}
    <div class="envelope-body-art" style="clip-path:url(#${prefix}-outline)">${foreground ? `<div class="envelope-photo-plate" style="clip-path:url(#${prefix}-mouth)">` : ''}${photo('envelope-real-open-body-v1.png')}${foreground ? '</div>' : ''}</div>`;
  const closedArtwork = (closing = false) => `<div class="envelope-closed-art${closing ? ' envelope-closing-photo' : ''}" aria-hidden="true">${photo('envelope-real-closed.png')}</div>`;
  const flapArtwork = (prefix, underside = false) => `${definitions(maskDefinition(`${prefix}-shape`, flapContour))}<div class="envelope-flap-art${underside ? ' envelope-reverse-art' : ''}" style="clip-path:url(#${prefix}-shape)">${photo(underside ? 'envelope-real-flap-back-v1.png' : 'envelope-real-closed.png', underside)}</div>`;
  const flapMarkup = prefix => `<div class="envelope-flap" aria-hidden="true"><div class="envelope-flap-paper">${flapArtwork(`${prefix}-front`)}</div><div class="envelope-flap-underside">${flapArtwork(`${prefix}-back`, true)}</div></div>`;
  // Decode the actual photographic assets once. The native window waits for
  // these results instead of showing an unrelated drawn envelope during boot.
  const artworkReady = Promise.all([
    'envelope-real-closed.png', 'envelope-real-open-body-v1.png',
    'envelope-real-flap-back-v1.png', 'wax-seal-real.png',
    'paramont-logo-original.png', 'letter-paper-real.png'
  ].map(async name => {
    const image = new Image();
    image.src = `./assets/${name}`;
    try {
      await image.decode();
      if (!image.naturalWidth) throw new Error('Empty image');
      return null;
    } catch (_) { return name; }
  }));
  const cover = document.createElement('div');
  cover.id = 'desktop-envelope';
  cover.className = 'desktop-envelope desktop-drag';
  cover.innerHTML = `
    <div class="envelope-lining" aria-hidden="true">${bodyArtwork('envelope-lining')}</div>
    <div class="envelope-tucked-letter" aria-hidden="true"></div>
    <div class="envelope-back" aria-hidden="true">${bodyArtwork('envelope-front', true)}</div>
    ${closedArtwork()}
    ${flapMarkup('envelope-flap')}
    <div class="envelope-address"><span class="envelope-recipient">For <span id="envelope-recipient">Sandman</span></span><span class="envelope-inscription">a small universe, enclosed.</span></div>
    <div class="envelope-stamp"><div class="stamp-paper"><span class="stamp-caption">SPECIAL DELIVERY</span><img src="./assets/paramont-logo-original.png" alt="Paramont Global postage stamp" draggable="false"/><span class="stamp-value">✧ &nbsp; BY AIR MAIL</span></div></div>
    <div class="envelope-cancellation" aria-hidden="true"><span>ASTER POST</span><i class="postmark-date"></i><span>✧</span></div>
    <button id="envelope-seal" class="envelope-seal" aria-label="Open your letter"><img src="./assets/wax-seal-real.png" alt="" draggable="false"/></button>
    <span class="envelope-open-hint" aria-hidden="true">break the seal <span>↗</span></span>`;
  document.body.insertBefore(cover, paper);

  const chrome = document.createElement('div');
  chrome.id = 'desktop-chrome';
  chrome.className = 'desktop-chrome desktop-drag';
  chrome.setAttribute('aria-label', 'Window controls');
  chrome.innerHTML = `<div class="desktop-lights"><button type="button" class="desktop-light light-close" data-native="close" aria-label="Close window" title="Close window"><span>×</span></button><button type="button" class="desktop-light light-minimize" data-native="minimize" aria-label="Minimize window" title="Minimize to Dock"><span>−</span></button><button type="button" class="desktop-light light-zoom" data-native="zoom" aria-label="Resize window" title="Resize window"><span>+</span></button></div><span class="desktop-chrome-mark" aria-hidden="true">✧</span>`;
  document.body.append(chrome);

  const topDrag = document.createElement('div');
  topDrag.className = 'desktop-top-drag desktop-drag';
  topDrag.setAttribute('aria-hidden', 'true');
  document.body.append(topDrag);

  // Clip only the part below the envelope's bottom while a sheet is inside.
  // This lets the sheet pass behind the pocket without leaking out underneath.
  const letterStage = document.createElement('div');
  letterStage.id = 'desktop-letter-stage';
  paper.before(letterStage);
  letterStage.append(paper);
  const pocketMask = document.createElement('div');
  pocketMask.id = 'desktop-pocket-mask';
  pocketMask.className = 'desktop-envelope envelope-occluder';
  pocketMask.setAttribute('aria-hidden', 'true');
  pocketMask.innerHTML = bodyArtwork('envelope-occluder', true) + closedArtwork(true) + flapMarkup('envelope-closing-flap');
  const closingFlap = pocketMask.querySelector('.envelope-flap');
  closingFlap.classList.add('envelope-closing-flap');
  document.body.append(pocketMask);

  const seal = document.getElementById('envelope-seal');
  let state = 'sealed';
  let readiness = 'loading';
  seal.disabled = true;
  let previousFocus = null;
  let transitionID = 0;
  let closeRequested = false;
  const pause = duration => new Promise(resolve => window.setTimeout(resolve, duration));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('reduce-motion');
  const setState = value => { state = value; root.dataset.envelope = value; };
  const setStage = value => { root.dataset.envelopeStage = value; };
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  let frameRequest = 0;
  async function resizeNativeWindow(opening) {
    if (!window.webkit?.messageHandlers?.asterNative) return;
    const requestId = `envelope-frame-${++frameRequest}`;
    if (opening) {
      // Freeze the physical envelope size before adding room around it.
      root.style.setProperty('--sealed-envelope-width', `${cover.offsetWidth}px`);
    }
    await new Promise(resolve => {
      const finish = () => {
        clearTimeout(timeout);
        window.removeEventListener('aster-window-ready', ready);
        resolve();
      };
      const ready = event => { if (event.detail?.requestId === requestId) finish(); };
      const timeout = setTimeout(finish, 2000);
      window.addEventListener('aster-window-ready', ready);
      bridge(opening ? 'expand-envelope' : 'compact-envelope', { requestId });
    });
    await nextPaint();
    root.classList.remove('native-frame-changing');
    if (!opening) root.style.removeProperty('--sealed-envelope-width');
  }
  function prepareFrame({opening, oldWidth, oldHeight, width, height, offsetX, offsetY}) {
    root.classList.add('native-frame-changing');
    // A viewport-relative correction is zero before AppKit expands the window
    // and reaches the final offset afterwards, including near screen edges.
    const anchor = (oldSize, newSize, offset, unit) => Math.abs(newSize - oldSize) < .5
      ? `calc(50% + ${offset}px)`
      : `calc(50% + (100${unit} - ${oldSize}px) * ${offset / (newSize - oldSize)})`;
    root.style.setProperty('--sealed-center-x', opening ? anchor(oldWidth, width, offsetX, 'vw') : '50%');
    root.style.setProperty('--sealed-center-y', opening ? anchor(oldHeight, height, offsetY, 'vh') : '50%');
  }
  function sizeOpeningScene() {
    // Leave room above the mouth for a fully extracted sheet, then enlarge it.
    const letterRatio = paper.offsetHeight / Math.max(1, paper.offsetWidth);
    const width = Math.min(cover.offsetWidth, innerWidth - 80,
      (innerHeight - 108) / (.566 + .9 * letterRatio));
    root.style.setProperty('--open-envelope-width', `${Math.max(260, width)}px`);
  }
  function alignSheetWithPocket() {
    const envelopeRect = cover.getBoundingClientRect();
    const scale = envelopeRect.width * .9 / paper.offsetWidth;
    paper.style.transition = 'none';
    paper.style.setProperty('--letter-pocket-scale', scale);
    paper.style.setProperty('--letter-inserted-y', `${envelopeRect.top + 12 - paper.offsetTop}px`);
    paper.style.setProperty('--letter-extracted-y', `${envelopeRect.top - paper.offsetHeight * scale - 18 - paper.offsetTop}px`);
    // Commit the tucked pose while hidden; revealing must not animate from
    // the default scale, which would briefly make the sheet wider than its bag.
    paper.getBoundingClientRect();
    paper.style.removeProperty('transition');
  }
  setState('sealed');
  setStage('sealed');
  root.classList.add('aster-desktop');

  function syncRecipient() {
    const greeting = document.getElementById('greeting-name');
    document.getElementById('envelope-recipient').textContent = greeting?.textContent?.trim() || 'Sandman';
    const stampDate = document.querySelector('.postmark-date');
    if (stampDate) stampDate.textContent = new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short', year:'numeric' }).format(new Date());
  }

  async function open() {
    if (state !== 'sealed' || readiness !== 'ready') return;
    syncRecipient();
    const token = ++transitionID;
    seal.disabled = true;
    const quiet = reduced();
    cover.setAttribute('aria-hidden', 'true');
    setState('opening');
    setStage('collecting');
    await artworkReady;
    if (token !== transitionID) return;
    await resizeNativeWindow(true);
    if (token !== transitionID) return;
    sizeOpeningScene();
    const delivery = window.asterPostage?.deliver?.({ reduced: quiet });
    // Give the star time to reach and peel the stamp before the flap moves.
    await pause(quiet ? 0 : 500);
    if (token !== transitionID) return;
    setStage('unfolding');
    await pause(quiet ? 0 : 800);
    if (token !== transitionID) return;
    alignSheetWithPocket();
    setStage('peeking');
    await pause(quiet ? 0 : 140);
    if (token !== transitionID) return;
    setStage('extracting');
    await pause(quiet ? 0 : 860);
    if (token !== transitionID) return;
    setStage('releasing');
    await Promise.all([delivery, pause(quiet ? 20 : 860)]);
    if (token !== transitionID) return;
    setStage('open');
    setState('open');
    root.style.removeProperty('--sealed-center-x');
    root.style.removeProperty('--sealed-center-y');
    bridge('opened');
    paper.inert = false;
    paper.removeAttribute('aria-hidden');
    const destination = previousFocus?.isConnected && paper.contains(previousFocus)
      ? previousFocus
      : document.getElementById('message-input') || document.getElementById('main');
    destination?.focus({ preventScroll: true });
    if (closeRequested) {
      closeRequested = false;
      closeApplication();
    }
  }

  async function closeLetter({ exit = false } = {}) {
    if (state !== 'open') return;
    previousFocus = document.activeElement;
    const dialog = document.getElementById('detail-dialog');
    if (dialog?.open) dialog.close();
    const token = ++transitionID;
    const quiet = reduced();
    paper.inert = true;
    paper.setAttribute('aria-hidden', 'true');
    syncRecipient();
    sizeOpeningScene();
    setState('folding');
    setStage('collecting');
    bridge('folding');
    // Bring the envelope back from below the window before the sheet descends.
    await pause(quiet ? 0 : 820);
    if (token !== transitionID) return;
    alignSheetWithPocket();
    setStage('gathering');
    const delivery = window.asterPostage?.returnToEnvelope?.({ reduced: quiet });
    await pause(quiet ? 0 : 800);
    if (token !== transitionID) return;
    setStage('stowing');
    await pause(quiet ? 0 : 860);
    if (token !== transitionID) return;
    setStage('closing');
    await pause(quiet ? 0 : 800);
    if (token !== transitionID) return;
    setStage('returning');
    await pause(quiet ? 0 : 800);
    if (token !== transitionID) return;
    setStage('settling');
    await Promise.all([delivery, pause(quiet ? 20 : 180)]);
    if (token !== transitionID) return;
    setStage('sealed');
    setState('sealed');
    cover.removeAttribute('aria-hidden');
    seal.disabled = false;
    seal.focus({ preventScroll: true });
    await resizeNativeWindow(false);
    bridge('sealed');
    if (exit) bridge('close-now');
  }

  async function closeApplication() {
    if (state === 'sealed') {
      bridge('close-now');
      return;
    }
    if (state === 'opening') {
      closeRequested = true;
      return;
    }
    if (state !== 'open') return;
    await closeLetter({ exit: true });
  }

  seal.addEventListener('click', open);
  chrome.addEventListener('click', event => {
    const button = event.target.closest('[data-native]');
    if (button) bridge(button.dataset.native);
  });
  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (!event.target.closest('.desktop-drag') || event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return;
    event.preventDefault();
    bridge('drag');
  });
  window.asterEnvelope = Object.freeze({ open, closeApplication, prepareFrame, status: () => state, readiness: () => readiness });
  syncRecipient();
  bridge('sealed');

  async function prepareInitialFrame() {
    // Other deferred desktop scripts position the postage and window controls.
    // DOMContentLoaded also confirms that their blocking stylesheets settled.
    if (document.readyState === 'loading' || document.readyState === 'interactive') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const missingStyles = ['envelope.css', 'envelope-materials.css', 'postage.css'].filter(name =>
      ![...document.querySelectorAll('link[rel="stylesheet"]')].some(link =>
        new URL(link.href).pathname.endsWith(`/${name}`) && link.sheet));
    const failedArtwork = (await artworkReady).filter(Boolean);
    if (missingStyles.length || failedArtwork.length) {
      throw new Error(`Envelope resources could not load: ${[...missingStyles, ...failedArtwork].join(', ')}`);
    }
    // Force style resolution so local fonts used by the closed cover are part
    // of fonts.ready even while the native window has not been ordered front.
    cover.getBoundingClientRect();
    if (document.fonts) await document.fonts.ready;
    await Promise.all([...cover.querySelectorAll('img')].map(image => image.decode()));
    cover.getBoundingClientRect();
    readiness = 'ready';
    seal.disabled = false;
    root.dataset.envelopeReady = 'true';
    bridge('interface-ready');
  }
  prepareInitialFrame().catch(error => {
    readiness = 'failed';
    root.dataset.envelopeReady = 'failed';
    bridge('interface-failed', { message: error.message || String(error) });
    console.error('Aster envelope startup:', error);
  });
})();
