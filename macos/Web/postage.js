/* The same paper star carries the stamp in both directions, before either fold. */
(() => {
  'use strict';
  const root = document.documentElement;
  const paper = document.getElementById('desktop-paper');
  const envelope = document.getElementById('desktop-envelope');
  const source = document.querySelector('.envelope-stamp');
  const masthead = paper?.querySelector('.masthead');
  if (!source || !masthead || !envelope) return;

  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'home-postage';
  home.dataset.page = 'home';
  home.setAttribute('aria-label', 'Return to agent conversation');
  home.title = 'Back to conversation';
  home.innerHTML = source.innerHTML;
  home.querySelector('img').alt = '';
  masthead.append(home);

  // The courier stays with its letter. Its parked paper star is also the
  // existing front-end new-conversation action, rather than another label.
  const newChat = document.createElement('button');
  newChat.type = 'button';
  newChat.id = 'new-chat';
  newChat.className = 'postal-new-chat';
  newChat.setAttribute('aria-label', 'New conversation');
  newChat.title = 'New conversation';
  newChat.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#star"/></svg><span class="postal-star-label" aria-hidden="true">New conversation</span>';
  masthead.append(newChat);

  let active = null;
  const center = rect => ({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2});
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const point = (a, b, c, d, t) => {
    const u = 1 - t;
    return {
      x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
      y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y
    };
  };
  const box = element => ({
    ...center(element.getBoundingClientRect()), width: element.offsetWidth, height: element.offsetHeight
  });

  function paperBox(element) {
    // Measure a control at the sheet's final, flat position even while the
    // closed sheet is scaled down inside its envelope.
    const target = box(element);
    const style = getComputedStyle(paper);
    const origin = style.transformOrigin.split(' ').map(Number.parseFloat);
    const pivot = {x: paper.offsetLeft + origin[0], y: paper.offsetTop + origin[1]};
    const transform = style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
    const neutral = new DOMPoint(target.x - pivot.x, target.y - pivot.y).matrixTransform(transform.inverse());
    return {...target, x: neutral.x + pivot.x, y: neutral.y + pivot.y};
  }

  function destinationBox(returning) {
    if (returning) {
      // An invisible, empty measuring box avoids interrupting the live envelope's
      // transitions just to find its final sealed position.
      const probe = document.createElement('div');
      probe.className = 'desktop-envelope';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'visibility:hidden;pointer-events:none;transition:none;width:var(--envelope-width);height:var(--envelope-height);top:50%;transform:translate(-50%,-46%) rotate(-1.2deg)';
      const stamp = document.createElement('div');
      stamp.className = 'envelope-stamp';
      probe.append(stamp);
      document.body.append(probe);
      const target = box(stamp);
      probe.remove();
      return target;
    }
    // Undo the sheet's current transform instead of changing it to measure the
    // header. This also stays smooth when the window is resized mid-flight.
    return paperBox(home);
  }

  function stop() {
    if (!active) return;
    const operation = active;
    active = null;
    cancelAnimationFrame(operation.frame);
    operation.layer.remove();
    root.classList.remove('postage-in-transit');
    operation.resolve();
  }

  function fly({returning = false, reduced = false} = {}) {
    stop();
    const origin = returning ? home : source;
    const start = box(origin);
    let target = destinationBox(returning);
    let parked = paperBox(newChat);
    root.classList.remove('postage-delivered');
    if (reduced) {
      root.classList.toggle('postage-delivered', !returning);
      return Promise.resolve();
    }

    const seal = center(document.getElementById('envelope-seal').getBoundingClientRect());
    const layer = document.createElement('div');
    layer.className = `postage-flight${returning ? ' postage-flight-return' : ''}`;
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="flying-stamp${returning ? ' from-letter' : ''}">${origin.innerHTML}</div><svg class="postal-star" viewBox="0 0 48 48"><use href="#star"/></svg>`;
    document.body.append(layer);
    const stamp = layer.querySelector('.flying-stamp');
    const star = layer.querySelector('.postal-star');
    stamp.style.width = `${start.width}px`;
    stamp.style.height = `${start.height}px`;
    root.classList.add('postage-in-transit');

    const operation = {layer, frame: 0, resolve: () => {}};
    const done = new Promise(resolve => { operation.resolve = resolve; });
    active = operation;
    const began = performance.now();
    const duration = returning ? 1900 : 1780;
    const viewport = {width: innerWidth, height: innerHeight};
    const initialAngle = returning ? 5 : 4.8;
    const finalAngle = returning ? 4.8 : 5;
    const arrival = returning ? center(newChat.getBoundingClientRect()) : seal;
    const carryOffset = {x: -30, y: -30};

    function pose(at, scaleX, scaleY, angle, lift) {
      stamp.style.transform = `translate(${at.x - start.width/2}px,${at.y - start.height/2}px) rotate(${angle}deg) scale(${scaleX},${scaleY})`;
      stamp.style.filter = `drop-shadow(${mix(1, 4, lift)}px ${mix(2, 10, lift)}px ${mix(1, 6, lift)}px #493d2d50)`;
    }

    function frame(now) {
      if (active !== operation) return;
      const elapsed = Math.min(duration, now - began);
      if (viewport.width !== innerWidth || viewport.height !== innerHeight) {
        target = destinationBox(returning);
        parked = paperBox(newChat);
        viewport.width = innerWidth;
        viewport.height = innerHeight;
      }
      const pick = {x: start.x + carryOffset.x, y: start.y + carryOffset.y};
      let stampAt = start;
      let starAt;
      let scaleX = 1;
      let scaleY = 1;
      let angle = initialAngle;
      let lift = 0;
      let starOpacity = 1;
      let starAngle = 12;
      let starScaleX = 1;
      let starScaleY = 1;

      if (elapsed < 300) {
        const p = ease(elapsed / 300);
        starAt = point(arrival, {x: arrival.x - 35, y: arrival.y - 85}, {x: pick.x - 55, y: pick.y - 55}, pick, p);
        starOpacity = returning ? 1 : Math.min(1, p * 5);
        starAngle = mix(returning ? -5 : -32, 16, p);
        starScaleX = returning ? mix(parked.width / 57, 1, p) : mix(.72, 1, starOpacity);
        starScaleY = returning ? mix(parked.height / 65, 1, p) : starScaleX;
      } else if (elapsed < 520) {
        // Visible peel: the stamp lifts clear before the envelope moves at 500 ms.
        const p = ease((elapsed - 300) / 220);
        stampAt = {x: start.x - 14*p, y: start.y - 28*p};
        starAt = {x: stampAt.x + carryOffset.x, y: stampAt.y + carryOffset.y};
        angle = initialAngle - 9*p;
        lift = p;
        starAngle = 16 + 11*p;
      } else if (elapsed < duration - 180) {
        const p = ease((elapsed - 520) / (duration - 700));
        const lifted = {x: start.x - 14, y: start.y - 28};
        const crest = Math.max(40, Math.min(start.y, target.y) - (returning ? 76 : 98));
        stampAt = point(lifted, {x: lifted.x - 88, y: crest}, {x: target.x - 100, y: crest}, target, p);
        scaleX = mix(1, target.width / start.width, p);
        scaleY = mix(1, target.height / start.height, p);
        angle = mix(initialAngle - 9, finalAngle, p) - Math.sin(p * Math.PI) * 7;
        lift = 1 - Math.pow(p, 4);
        if (returning) {
          starAt = {x: stampAt.x + carryOffset.x*scaleX, y: stampAt.y + carryOffset.y*scaleY};
          starAngle = 27 + Math.sin(p * Math.PI) * 20;
        } else {
          // Land with the stamp at its upper-left corner. Resolve the courier's
          // final pose during the shared flight, with no separate swoop after
          // the stamp has already touched the letter.
          starAt = {
            x: stampAt.x + mix(carryOffset.x, parked.x - target.x, p),
            y: stampAt.y + mix(carryOffset.y, parked.y - target.y, p)
          };
          starAngle = mix(27, -5, p) + Math.sin(p * Math.PI) * 20;
          starScaleX = mix(1, parked.width / 57, p);
          starScaleY = mix(1, parked.height / 65, p);
        }
      } else {
        const p = ease((elapsed - duration + 180) / 180);
        stampAt = target;
        scaleX = target.width / start.width;
        scaleY = target.height / start.height;
        angle = finalAngle;
        const carried = {x: target.x + carryOffset.x*scaleX, y: target.y + carryOffset.y*scaleY};
        if (returning) {
          starAt = {x: carried.x - p*27, y: carried.y - p*36};
          starAngle = 27 - p*32;
          starOpacity = 1 - p;
          starScaleX = starScaleY = mix(.72, 1, starOpacity);
        } else {
          starAt = parked;
          starAngle = -5;
          starScaleX = parked.width / 57;
          starScaleY = parked.height / 65;
        }
      }
      pose(stampAt, scaleX, scaleY, angle, lift);
      star.style.transform = `translate(${starAt.x - 28.5}px,${starAt.y - 32.5}px) rotate(${starAngle}deg) scale(${starScaleX},${starScaleY})`;
      star.style.opacity = String(starOpacity);
      if (elapsed < duration) {
        operation.frame = requestAnimationFrame(frame);
        return;
      }
      root.classList.toggle('postage-delivered', !returning);
      stop();
    }
    // Paint the stamp in place immediately; the first RAF then reveals the star.
    pose(start, 1, 1, initialAngle, 0);
    if (returning) {
      // The flight replaces the parked SVG in the same paint. Starting here
      // avoids a disappearing frame when the user folds the letter.
      star.style.transform = `translate(${arrival.x - 28.5}px,${arrival.y - 32.5}px) rotate(-5deg) scale(${parked.width / 57},${parked.height / 65})`;
      star.style.opacity = '1';
    } else star.style.opacity = '0';
    operation.frame = requestAnimationFrame(frame);
    return done;
  }

  window.asterPostage = Object.freeze({
    deliver: options => fly({...options, returning: false}),
    returnToEnvelope: options => fly({...options, returning: true})
  });
})();
