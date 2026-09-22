/* Desktop memories are individual postcards, laid directly on the letter. */
(() => {
  const main = document.querySelector('#main');
  if (!main) return;

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
    if (!page || page.dataset.postcardPile === 'ready' || typeof allMemories !== 'function') return;
    page.dataset.postcardPile = 'ready';
    const stack = page.querySelector('.postcard-stack');
    if (!stack) return;
    page.querySelector('.history-note')?.remove();
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
      slot.style.setProperty('--angle', `${[-1.4, 1.7, -1, 1.1, -.6][index % 5]}deg`);
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
      slots.push(slot);
      fragment.append(slot);
    });
    if (!memories.length) fragment.append(node('p', 'postcard-empty', 'Your conversations will be kept here.'));
    stack.replaceChildren(fragment);
  }

  // renderPage replaces main's direct child on navigation; our own upgrades
  // only touch descendants, so they do not recursively trigger this observer.
  new MutationObserver(upgradeMemories).observe(main, {childList: true});
  upgradeMemories();
})();
