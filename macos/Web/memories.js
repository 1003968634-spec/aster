/* Desktop memories are individual postcards, laid directly on the letter. */
(() => {
  const main = document.querySelector('#main');
  if (!main) return;
  let resizeObserver = null;
  let currentPage = null;

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function stamp() {
    const paper = node('span', 'postcard-stamp');
    paper.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#star');
    svg.append(use);
    paper.append(svg, node('span', '', 'ASTER POST'));
    return paper;
  }

  function upgradeMemories() {
    const page = main.querySelector('.history-page');
    main.classList.toggle('memories-open', !!page);
    if (currentPage !== page) {
      resizeObserver?.disconnect();
      resizeObserver = null;
      currentPage = page;
    }
    if (!page || page.dataset.postcardPile === 'ready' || typeof allMemories !== 'function') return;
    page.dataset.postcardPile = 'ready';
    page.setAttribute('aria-label', 'Memories');
    const stack = page.querySelector('.postcard-stack');
    if (!stack) return;
    page.querySelectorAll('.subpage-top,.subpage-heading,.history-note').forEach(element => element.remove());
    const layout = page.querySelector('.history-layout');
    const memories = allMemories();
    const fragment = document.createDocumentFragment();
    let hovered = null;
    let focused = null;
    const slots = [];
    const raise = () => {
      // Keyboard navigation takes precedence over a parked pointer. Mouse
      // focus may still yield to whichever postcard is being hovered.
      const keyboardFocused = focused !== null &&
        slots[focused]?.querySelector('.postcard')?.matches(':focus-visible');
      const active = keyboardFocused ? focused : hovered ?? focused;
      slots.forEach((slot, index) => slot.classList.toggle('is-raised', index === active));
    };
    stack.style.setProperty('--count', Math.max(1, memories.length));
    stack.setAttribute('aria-label', 'Conversation postcards, most recent first');

    memories.forEach((memory, index) => {
      const slot = node('div', 'postcard-slot');
      slot.style.setProperty('--i', index);
      slot.style.setProperty('--shift', `${[0, 12, -8, 8, -3][index % 5]}px`);
      const button = node('button', `postcard ${index === 0 ? 'latest' : 'tucked'}`);
      button.type = 'button';
      button.dataset.memory = memory.id;
      button.setAttribute('aria-label', `Open conversation: ${memory.title}, ${formatDate(memory.date)}`);

      const face = node('span', 'postcard-face');
      const address = node('span', 'postcard-address');
      address.append(node('span', 'postcard-index', index === 0 ? 'MOST RECENT' : 'A SAVED CONVERSATION'));
      const heading = node('span', 'postcard-title', memory.title);
      heading.title = memory.title;
      const meta = node('span', 'postcard-meta');
      meta.append(node('span', 'postcard-category', memory.category || 'YOUR CONVERSATION'));
      const date = node('time', 'postcard-date', formatDate(memory.date));
      date.dateTime = memory.date;
      meta.append(date);
      const content = node('span', 'postcard-content');
      content.append(node('span', 'postcard-excerpt', memory.excerpt || ''));
      const open = node('span', 'postcard-open', 'Pick up the thread');
      open.append(node('span', '', '↗'));
      content.append(open);
      address.append(heading, meta);
      face.append(node('span', 'postcard-inscription', 'POST CARD'), stamp(), content, address);
      button.append(face);
      slot.append(button);

      // The hit area stays still while the paper lifts. Moving the hit area
      // itself would drop hover along the exposed lower edge and cause flicker.
      slot.addEventListener('pointerenter', event => {
        if (event.pointerType === 'touch') return;
        hovered = index;
        raise();
      });
      slot.addEventListener('pointerleave', () => {
        if (hovered === index) hovered = null;
        raise();
      });
      slot.addEventListener('focusin', () => {
        focused = index;
        raise();
        // WebKit can finish updating :focus-visible after focusin dispatch.
        queueMicrotask(raise);
      });
      slot.addEventListener('focusout', event => {
        if (slot.contains(event.relatedTarget)) return;
        if (focused === index) focused = null;
        raise();
      });
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(slots.length - 1, index + 1);
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, index - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = slots.length - 1;
        else return;
        event.preventDefault();
        slots[next]?.querySelector('.postcard').focus({preventScroll: true});
      });
      slots.push(slot);
      fragment.append(slot);
    });
    if (!memories.length) fragment.append(node('p', 'postcard-empty', 'Your conversations will be kept here.'));
    stack.replaceChildren(fragment);

    function fitPile() {
      if (!page.isConnected) return;
      // Leave room for the paper's lift and shadow. All cards share this fixed
      // canvas; adding a memory tightens the pile instead of growing the page.
      const available = Math.max(1, layout.clientHeight - 42);
      const height = Math.min(278, available, Math.max(190, available * .64));
      const step = memories.length > 1 ? Math.min(72, (available - height) / (memories.length - 1)) : 0;
      const pileHeight = height + Math.max(0, memories.length - 1) * step;
      stack.style.setProperty('--postcard-height', `${height}px`);
      stack.style.setProperty('--pile-height', `${pileHeight}px`);
      stack.classList.toggle('is-compact', height < 255);
      stack.classList.toggle('is-small', height < 215);
      const angleScale = memories.length > 1 ? Math.min(1, step * .35 / Math.max(1, stack.clientWidth) * 180 / Math.PI / 1.7) : 1;
      slots.forEach((slot, index) => {
        // Fixed, nonoverlapping hit strips remain available even when another
        // card's full visual face is lifted over them.
        slot.style.setProperty('--slot-top', `${index === 0 ? 0 : height + (index - 1) * step}px`);
        slot.style.setProperty('--hit-height', `${index === 0 ? height : step}px`);
        slot.style.setProperty('--face-top', `${index === 0 ? 0 : step - height}px`);
        slot.style.setProperty('--angle', `${[-1.4, 1.7, -1, 1.1, -.6][index % 5] * angleScale}deg`);
      });
    }
    resizeObserver = new ResizeObserver(fitPile);
    resizeObserver.observe(layout);
    fitPile();
  }

  // renderPage replaces main's direct child on navigation; our own upgrades
  // only touch descendants, so they do not recursively trigger this observer.
  new MutationObserver(upgradeMemories).observe(main, {childList: true});
  upgradeMemories();
})();
