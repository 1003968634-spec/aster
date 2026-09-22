/* A four-point paper star lifts the envelope's stamp and delivers it to the header. */
(() => {
  'use strict';
  const root = document.documentElement;
  const paper = document.getElementById('desktop-paper');
  const source = document.querySelector('.envelope-stamp');
  const masthead = paper?.querySelector('.masthead');
  if (!source || !masthead) return;

  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'home-postage';
  home.dataset.page = 'home';
  home.setAttribute('aria-label', 'Return to agent conversation');
  home.title = 'Back to conversation';
  home.innerHTML = source.innerHTML;
  // The button supplies the accessible name; the original logo remains untouched.
  home.querySelector('img').alt = '';
  masthead.append(home);

  let active = null;
  const rectCenter = rect => ({x:rect.left + rect.width / 2, y:rect.top + rect.height / 2});
  const mix = (a,b,t) => a + (b-a)*t;
  const ease = t => t*t*(3-2*t);
  const point = (a,b,c,d,t) => {
    const u=1-t;
    return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
      y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
  };

  function landingRect() {
    // Measure layout before the sheet scales into view; never paint this override.
    const previousTransform=paper.style.transform, previousTransition=paper.style.transition;
    paper.style.transition='none';
    paper.style.transform='none';
    const rect=home.getBoundingClientRect();
    paper.style.transform=previousTransform;
    paper.style.transition=previousTransition;
    return rect;
  }

  function stop() {
    if (!active) return;
    cancelAnimationFrame(active.frame);
    active.layer.remove();
    active.resolve();
    active=null;
  }

  function deliver({reduced=false}={}) {
    stop();
    root.classList.remove('postage-delivered');
    if (reduced) {root.classList.add('postage-delivered');return Promise.resolve();}

    const startRect=source.getBoundingClientRect();
    const start=rectCenter(startRect);
    const seal=rectCenter(document.getElementById('envelope-seal').getBoundingClientRect());
    let destination=landingRect();
    const layer=document.createElement('div');
    layer.className='postage-flight';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML=`<div class="flying-stamp">${source.innerHTML}</div><svg class="postal-star" viewBox="0 0 48 48"><use href="#star"/></svg>`;
    document.body.append(layer);
    const stamp=layer.querySelector('.flying-stamp'), star=layer.querySelector('.postal-star');
    stamp.style.width=`${source.offsetWidth}px`;
    stamp.style.height=`${source.offsetHeight}px`;
    const width=source.offsetWidth,height=source.offsetHeight;
    stamp.style.transform=`translate(${start.x-width/2}px,${start.y-height/2}px) rotate(6deg)`;
    const operation={layer,frame:0,resolve:()=>{}};
    const done=new Promise(resolve=>operation.resolve=resolve);
    active=operation;
    const began=performance.now(), duration=1420;
    const viewport={width:innerWidth,height:innerHeight};

    function frame(now) {
      if (active!==operation) return;
      const t=Math.min(1,(now-began)/duration);
      if (viewport.width!==innerWidth || viewport.height!==innerHeight) {
        destination=landingRect();viewport.width=innerWidth;viewport.height=innerHeight;
      }
      const end=rectCenter(destination);
      if (t<.24) {
        const p=ease(t/.24);
        const at=point(seal,{x:seal.x+65,y:seal.y-150},{x:start.x-65,y:start.y-70},
          {x:start.x-34,y:start.y-29},p);
        star.style.transform=`translate(${at.x-28}px,${at.y-32}px) rotate(${mix(-35,18,p)}deg) scale(${mix(.35,1,p)})`;
        star.style.opacity=String(Math.min(1,p*4));
      } else {
        const p=ease((t-.24)/.76);
        const crest=Math.max(48,Math.min(start.y,end.y)-110);
        const at=point(start,{x:start.x-85,y:crest},{x:end.x-125,y:crest},end,p);
        const scale=mix(1,destination.width/startRect.width,p);
        const angle=mix(6,5,p)-Math.sin(p*Math.PI)*11;
        stamp.style.transform=`translate(${at.x-width/2}px,${at.y-height/2}px) rotate(${angle}deg) scale(${scale})`;
        const separation=34*scale;
        star.style.transform=`translate(${at.x-separation-28}px,${at.y-separation-32}px) rotate(${18+Math.sin(p*Math.PI)*26}deg) scale(${mix(1,.8,p)})`;
        star.style.opacity=String(p<.83?1:Math.max(0,(1-p)/.17));
      }
      if (t<1) {operation.frame=requestAnimationFrame(frame);return;}
      root.classList.add('postage-delivered');
      stop();
    }
    operation.frame=requestAnimationFrame(frame);
    return done;
  }

  function returnToEnvelope() {
    stop();
    root.classList.remove('postage-delivered');
  }

  window.asterPostage=Object.freeze({deliver,returnToEnvelope});
})();
