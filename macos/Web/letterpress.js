/* Letterhead refinements keep the live buttons and profile bindings untouched. */
(() => {
  'use strict';
  const paper = document.getElementById('desktop-paper');
  if (!paper || document.getElementById('letterpress-definitions')) return;

  const definitions = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  definitions.id = 'letterpress-definitions';
  definitions.setAttribute('width', '0');
  definitions.setAttribute('height', '0');
  definitions.setAttribute('aria-hidden', 'true');
  definitions.setAttribute('focusable', 'false');
  definitions.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';

  function cutTypeFilter(id, edge, rise, softness, opacity) {
    return `<filter id="${id}" x="-12%" y="-35%" width="130%" height="185%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="${edge}" result="cut"/>
      <feTurbulence type="fractalNoise" baseFrequency=".57" numOctaves="2" seed="9" result="fibers"/>
      <feDisplacementMap in="cut" in2="fibers" scale=".28" xChannelSelector="R" yChannelSelector="G" result="paperEdge"/>
      <feGaussianBlur in="paperEdge" stdDeviation="${softness}" result="blur"/>
      <feOffset in="blur" dx="1.1" dy="${rise + 1.5}" result="shadeMask"/>
      <feFlood flood-color="#6b5940" flood-opacity="${opacity}" result="shadeInk"/>
      <feComposite in="shadeInk" in2="shadeMask" operator="in" result="shade"/>
      <feOffset in="paperEdge" dx=".5" dy="${rise}" result="thicknessMask"/>
      <feFlood flood-color="#bcae90" result="edgeInk"/>
      <feComposite in="edgeInk" in2="thicknessMask" operator="in" result="thickness"/>
      <feFlood flood-color="#fffaf0" result="faceInk"/>
      <feComposite in="faceInk" in2="paperEdge" operator="in" result="face"/>
      <feMerge>
        <feMergeNode in="shade"/>
        <feMergeNode in="thickness"/>
        <feMergeNode in="face"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>`;
  }

  definitions.innerHTML = `<defs>${cutTypeFilter('letter-cut-type', 1.45, 1.25, 1.1, .31)}${cutTypeFilter('letter-cut-fine-type', .85, .7, .65, .23)}</defs>`;
  document.body.prepend(definitions);

  const greeting = paper.querySelector('.greeting-copy');
  if (greeting) {
    const cutout = document.createElement('span');
    cutout.className = 'greeting-cutout';
    greeting.before(cutout);
    cutout.append(greeting);
  }

  const footerDate = paper.querySelector('.footer-coordinates');
  if (!footerDate) return;
  const date = document.createElement('time');
  footerDate.replaceChildren(date);
  const formatter = new Intl.DateTimeFormat('en-US', { month:'long', day:'numeric', year:'numeric' });
  let lastDate = '';

  function updateDate() {
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (lastDate === localDate) return;
    lastDate = localDate;
    date.dateTime = localDate;
    date.textContent = formatter.format(now);
    footerDate.setAttribute('aria-label', `Today is ${date.textContent}`);
  }

  updateDate();
  window.setInterval(updateDate, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateDate();
  });
})();
