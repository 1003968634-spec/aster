/* A desktop-only cover: the original workspace stays mounted between openings. */
(() => {
  'use strict';
  const root = document.documentElement;
  const workspace = document.getElementById('gift-box');
  if (!workspace || window.asterEnvelope) return;

  const bridge = action => {
    const receiver = window.webkit?.messageHandlers?.asterNative;
    if (receiver) receiver.postMessage({ action });
  };
  const paper = document.createElement('div');
  paper.id = 'desktop-paper';
  paper.inert = true;
  paper.setAttribute('aria-hidden', 'true');
  for (const element of [...document.querySelectorAll('body > .watercolor-backdrop, body > .paper-grain')]) paper.append(element);
  paper.append(workspace);
  document.body.append(paper);

  const cover = document.createElement('div');
  cover.id = 'desktop-envelope';
  cover.className = 'desktop-envelope desktop-drag';
  cover.innerHTML = `
    <div class="envelope-lining" aria-hidden="true"></div>
    <div class="envelope-back" aria-hidden="true"><img class="envelope-photo" src="./assets/envelope-real-closed.png" alt="" draggable="false"/></div>
    <div class="envelope-flap" aria-hidden="true"><div class="envelope-flap-paper"><img class="envelope-photo" src="./assets/envelope-real-closed.png" alt="" draggable="false"/></div></div>
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

  const fold = document.createElement('button');
  fold.id = 'desktop-fold';
  fold.type = 'button';
  fold.innerHTML = `<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M3 6 12 1 21 6V18H3Z"/><path d="m3 6 9 7 9-7M3 18l7-6m11 6-7-6"/></svg><span>Fold letter</span>`;
  fold.setAttribute('aria-label', 'Fold letter, keeping your workspace');
  fold.title = 'Fold letter · ⌘⇧L';
  fold.hidden = true;
  document.body.append(fold);

  const seal = document.getElementById('envelope-seal');
  let state = 'sealed';
  let previousFocus = null;
  let transitionID = 0;
  const pause = duration => new Promise(resolve => window.setTimeout(resolve, duration));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('reduce-motion');
  const setState = value => { state = value; root.dataset.envelope = value; };
  const setStage = value => { root.dataset.envelopeStage = value; };
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
    if (state !== 'sealed') return;
    syncRecipient();
    const token = ++transitionID;
    seal.disabled = true;
    const quiet = reduced();
    cover.setAttribute('aria-hidden', 'true');
    setState('opening');
    setStage('collecting');
    const delivery = window.asterPostage?.deliver?.({ reduced: quiet });
    bridge('opened');
    // Give the star time to reach and peel the stamp before the flap moves.
    await pause(quiet ? 0 : 500);
    if (token !== transitionID) return;
    setStage('unfolding');
    await pause(quiet ? 0 : 330);
    if (token !== transitionID) return;
    setStage('extracting');
    await Promise.all([delivery, pause(quiet ? 20 : 820)]);
    if (token !== transitionID) return;
    setStage('open');
    setState('open');
    paper.inert = false;
    paper.removeAttribute('aria-hidden');
    fold.hidden = false;
    const destination = previousFocus?.isConnected && paper.contains(previousFocus)
      ? previousFocus
      : document.getElementById('message-input') || document.getElementById('main');
    destination?.focus({ preventScroll: true });
  }

  async function closeLetter() {
    if (state !== 'open') return;
    previousFocus = document.activeElement;
    const dialog = document.getElementById('detail-dialog');
    if (dialog?.open) dialog.close();
    const token = ++transitionID;
    const quiet = reduced();
    fold.hidden = true;
    paper.inert = true;
    paper.setAttribute('aria-hidden', 'true');
    syncRecipient();
    setState('folding');
    setStage('collecting');
    const delivery = window.asterPostage?.returnToEnvelope?.({ reduced: quiet });
    // Lift the stamp, put the sheet away, then close the still-opaque flap.
    await pause(quiet ? 0 : 280);
    if (token !== transitionID) return;
    setStage('stowing');
    await pause(quiet ? 0 : 670);
    if (token !== transitionID) return;
    setStage('closing');
    await pause(quiet ? 0 : 750);
    if (token !== transitionID) return;
    setStage('settling');
    await Promise.all([delivery, pause(quiet ? 20 : 200)]);
    if (token !== transitionID) return;
    setStage('sealed');
    setState('sealed');
    cover.removeAttribute('aria-hidden');
    seal.disabled = false;
    seal.focus({ preventScroll: true });
    bridge('sealed');
  }

  seal.addEventListener('click', open);
  fold.addEventListener('click', closeLetter);
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
  document.addEventListener('keydown', event => {
    if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      if (state === 'sealed') open();
      else if (state === 'open') closeLetter();
    }
  });
  window.asterEnvelope = Object.freeze({ open, fold: closeLetter, status: () => state });
  syncRecipient();
  bridge('sealed');
})();
