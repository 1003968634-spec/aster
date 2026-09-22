/* All three right-hand details share one physical rail on the letter. */
(() => {
  'use strict';
  const box=document.getElementById('gift-box');
  const stamp=box?.querySelector('.home-postage');
  const navigation=box?.querySelector('.star-navigation');
  const date=box?.querySelector('.footer-coordinates');
  if (!box || !stamp || !navigation || !date) return;
  navigation.querySelectorAll('.star-nav-line,.nav-end').forEach(element=>element.remove());
  const rail=document.createElement('aside');
  rail.className='letter-rail';
  rail.setAttribute('aria-label','Letter navigation');
  rail.append(stamp,navigation,date);
  const newConversation=box.querySelector('.postal-new-chat');
  if (newConversation) rail.append(newConversation);
  box.append(rail);
})();
