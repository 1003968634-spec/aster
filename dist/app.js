'use strict';
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const icon = (name, cls='icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultData={profile:{name:'Sandman',email:'sandman@example.com',intention:'Make space for good ideas.',avatar:'✧'},settings:{motion:true,sounds:false,enterSend:true,theme:'paper'},plugins:['research','writing'],rituals:[{id:'morning',title:'A softer start',prompt:'Gather my priorities and help me plan a thoughtful day.',time:'08:30',frequency:'Weekdays',enabled:true},{id:'inspiration',title:'A little dose of wonder',prompt:'Find a creative prompt to inspire my next project.',time:'17:00',frequency:'Every day',enabled:false}],conversations:[]};
let data;try{data={...structuredClone(defaultData),...JSON.parse(localStorage.getItem('aster-demo-v1')||'null')};}catch{data=structuredClone(defaultData);}
let page='home',transitioning=false,currentChat=null,messages=[],pendingReply=false,attachment=null,pluginFilter='All';
const backend=window.AsterBackend;
const backendEnabled=Boolean(backend?.enabled);
document.documentElement.classList.toggle('backend-mode',backendEnabled);
const backendState={status:'connecting',sessions:[],archivedSessions:[],pinnedSessionIds:[],archivedSessionIds:[],historyView:'active',historyQuery:'',historyResults:null,historyVisible:8,historyRequest:0,contentSearchAvailable:true,pluginData:null,pluginTab:'plugins',pluginSearch:'',pluginCategory:'all',pluginScope:'host',pluginState:'all',pluginPage:0,pluginFavoritesOnly:false,pluginLoading:false,pluginError:'',expandedBundles:new Set(),pluginFeedback:new Map(),pluginPending:new Set(),pluginRequest:0,pluginInstall:null,scheduleData:null,scheduleRequest:0,providerData:null,providerRequest:0,providerShowAll:false,models:[],selectedModel:null,workspaces:[],selectedWorkspaceId:null,permissionPresets:[],selectedPermissionPresetId:null,sessionStatus:'idle',sending:false,sessionLoading:false,turnStarted:false,turnFinished:false,tools:new Map(),messageNodes:new Map(),interactions:[]};
let streamFrame=0;
let backendSubscribed=false;
let historySearchTimer=0;
const streamUpdates=new Map();
let disposeSendOrbit=()=>{};
const homeMarkup=$('#main').innerHTML;
const pluginLibrary=[
 {id:'research',name:'The Seeker',type:'Skill',number:'I',symbol:'☉',subtitle:'Follow your curiosity.',description:'Turn a question into a thoughtful research journey. Explore ideas, compare perspectives, and collect the threads that matter.',abilities:['Explore a topic','Compare perspectives','Gather a reading list'],tag:'RESEARCH & DISCOVERY'},
 {id:'writing',name:'The Scribe',type:'Skill',number:'II',symbol:'✧',subtitle:'Give your thoughts a voice.',description:'A writing companion for the blank page. Shape a first draft, refine your voice, or find the words you have been looking for.',abilities:['Shape a first draft','Refine your voice','Write across languages'],tag:'WORDS & STORIES'},
 {id:'notion',name:'The Archivist',type:'Connector',number:'III',symbol:'◈',subtitle:'A home for every little idea.',description:'Bring your notes, knowledge, and project pages into your conversations. Keep the ideas you love within reach.',abilities:['Find saved notes','Explore project pages','Organize your knowledge'],tag:'NOTION CONNECTION'},
 {id:'browser',name:'The Navigator',type:'MCP',number:'IV',symbol:'⊹',subtitle:'Beyond the familiar horizon.',description:'A bridge between your agent and the web. Give your curiosity a wider world to wander through.',abilities:['Explore web pages','Read structured content','Navigate with context'],tag:'BROWSER TOOLS'},
 {id:'mail',name:'The Messenger',type:'Connector',number:'V',symbol:'✴',subtitle:'Make room for meaningful words.',description:'Find the conversations that matter and shape thoughtful replies with an email companion.',abilities:['Find conversations','Summarize long threads','Prepare a reply'],tag:'EMAIL CONNECTION'},
 {id:'creative',name:'The Alchemist',type:'Skill',number:'VI',symbol:'☽',subtitle:'Ordinary things. New possibilities.',description:'An unexpected angle, a new direction, a spark of something different. A creative companion for ideas still finding their shape.',abilities:['Generate creative prompts','Explore new directions','Build a concept'],tag:'CREATIVE THINKING'}
];
const seedMemories=[
 {id:'seed-1',title:'A small universe of ideas',date:'2026-09-20T10:20:00',category:'CREATIVE WANDERING',excerpt:'We followed a loose thread of an idea, and found a whole constellation. A journal, a quiet ritual, a place to begin.',messages:[{role:'user',text:'I want to build a small daily creative ritual.'},{role:'assistant',text:'Start with a page and five quiet minutes. Collect one thing you noticed, ask one unexpected question, and sketch one possibility. Your ritual can be small enough to keep and open enough to surprise you.'}]},
 {id:'seed-2',title:'The art of starting slowly',date:'2026-09-18T08:45:00',category:'EVERYDAY RITUALS',excerpt:'Making a gentle beginning.',messages:[{role:'user',text:'How can I make my mornings feel less rushed?'},{role:'assistant',text:'Choose just one small anchor: a glass of water by the window, three lines in a notebook, or a short walk. Leave a little space around it. A gentle routine grows from something you enjoy returning to.'}]},
 {id:'seed-3',title:'Somewhere between a dream & a plan',date:'2026-09-16T15:30:00',category:'NOTES & POSSIBILITIES',excerpt:'Giving a new idea somewhere to land.',messages:[{role:'user',text:'I have an idea for a personal zine, but no plan.'},{role:'assistant',text:'Let the first issue be just eight pages. Choose one feeling, collect three observations, and give each page one job. Fold a sheet of paper into a rough version before you think about polishing it.'}]},
 {id:'seed-4',title:'Little things worth keeping',date:'2026-09-12T18:10:00',category:'COLLECTED THOUGHTS',excerpt:'A place for everyday wonder.',messages:[{role:'user',text:'Help me notice more of the everyday.'},{role:'assistant',text:'Try keeping a tiny field guide to your own life. Each evening, write down one color, one sound, and one sentence you want to remember. Small observations become their own kind of map.'}]}
];
function save(){try{localStorage.setItem('aster-demo-v1',JSON.stringify(data));}catch{toast('Your browser could not save this change. It will last for this visit.');}}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('visible'),3600);}
function formatDate(value){if(!value)return 'Recently';const date=new Date(value);return Number.isNaN(date.valueOf())?'Recently':date.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});}
function allMemories(){if(backendEnabled)return backendState.sessions.map((session,index)=>({id:String(session.id??session.sessionId??index),title:session.title||session.name||'A new conversation',date:session.updatedAt||session.createdAt||new Date().toISOString(),category:'DSH CONVERSATION',excerpt:session.preview||session.lastMessage||'Pick up the thread.',messages:Array.isArray(session.messages)?session.messages:[]})).sort((a,b)=>new Date(b.date)-new Date(a.date));return [...data.conversations,...seedMemories].sort((a,b)=>new Date(b.date)-new Date(a.date));}
function applyPreferences(){document.documentElement.dataset.theme=data.settings.theme;document.documentElement.classList.toggle('reduce-motion',!data.settings.motion);}
function pageHeader(kicker,title,note,action=''){return `<div class="subpage-top"><button class="back-link" data-page="home">${icon('arrow')} Back to your thoughts</button><span class="chapter-label">${kicker}</span></div><div class="subpage-heading"><div><h1>${title}</h1><p>${note}</p></div>${action}</div>`;}
function navigate(next,{replace=false}={}){if(next==='schedule')next='dashboard';if(transitioning||!['home','history','plugins','dashboard','settings','profile'].includes(next))return;if(next===page)return;transitioning=true;const transition=$('#page-transition');transition.classList.add('running');const reduced=!data.settings.motion||matchMedia('(prefers-reduced-motion: reduce)').matches;setTimeout(()=>{page=next;if(!replace)history.pushState({page},'',next==='home'?'#home':`#${next}`);renderPage();$('#main').scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});},reduced?0:370);setTimeout(()=>{transition.classList.remove('running');transitioning=false;},reduced?20:960);}
function syncGreeting(){$('#greeting-name').textContent=data.profile.name;$('.header-greeting').setAttribute('aria-label',`Hello, ${data.profile.name}. Manage your profile`);}
function renderPage(){disposeSendOrbit();syncGreeting();const main=$('#main');main.scrollTop=0;if(page==='home'){main.innerHTML=homeMarkup;initHome();}else if(page==='history')renderHistory();else if(page==='plugins')renderPlugins();else if(page==='dashboard')window.asterRituals?.dashboard();else if(page==='settings')renderSettings();else renderProfile();$$('.nav-star').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);if(el.dataset.page===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});}
function initHome(){window.asterRituals?.render(true);disposeSendOrbit=mountSendOrbit($('.send-button'));$('#chat-form').addEventListener('submit',e=>{e.preventDefault();sendMessage();});$('#message-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&data.settings.enterSend&&!e.isComposing){e.preventDefault();sendMessage();}});$('#message-input').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,100)+'px';});if(backendEnabled)$('#file-input').removeAttribute('accept');$('#file-input').addEventListener('change',readAttachment);renderMessages();if(backendEnabled){renderBackendStatus();renderBackendModels();renderBackendWorkspaces();renderBackendTools();renderBackendSessionActions();}}
// Two satellite layers share one trajectory; the solid center star occludes the far layer.
function getSendOrbitFrame(phase){
 const tilt=-25*Math.PI/180;
 const longAxis=28*Math.cos(phase), shortAxis=8*Math.sin(phase);
 return {
  x:38+longAxis*Math.cos(tilt)-shortAxis*Math.sin(tilt),
  y:31+longAxis*Math.sin(tilt)+shortAxis*Math.cos(tilt),
  scale:1+.14*Math.sin(phase),
  front:Math.sin(phase)>=0
 };
}
function mountSendOrbit(button){
 const back=$('.send-satellite-back',button),front=$('.send-satellite-front',button);
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let frame=0,lastTime=0,phase=-.2,hovered=false,disposed=false;
 const paint=()=>{
  const point=getSendOrbitFrame(phase);
  const transform=`translate(${point.x.toFixed(3)} ${point.y.toFixed(3)}) scale(${point.scale.toFixed(3)})`;
  back.setAttribute('transform',transform);front.setAttribute('transform',transform);
  back.setAttribute('opacity',point.front?'0':'1');front.setAttribute('opacity',point.front?'1':'0');
 };
 const wantsMotion=()=>!disposed&&!button.disabled&&!reducedMotion.matches&&data.settings.motion&&(hovered||button.matches(':focus-visible'));
 const stop=()=>{cancelAnimationFrame(frame);frame=0;lastTime=0;};
 const tick=time=>{
  frame=0;
  if(!button.isConnected||!wantsMotion()){lastTime=0;return;}
  if(lastTime)phase=(phase+Math.min(time-lastTime,50)*Math.PI*2/2400)%(Math.PI*2);
  lastTime=time;paint();frame=requestAnimationFrame(tick);
 };
 const sync=()=>{if(wantsMotion()){if(!frame)frame=requestAnimationFrame(tick);}else stop();};
 const enter=()=>{hovered=true;sync();};
 const leave=()=>{hovered=false;sync();};
 button.addEventListener('pointerenter',enter);button.addEventListener('pointerleave',leave);
 button.addEventListener('focus',sync);button.addEventListener('blur',sync);
 button.addEventListener('aster:send-state',sync);
 reducedMotion.addEventListener('change',sync);paint();
 return ()=>{
  disposed=true;stop();
  button.removeEventListener('pointerenter',enter);button.removeEventListener('pointerleave',leave);
  button.removeEventListener('focus',sync);button.removeEventListener('blur',sync);
  button.removeEventListener('aster:send-state',sync);
  reducedMotion.removeEventListener('change',sync);
 };
}
function renderMessages(){if(page!=='home')return;if(backendEnabled){renderBackendMessages(true);return;}const paper=$('.conversation-paper');paper.classList.toggle('has-messages',messages.length>0||pendingReply);$('#messages').innerHTML=messages.map(m=>`<div class="message ${m.role}"><div class="message-label">${m.role==='user'?escapeHTML(data.profile.name).toUpperCase():'✧ ASTER'}</div><p>${escapeHTML(m.text)}</p></div>`).join('')+(pendingReply?'<div class="message typing"><div class="message-label">✧ ASTER</div><p aria-label="Aster is composing">···</p></div>':'');$('#messages').scrollTop=$('#messages').scrollHeight;const sendButton=$('.send-button');sendButton.disabled=pendingReply;sendButton.dispatchEvent(new Event('aster:send-state'));$('#attachment-label').textContent=attachment?attachment.name:'';}
function backendMessageId(message,index){return String(message.id??message.messageId??`message-${index}`);}
function backendMessageRole(message){return message.role==='user'?'user':message.role==='tool'?'tool':'assistant';}
function trimBackendMessages(){while(messages.length>60){const oldest=messages.shift();const id=String(oldest?.id??'');backendState.messageNodes.get(id)?.remove();backendState.messageNodes.delete(id);}}
function makeBackendMessage(message,index){const id=backendMessageId(message,index),role=backendMessageRole(message);const node=document.createElement('div');node.className=`message ${role}`;node.dataset.messageId=id;const label=document.createElement('div');label.className='message-label';label.textContent=role==='user'?data.profile.name.toUpperCase():role==='tool'?'✧ TOOL':'✧ DSH';const body=document.createElement('p');body.textContent=String(message.text??'');node.append(label,body);backendState.messageNodes.set(id,node);return node;}
function paintBackendMessage(message,index){if(page!=='home')return;const list=$('#messages');if(!list)return;const id=backendMessageId(message,index);let node=backendState.messageNodes.get(id);if(!node||!node.isConnected){node=makeBackendMessage(message,index);list.append(node);}else{const body=node.querySelector('p');const text=String(message.text??'');if(body.textContent!==text)body.textContent=text;}list.scrollTop=list.scrollHeight;$('.conversation-paper')?.classList.add('has-messages');}
function renderBackendMessages(reset=false){if(page!=='home')return;const list=$('#messages');if(!list)return;if(reset){backendState.messageNodes.clear();const fragment=document.createDocumentFragment();messages.forEach((message,index)=>fragment.append(makeBackendMessage(message,index)));list.replaceChildren(fragment);}syncBackendPending();$('.conversation-paper').classList.toggle('has-messages',messages.length>0||pendingReply);list.scrollTop=list.scrollHeight;$('#attachment-label').textContent=Array.isArray(attachment)?attachment.map(file=>file.name).join(', '):attachment?.name||'';updateBackendControls();}
function syncBackendPending(){if(page!=='home')return;const list=$('#messages');let indicator=$('#backend-pending');if(pendingReply&&!messages.some(message=>message.role==='assistant'&&message.streaming)){if(!indicator){indicator=document.createElement('div');indicator.id='backend-pending';indicator.className='message typing';indicator.innerHTML='<div class="message-label">✧ DSH</div><p aria-label="Agent is working">···</p>';list.append(indicator);}}else indicator?.remove();}
function updateBackendControls(){if(page!=='home')return;const connected=backendState.status==='connected';const send=$('.send-button');send.disabled=!connected||pendingReply;send.dispatchEvent(new Event('aster:send-state'));const stop=$('#stop-button');if(stop){stop.hidden=!pendingReply;stop.disabled=!pendingReply;}const input=$('#message-input');input.placeholder=connected?'Let your thoughts wander…':'Waiting for DSH to connect…';renderBackendSessionActions();}
function renderBackendStatus(){if(page!=='home')return;const status=$('#connection-status');if(!status)return;const labels={connected:'Connected to DSH',connecting:'Connecting to DSH…',disconnected:'DSH disconnected',error:'DSH unavailable'};status.textContent=labels[backendState.status]||String(backendState.status);status.dataset.state=backendState.status;const retry=$('#reconnect-button');if(retry)retry.hidden=!['disconnected','error'].includes(backendState.status);const demo=$('.demo-label');if(demo)demo.textContent='DSH DESKTOP';updateBackendControls();}
function modelId(model){return String(typeof model==='string'?model:model?.id??model?.modelId??model?.value??model?.name??'');}
function renderBackendModels(){if(page!=='home')return;const select=$('#model-select');if(!select)return;const models=backendState.models;const selected=modelId(backendState.selectedModel);select.replaceChildren();if(!models.length){select.add(new Option('Model unavailable',''));select.disabled=true;return;}for(const model of models){const id=modelId(model);if(!id)continue;select.add(new Option(typeof model==='string'?model:String(model.name??model.label??model.displayName??id),id));}select.disabled=!backendState.status||backendState.status!=='connected';if([...select.options].some(option=>option.value===selected))select.value=selected;else if(select.options.length)backendState.selectedModel=select.value;}
function renderBackendWorkspaces(){if(page!=='home')return;const select=$('#workspace-select');if(!select)return;select.replaceChildren();if(!backendState.workspaces.length){select.add(new Option('No workspace',''));select.disabled=true;return;}for(const workspace of backendState.workspaces){const id=String(workspace.id??workspace.workspaceId??workspace.path??'');if(id)select.add(new Option(String(workspace.name??workspace.path?.split('/').pop()??id),id));}select.disabled=backendState.status!=='connected';const selected=String(backendState.selectedWorkspaceId??'');if([...select.options].some(option=>option.value===selected))select.value=selected;}
function activeBackendSession(){return backendState.sessions.find(item=>String(item.id??item.sessionId)===currentChat)||backendState.archivedSessions.find(item=>String(item.id??item.sessionId)===currentChat);}
function renderBackendSessionActions(){if(page!=='home')return;const row=$('#session-action-row');if(!row)return;row.hidden=!currentChat;const command=$('#command-button');if(command)command.disabled=!currentChat||backendState.status!=='connected';if(!currentChat)return;const session=activeBackendSession();const pinned=Boolean(session?.pinned||backendState.pinnedSessionIds.includes(currentChat));const archived=Boolean(session?.archived||backendState.archivedSessionIds.includes(currentChat));$('#session-action-title').textContent=session?.title||'A new conversation';const pin=$('#pin-session');pin.textContent=pinned?'Unpin':'Pin';pin.disabled=archived||pendingReply||backendState.status!=='connected';const archive=$('#archive-session');archive.textContent=archived?'Unarchive':'Archive';archive.disabled=pendingReply||backendState.status!=='connected';$('#rename-session').disabled=pendingReply||backendState.status!=='connected';$('#fork-session').disabled=archived||pendingReply||backendState.status!=='connected';if(command)command.disabled=archived||backendState.status!=='connected';}
function renderBackendTools(){if(page!=='home')return;const list=$('#activity-list');if(!list)return;list.replaceChildren();for(const tool of backendState.tools.values()){const row=document.createElement('div');row.className='activity-row';const symbol=document.createElement('span');symbol.className='activity-symbol';symbol.textContent=tool.status==='completed'?'✓':tool.status==='failed'?'!':'✧';const text=document.createElement('span');text.textContent=`${tool.name||'Tool'} · ${tool.status||'running'}${tool.detail?` · ${typeof tool.detail==='string'?tool.detail:JSON.stringify(tool.detail)}`:''}`;row.append(symbol,text);list.append(row);}list.hidden=!backendState.tools.size;}
function updateBackendContext(snapshot){for(const key of ['workspaces','selectedWorkspaceId','permissionPresets','selectedPermissionPresetId','pinnedSessionIds','archivedSessionIds'])if(Object.hasOwn(snapshot,key))backendState[key]=snapshot[key];const context={workspaces:backendState.workspaces,selectedWorkspaceId:backendState.selectedWorkspaceId,permissionPresets:backendState.permissionPresets,selectedPermissionPresetId:backendState.selectedPermissionPresetId};window.asterBackendContext=context;window.dispatchEvent(new CustomEvent('aster-backend-context',{detail:context}));renderBackendWorkspaces();renderBackendSessionActions();}
function backendMessageEvent(event,complete=false){if(event.sessionId&&currentChat&&event.sessionId!==currentChat)return;const incoming=event.message||event;const id=String(incoming.id??event.id??`message-${messages.length}`);let message=messages.find(item=>String(item.id)===id);if(!message){message={id,role:incoming.role||'assistant',text:''};messages.push(message);}message.text=String(incoming.text??event.text??message.text);message.streaming=!complete&&incoming.streaming===true;if(complete)message.streaming=false;trimBackendMessages();if(page==='home'){paintBackendMessage(message,messages.indexOf(message));syncBackendPending();updateBackendControls();}}
function flushStreamUpdates(){streamFrame=0;for(const event of streamUpdates.values())backendMessageEvent(event);streamUpdates.clear();}
function applyBackendSession(session){if(!session)return;const id=session.sessionId??session.id;if(id&&currentChat&&String(id)!==String(currentChat))return;if(id)currentChat=String(id);if(Array.isArray(session.messages)){messages=session.messages.slice(-60).map((message,index)=>({id:backendMessageId(message,index),role:backendMessageRole(message),text:String(message.text??'')}));backendState.tools.clear();renderBackendMessages(true);renderBackendTools();}backendState.sessionStatus=session.status??backendState.sessionStatus;if(['running','busy','streaming'].includes(String(session.status)))backendState.turnStarted=true;if(session.status==='idle'&&backendState.turnStarted)backendState.turnFinished=true;pendingReply=backendState.sending||(['running','busy','streaming','pending'].includes(String(backendState.sessionStatus))&&!backendState.turnFinished);if(page==='home'){syncBackendPending();updateBackendControls();renderBackendModels();}}
function cancelBackendInteraction(requestId){const active=backendState.interactions[0]?.requestId===requestId;backendState.interactions=backendState.interactions.filter(item=>item.requestId!==requestId);if(active&&$('#detail-dialog').open)closeDialog();if(active)showNextBackendInteraction();}
function handleBackendEvent(event){if(!event||!backendEnabled)return;switch(event.type){case 'connection':backendState.status=event.status||'disconnected';renderBackendStatus();window.asterRituals?.render(event.status==='connected');if(page==='plugins')renderBackendPlugins(event.status==='connected');window.AsterPluginUI?.syncDetail();break;case 'session':applyBackendSession(event);window.asterRituals?.sessionChanged();break;case 'message':backendMessageEvent(event);break;case 'message-delta':if(event.sessionId&&currentChat&&event.sessionId!==currentChat)break;streamUpdates.set(String(event.id),event);if(!streamFrame)streamFrame=requestAnimationFrame(flushStreamUpdates);break;case 'message-complete':if(streamUpdates.has(String(event.id)))streamUpdates.delete(String(event.id));backendMessageEvent(event,true);break;case 'tool':if(event.sessionId&&currentChat&&event.sessionId!==currentChat)break;backendState.tools.set(String(event.id??event.name??Date.now()),event);while(backendState.tools.size>8)backendState.tools.delete(backendState.tools.keys().next().value);renderBackendTools();break;case 'approval':case 'questions':backendState.interactions.push(event);showNextBackendInteraction();break;case 'interaction-cancelled':cancelBackendInteraction(event.requestId);break;case 'plugins-changed':if(page==='plugins'&&!backendState.pluginPending.size)renderBackendPlugins(true);break;case 'plugin-install-state':case 'plugin-install-log':updateBackendInstallEvent(event);break;case 'schedules-changed':if(!event.sessionId||event.sessionId===currentChat)window.asterRituals?.invalidate();break;case 'context':if(Array.isArray(event.models))backendState.models=event.models;if(Object.hasOwn(event,'selectedModel'))backendState.selectedModel=event.selectedModel;updateBackendContext(event);renderBackendModels();break;case 'error':toast(event.message||'DSH reported an error.');break;}}
async function initializeBackend(){try{backendState.status='connecting';renderBackendStatus();if(!backendSubscribed){backend.subscribe(handleBackendEvent);backendSubscribed=true;}const snapshot=await backend.initialize();backendState.status=snapshot.status||'connected';backendState.sessions=Array.isArray(snapshot.sessions)?snapshot.sessions:[];backendState.models=Array.isArray(snapshot.models)?snapshot.models:[];backendState.selectedModel=snapshot.selectedModel??null;currentChat=snapshot.currentSessionId?String(snapshot.currentSessionId):null;messages=Array.isArray(snapshot.messages)?snapshot.messages.slice(-60).map((message,index)=>({id:backendMessageId(message,index),role:backendMessageRole(message),text:String(message.text??'')})):[];updateBackendContext(snapshot);renderPage();}catch(error){backendState.status='error';renderBackendStatus();toast(`Could not connect to DSH: ${error?.message||error}`);}}
function generateReply(text){const clean=text.toLowerCase();if(/[\u4e00-\u9fff]/.test(text))return '让我们给这个想法留一点空间。\n\n你可以先写下最想实现的一件事，再把它拆成今天就能开始的小步骤。一个问题、一页草稿、五分钟的尝试，都可以成为起点。\n\n你希望先从灵感、计划，还是整理思路开始？\n\n（这是本地演示回复，尚未连接真实 AI 服务。）';if(/[\u3040-\u30ff]/.test(text))return 'そのアイデアを、小さな一歩から育ててみましょう。まず、今日できることをひとつ書き出してみてください。\n\nこれはローカルデモのサンプル応答です。AI サービスには接続していません。';if(/\b(hola|español|gracias|ayuda)\b/.test(clean))return 'Demos un poco de espacio a esa idea. Empieza con una pregunta, una página en blanco y un pequeño paso que puedas dar hoy. ¿Qué te gustaría explorar primero?\n\nEsta es una respuesta de muestra del demo local; no hay un servicio de IA conectado.';if(/\b(bonjour|français|merci)\b/.test(clean))return 'Laissons un peu de place à cette idée. Une question, une page blanche et un petit pas suffisent pour commencer. Que souhaitez-vous explorer ?\n\nCeci est une réponse de démonstration locale, sans service IA connecté.';const suffix='\n\nA little note: this is a sample conversation in the local demo. A live AI service can be connected later.';if(/creative|unexpected|dream|idea|inspir/.test(clean))return 'Here’s a little spark: make a field guide to things that don’t have one.\n\nThe sounds of your neighborhood. The colors of a particular Tuesday. The unfinished ideas in your notebook. Choose one, collect five small observations, and turn them into a tiny zine or a visual story.\n\nWhat are you feeling curious about today?'+suffix;if(/plan|day|morning|schedule/.test(clean))return 'Let’s give your day a little room to breathe.\n\n1. Choose one thing that would make today feel meaningful.\n2. Give it a small, uninterrupted pocket of time.\n3. Leave space for a walk, a surprise, or doing nothing at all.\n\nWhat is the one thing you’d like to make room for?'+suffix;if(/tangled|untangle|clear|thought/.test(clean))return 'Put the whole tangle on the page. It doesn’t need to make sense yet.\n\nThen we can look for three threads: what you know, what you’re wondering, and what you can try next. Often, a thought only needs a little space to become a direction.\n\nWhat has been on your mind?'+suffix;return 'A thought worth sitting with. Let’s explore it a little.\n\nWhat would you like to come away with: a fresh perspective, a first draft, or a small next step? We can start wherever feels right.'+suffix;}
function persistChat(){if(backendEnabled||!currentChat||!messages.length)return;const entry={id:currentChat,title:messages.find(m=>m.role==='user')?.text.slice(0,68)||'A new thought',date:new Date().toISOString(),category:'YOUR CONVERSATION',excerpt:messages.filter(m=>m.role==='assistant').at(-1)?.text.slice(0,170)||'A new conversation is beginning.',messages:structuredClone(messages)};data.conversations=data.conversations.filter(c=>c.id!==currentChat);data.conversations.unshift(entry);save();}
async function sendBackendMessage(text,attached){if(backendState.status!=='connected'){toast('Connect to DSH before sending.');return;}const input=$('#message-input');backendState.sending=true;backendState.turnStarted=false;backendState.turnFinished=false;backendState.sessionStatus='pending';pendingReply=true;updateBackendControls();try{if(!currentChat){const created=await backend.createSession({workspaceId:backendState.selectedWorkspaceId||undefined});const id=created?.id??created?.sessionId??created;if(!id)throw new Error('DSH did not return a session ID.');currentChat=String(id);messages=[];backendState.tools.clear();renderBackendMessages(true);renderBackendTools();backendState.sessions.unshift({id:currentChat,title:text.slice(0,68),updatedAt:new Date().toISOString(),preview:text.slice(0,170)});}await backend.sendMessage({sessionId:currentChat,text,attachments:Array.isArray(attached)?attached:attached?[attached]:[]});backendState.sending=false;pendingReply=!backendState.turnFinished;input.value='';input.style.height='auto';attachment=null;$('#attachment-label').textContent='';renderBackendMessages();}catch(error){backendState.sending=false;pendingReply=false;updateBackendControls();toast(`Could not send to DSH: ${error?.message||error}`);}}
function sendMessage(){const input=$('#message-input');if(pendingReply)return;let text=input.value.trim();if(!text&&!attachment){input.focus();return;}if(backendEnabled){sendBackendMessage(text,attachment);return;}if(attachment){text+=(text?'\n\n':'')+`[${attachment.name}]\n${attachment.text.slice(0,3000)}`;attachment=null;}if(!currentChat)currentChat='chat-'+Date.now();messages.push({role:'user',text});input.value='';input.style.height='auto';pendingReply=true;renderMessages();persistChat();setTimeout(()=>{messages.push({role:'assistant',text:generateReply(text)});pendingReply=false;persistChat();renderMessages();},950);}
function newChat(){if(pendingReply){toast('Let Aster finish this thought first.');return;}if(backendEnabled)backend.clearSession();currentChat=null;messages=[];attachment=null;if(backendEnabled){backendState.tools.clear();backendState.sessionStatus='idle';backendState.sending=false;backendState.turnStarted=false;backendState.turnFinished=false;}if(page!=='home')navigate('home');else{renderMessages();$('#message-input').value='';$('#message-input').focus();}window.asterRituals?.render(true);toast('A fresh page, just for you.');}
async function stopBackendMessage(){if(!backendEnabled||!currentChat||!pendingReply)return;const button=$('#stop-button');if(button)button.disabled=true;try{await backend.cancel(currentChat);pendingReply=false;backendState.sending=false;backendState.turnFinished=true;backendState.sessionStatus='idle';syncBackendPending();updateBackendControls();toast('The agent has stopped.');}catch(error){toast(`Could not stop the agent: ${error?.message||error}`);if(button)button.disabled=false;}}
async function loadBackendSession(id){if(!backendEnabled||backendState.sessionLoading)return;backendState.sessionLoading=true;const target=String(id);try{const loaded=await backend.loadSession(target);currentChat=target;messages=[];pendingReply=false;backendState.sending=false;backendState.turnStarted=false;backendState.turnFinished=false;backendState.tools.clear();const session=Array.isArray(loaded)?{messages:loaded}:loaded;if(session?.messages)applyBackendSession({sessionId:target,messages:session.messages,status:session.status||'idle'});if(page!=='home')navigate('home');else renderMessages();}catch(error){toast(`Could not open that conversation: ${error?.message||error}`);}finally{backendState.sessionLoading=false;window.asterRituals?.render(true);}}
async function selectBackendModel(id){if(!backendEnabled||!id)return;const prior=backendState.selectedModel;try{await backend.selectModel(id);backendState.selectedModel=id;renderBackendModels();}catch(error){backendState.selectedModel=prior;renderBackendModels();toast(`Could not select the model: ${error?.message||error}`);}}
function openBackendRename(){if(!currentChat)return;const title=activeBackendSession()?.title||'';openDialog(`<form id="rename-session-form" class="form-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="Close rename form">${icon('close')}</button><div class="eyebrow">DSH · CONVERSATION</div><h2>Give this page a name.</h2><label>Conversation title<input name="title" required maxlength="120" value="${escapeHTML(title)}"/></label><button type="submit" class="solid-button">Save name ${icon('check')}</button></form>`);$('#rename-session-form input')?.focus();}
async function renameBackendSession(title){if(!currentChat)return;try{const accepted=await backend.renameSession(currentChat,title);const session=activeBackendSession();if(session)session.title=accepted||title;closeDialog();renderBackendSessionActions();toast('Conversation renamed.');}catch(error){toast(`Could not rename conversation: ${error?.message||error}`);}}
async function forkBackendSession(){if(!currentChat)return;const source=currentChat;const button=$('#fork-session');if(button)button.disabled=true;try{const forked=await backend.forkSession(source);backendState.sessions=await backend.listSessions();await loadBackendSession(forked);toast('Opened a fork of this conversation.');}catch(error){toast(`Could not fork conversation: ${error?.message||error}`);if(button?.isConnected)button.disabled=false;}}
async function toggleBackendPin(){if(!currentChat)return;const session=activeBackendSession();const pinned=Boolean(session?.pinned||backendState.pinnedSessionIds.includes(currentChat));try{await backend.pinSession(currentChat,!pinned);if(session)session.pinned=!pinned;backendState.pinnedSessionIds=pinned?backendState.pinnedSessionIds.filter(id=>id!==currentChat):[currentChat,...backendState.pinnedSessionIds];renderBackendSessionActions();toast(pinned?'Conversation unpinned.':'Conversation pinned.');}catch(error){toast(`Could not change pin: ${error?.message||error}`);}}
async function toggleBackendArchive(id=currentChat,archived=null){if(!id)return;const session=backendState.sessions.find(item=>String(item.id??item.sessionId)===String(id))||backendState.archivedSessions.find(item=>String(item.id??item.sessionId)===String(id));const wasArchived=archived??Boolean(session?.archived||backendState.archivedSessionIds.includes(String(id)));try{await backend.archiveSession(id,!wasArchived);backendState.pinnedSessionIds=backendState.pinnedSessionIds.filter(item=>String(item)!==String(id));if(wasArchived){backendState.archivedSessions=backendState.archivedSessions.filter(item=>String(item.id??item.sessionId)!==String(id));backendState.archivedSessionIds=backendState.archivedSessionIds.filter(item=>String(item)!==String(id));backendState.sessions.unshift({...session,id:String(id),archived:false,pinned:false});toast('Conversation restored.');}else{backendState.sessions=backendState.sessions.filter(item=>String(item.id??item.sessionId)!==String(id));backendState.archivedSessionIds.push(String(id));backendState.archivedSessions.unshift({...session,id:String(id),archived:true,pinned:false});if(currentChat===String(id)){currentChat=null;messages=[];pendingReply=false;backendState.tools.clear();renderMessages();}toast('Conversation archived.');}if(page==='history')renderBackendHistory(false);else renderBackendSessionActions();}catch(error){toast(`Could not change archive: ${error?.message||error}`);}}
function openBackendCommand(){if(!currentChat){toast('Open a conversation before running a command.');return;}const sessionId=currentChat;openDialog(`<form id="backend-command-form" class="form-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="Close command form">${icon('close')}</button><div class="eyebrow">DSH · COMMAND</div><h2>Run a command.</h2><label>Command<input name="command" required maxlength="500" pattern="/[A-Za-z][A-Za-z0-9_-]*.*" placeholder="/help" autocomplete="off" spellcheck="false"/></label><div class="command-catalog" id="command-catalog" aria-label="Available DSH commands"></div><p class="form-hint">Commands begin with /. They run in the current DSH conversation.</p><button type="submit" class="solid-button">Run command ${icon('arrow')}</button></form>`);$('#backend-command-form input')?.focus();Promise.resolve(backend.listCommands(sessionId)).then(items=>{const catalog=$('#command-catalog');if(!catalog||currentChat!==sessionId)return;catalog.innerHTML=(Array.isArray(items)?items:[]).slice(0,40).map(item=>{const name=String(item.name||'');const command=name.startsWith('/')?name:`/${name}`;return `<button type="button" data-command-choice="${escapeHTML(command)}"><strong>${escapeHTML(command)}</strong><small>${escapeHTML(item.description||'')}</small></button>`;}).join('');}).catch(error=>toast(`Could not list commands: ${error?.message||error}`));}
async function runBackendCommand(command){if(!currentChat)return;try{const result=await backend.executeCommand(currentChat,command);closeDialog();const detail=result?.result?.text||result?.text||'Command completed.';backendState.tools.set(`command:${Date.now()}`,{name:command,status:'completed',detail:String(detail).slice(0,240)});while(backendState.tools.size>8)backendState.tools.delete(backendState.tools.keys().next().value);renderBackendTools();toast('Command completed.');}catch(error){toast(`Command failed: ${error?.message||error}`);}}
async function readAttachment(event){const file=event.target.files[0];if(!file)return;if(backendEnabled){const files=[...event.target.files];const images=files.filter(item=>/^(image\/(png|jpeg|webp|gif))$/.test(item.type));const imageBytes=images.reduce((sum,item)=>sum+item.size,0);if(images.length>4||imageBytes>24*1024*1024){toast('Choose up to 4 images totaling no more than 24 MB.');event.target.value='';return;}attachment=files;renderBackendMessages();toast(`${attachment.length} ${attachment.length===1?'file':'files'} ready to send.`);event.target.value='';return;}if(file.size>100000){toast('Choose a text file smaller than 100 KB.');event.target.value='';return;}try{attachment={name:file.name,text:await file.text()};renderMessages();toast('Your note is ready to send.');}catch{toast('This file could not be read. Try another text file.');}event.target.value='';}
function backendHistoryItems(){
 const source=backendState.historyView==='archived'?backendState.archivedSessions:backendState.historyQuery?backendState.historyResults||[]:backendState.sessions;
 const query=backendState.historyQuery.toLowerCase();
 return source.filter(item=>backendState.historyView==='archived'?(!query||`${item.title||''} ${item.id||item.sessionId||''}`.toLowerCase().includes(query)):!item.archived&&!backendState.archivedSessionIds.includes(String(item.id??item.sessionId))).map((session,index)=>({
  id:String(session.id??session.sessionId??index),title:session.title||'A new conversation',date:session.updatedAt||session.createdAt||0,
  excerpt:session.preview||session.lastMessage||'',archived:Boolean(session.archived),pinned:Boolean(session.pinned),
 }));
}
function renderBackendHistory(refresh=true){
 const all=backendHistoryItems(),memories=all.slice(0,backendState.historyVisible),archived=backendState.historyView==='archived';
 const cards=memories.map((item,index)=>{
  const meta=`<div class="postcard-meta"><span>${item.pinned?'✧ PINNED':archived?'ARCHIVED CONVERSATION':index===0?'YOUR MOST RECENT MEMORY':'DSH CONVERSATION'}</span><span>${item.date?formatDate(item.date):''}</span></div>`;
  const content=`<div class="postcard-content"><span class="postcard-index">N° ${String(all.length-index).padStart(3,'0')}</span><h2>${escapeHTML(item.title)}</h2>${index===0&&item.excerpt?`<p>${escapeHTML(item.excerpt)}</p>`:''}${!archived&&index===0?'<span class="postcard-open">Pick up the thread ↗</span>':''}</div>`;
  const style=`--i:${index};--angle:${[-2,1.7,-1.2,2.3,-.6][index%5]}deg;--shift:${[0,18,-9,12,-3][index%5]}px`;
  return archived?`<article class="postcard ${index===0?'latest':'tucked'}" style="${style}">${meta}${content}<button type="button" class="history-unarchive" data-unarchive="${escapeHTML(item.id)}">Unarchive ↗</button></article>`
   :`<button class="postcard ${index===0?'latest':'tucked'}" data-memory="${escapeHTML(item.id)}" style="${style}">${meta}${content}</button>`;
 }).join('');
 $('#main').innerHTML=`<section class="page history-page">${pageHeader('CHAPTER I · MEMORIES','Thoughts, <em>worth keeping.</em>','Your conversations in DSH.',`<button class="outline-button" id="history-new">${icon('plus')} A fresh page</button>`)}<div class="history-controls"><label for="history-search">Search conversations <input id="history-search" type="search" value="${escapeHTML(backendState.historyQuery)}" placeholder="Find a memory…" autocomplete="off"/></label><div class="history-view-switch" role="group" aria-label="Conversation status"><button type="button" data-history-view="active" aria-pressed="${!archived}">Active</button><button type="button" data-history-view="archived" aria-pressed="${archived}">Archived</button></div></div>${memories.length?`<div class="history-layout"><div class="postcard-stack" style="--count:${memories.length}">${cards}</div><aside class="history-note"><span class="hand-note">nothing good is ever lost</span><svg class="history-star"><use href="#star"/></svg><p>${archived?'Archived conversations can return to your workspace.':'Your conversations stay with your DSH workspace.'}</p><div class="history-count"><span>${String(all.length).padStart(2,'0')}</span> ${archived?'archived':'memories collected'}</div></aside></div>`:'<div class="empty-state">No matching conversations.</div>'}${all.length>memories.length?'<button type="button" class="outline-button history-more" id="history-more">Show more conversations</button>':''}</section>`;
 if(!refresh||backendState.status!=='connected')return;
 const token=++backendState.historyRequest;
 const load=archived?backend.listArchivedSessions():backendState.historyQuery?(backendState.contentSearchAvailable?backend.searchSessions(backendState.historyQuery):Promise.resolve(backendState.sessions.filter(item=>`${item.title||''} ${item.preview||''}`.toLowerCase().includes(backendState.historyQuery.toLowerCase())))):backend.listSessions();
 Promise.resolve(load).then(items=>{
  if(token!==backendState.historyRequest||page!=='history')return;
  if(archived)backendState.archivedSessions=Array.isArray(items)?items:[];
  else if(backendState.historyQuery)backendState.historyResults=Array.isArray(items)?items:[];
  else backendState.sessions=Array.isArray(items)?items:[];
  const focused=document.activeElement?.id==='history-search',position=focused?document.activeElement.selectionStart:null;
  renderBackendHistory(false);
  if(focused){const field=$('#history-search');field?.focus({preventScroll:true});if(position!==null)field?.setSelectionRange(position,position);}
 }).catch(error=>{if(token!==backendState.historyRequest||page!=='history')return;if(!archived&&backendState.historyQuery){const query=backendState.historyQuery.toLowerCase();backendState.historyResults=backendState.sessions.filter(item=>`${item.title||''} ${item.preview||''}`.toLowerCase().includes(query));renderBackendHistory(false);if(/search is disabled|openAt.*never/i.test(String(error?.message||error))){if(backendState.contentSearchAvailable)toast('DSH content search is unavailable; showing loaded title matches.');backendState.contentSearchAvailable=false;}else toast(`Content search failed; showing loaded title matches: ${error?.message||error}`);}else toast(`Could not load history: ${error?.message||error}`);});
}
function renderHistory(){if(backendEnabled){renderBackendHistory();return;}const memories=allMemories();$('#main').innerHTML=`<section class="page history-page">${pageHeader('CHAPTER I · MEMORIES','Thoughts, <em>worth keeping.</em>','Little postcards from everywhere your mind has wandered.',`<button class="outline-button" id="history-new">${icon('plus')} A fresh page</button>`)}<div class="history-layout"><div class="postcard-stack" style="--count:${memories.length}">${memories.map((item,i)=>`<button class="postcard ${i===0?'latest':'tucked'}" data-memory="${escapeHTML(item.id)}" style="--i:${i};--angle:${[ -2,1.7,-1.2,2.3,-.6][i%5]}deg;--shift:${[0,18,-9,12,-3][i%5]}px"><div class="postcard-meta"><span>${i===0?'YOUR MOST RECENT MEMORY':item.category}</span><span>${formatDate(item.date)}</span></div>${i===0?`<div class="postcard-stamp">${icon('star')}<span>ASTER<br>POST</span></div>`:''}<div class="postcard-content"><span class="postcard-index">N° ${String(memories.length-i).padStart(3,'0')}</span><h2>${escapeHTML(item.title)}</h2>${i===0?`<p>${escapeHTML(item.excerpt)}</p><span class="postcard-open">Pick up the thread <span>↗</span></span>`:''}</div>${i===0?'<span class="postcard-postmark">SOMEWHERE IN YOUR UNIVERSE</span>':''}</button>`).join('')}</div><aside class="history-note"><span class="hand-note">nothing good is ever lost</span><svg class="history-star"><use href="#star"/></svg><p>Some thoughts become plans.<br>Some become possibilities.<br>All of them belong here.</p><div class="history-count"><span>${String(memories.length).padStart(2,'0')}</span> memories collected</div><div class="local-note">Saved in this browser.<br>Your thoughts stay close.</div></aside></div></section>`;}
function openMemory(id){const memory=allMemories().find(m=>m.id===id);if(!memory)return;openDialog(`<div class="memory-detail"><button class="dialog-close icon-button" data-close aria-label="Close memory">${icon('close')}</button><div class="eyebrow">A POSTCARD FROM ${formatDate(memory.date).toUpperCase()}</div><h2>${escapeHTML(memory.title)}</h2><div class="memory-transcript">${memory.messages.map(m=>`<div class="message ${m.role}"><div class="message-label">${m.role==='user'?escapeHTML(data.profile.name).toUpperCase():'✧ ASTER'}</div><p>${escapeHTML(m.text)}</p></div>`).join('')}</div><button class="solid-button" data-resume="${escapeHTML(memory.id)}">Pick up the thread ${icon('arrow')}</button></div>`);}
function showNextBackendInteraction(){
 if(!backendEnabled||!backendState.interactions.length)return;
 const interaction=backendState.interactions[0];
 if(interaction.rendered)return;
 interaction.rendered=true;
 const request=interaction.request||{};
 const sourceId=String(interaction.sessionId||'');
 const source=backendState.sessions.find(item=>String(item.id??item.sessionId)===sourceId);
 const origin=sourceId?`<p class="interaction-origin">Conversation: ${escapeHTML(source?.title||sourceId.slice(0,12))}</p>`:'';
 if(interaction.type==='approval'){
  const title=request.title||request.message||(request.toolName?`Allow ${request.toolName}?`:'The agent needs your approval');
  const details=[request.reason,request.command,request.arguments,request.callId?`Call: ${request.callId}`:''].filter(Boolean);
  openDialog(`<div class="form-dialog interaction-dialog"><div class="eyebrow">DSH · APPROVAL REQUIRED</div>${origin}<h2>${escapeHTML(title)}</h2>${details.length?`<pre class="interaction-detail">${escapeHTML(details.map(value=>typeof value==='string'?value:JSON.stringify(value,null,2)).join('\n\n'))}</pre>`:''}<p>Review this action before the agent continues.</p><div class="interaction-actions"><button type="button" class="outline-button" data-approval="deny">Deny</button><button type="button" class="solid-button" data-approval="approve">Approve once ${icon('check')}</button></div></div>`);
 }else{
  const questions=Array.isArray(request.questions)&&request.questions.length?request.questions:[{question:request.question||request.message||'What information should the agent use?'}];
  const fields=questions.map((raw,index)=>{
   const item=typeof raw==='string'?{question:raw}:raw||{};
   const options=Array.isArray(item.options)?item.options:[];
   const title=item.question||item.label||item.prompt||`Question ${index+1}`;
   const heading=item.header?`<div class="eyebrow interaction-heading">${escapeHTML(item.header)}</div>`:'';
   const detail=item.detail?`<pre class="interaction-detail">${escapeHTML(item.detail)}</pre>`:'';
   const choices=options.length?`<div class="interaction-choices" role="group" aria-label="${escapeHTML(title)}">${options.map(option=>{const label=typeof option==='string'?option:option.label||'';const description=typeof option==='string'?'':option.description||'';return `<label class="interaction-choice"><input type="${item.multiSelect?'checkbox':'radio'}" name="choice-${index}" value="${escapeHTML(label)}"/><span><strong>${escapeHTML(label)}</strong>${description?`<small>${escapeHTML(description)}</small>`:''}</span></label>`;}).join('')}</div>`:'';
   return `<div class="interaction-question">${heading}<h3>${escapeHTML(title)}</h3>${detail}${choices}<label class="interaction-other">${options.length?'Other answer':'Your answer'}<textarea name="custom-${index}" rows="2" placeholder="${options.length?'Optional additional detail':'Write your answer'}"></textarea></label></div>`;
  }).join('');
  openDialog(`<form id="interaction-form" class="form-dialog interaction-dialog" data-question-count="${questions.length}"><div class="eyebrow">DSH · A QUESTION FOR YOU</div>${origin}<h2>The agent needs a little guidance.</h2>${fields}<div class="interaction-actions"><button type="submit" class="solid-button">Send answers ${icon('arrow')}</button></div></form>`);
 }
 $('#detail-dialog').querySelector('textarea,input,button')?.focus();
}
async function answerBackendInteraction(outcome){const interaction=backendState.interactions[0];if(!interaction)return;const buttons=$$('#detail-dialog button');buttons.forEach(button=>button.disabled=true);try{if(interaction.type==='approval')await backend.answerApproval(interaction.requestId,outcome);else await backend.answerQuestions(interaction.requestId,outcome);backendState.interactions.shift();closeDialog();if(backendState.interactions.length)queueMicrotask(showNextBackendInteraction);}catch(error){buttons.forEach(button=>button.disabled=false);toast(`Could not answer DSH: ${error?.message||error}`);}}
function renderBackendFeature(kicker,title,note){$('#main').innerHTML=`<section class="page settings-page">${pageHeader(kicker,title,note)}<div class="backend-feature-note"><span class="small-aster">✧</span><p>${escapeHTML(note)}</p></div></section>`;}
function localizedPluginText(value,fallback=''){return typeof value==='string'?value:value?.en||fallback;}
function backendPluginRelations(item){
 // Relations come from DSH's resolved inventory, never from shared bundle membership.
 const unique=new Map();
 for(const relation of Array.isArray(item.relatedPlugins)?item.relatedPlugins:[]){
  const id=String(relation?.entryId||'');
  if(!id||id===String(item.entryId||'')||unique.has(id))continue;
  unique.set(id,relation);
 }
 return [...unique.values()];
}
function backendPluginName(item){
 const title=localizedPluginText(item.meta?.title,localizedPluginText(item.meta?.name,item.title||''));
 const moduleName=String(item.moduleName||'');
 if(title&&(title!==moduleName||!moduleName.startsWith('@deepseek-ai/dsh-')))return title;
 const raw=String(moduleName||item.name||item.entryId||'Plugin');
 // Only DSH's scoped technical names are humanized; custom labels stay exact.
 if(!raw.startsWith('@deepseek-ai/dsh-'))return raw;
 const acronyms=new Set(['llm','api','ui','mcp','cli','rpc','http','https','oauth','ssh','sse','url','id','json']);
 return raw.slice('@deepseek-ai/dsh-'.length).split('/').map(part=>part.split(/[-_]+/).filter(Boolean).map(word=>acronyms.has(word.toLowerCase())?word.toUpperCase():word.charAt(0).toUpperCase()+word.slice(1)).join(' ')).join(' · ');
}
function backendPluginStatus(item){
 if(item.fiberPhase==='failed')return 'Failed';
 if(item.fiberPhase==='loading')return 'Starting…';
 if(item.fiberPhase==='unloading')return 'Stopping…';
 if(item.enabled&&item.fiberPhase==='pending')return 'Waiting';
 return item.enabled?'Enabled':'Off';
}
function openBackendPluginRelations(id,relatedId){window.AsterPluginUI.relation(id,relatedId);}
function renderBackendPlugins(refresh=true){window.AsterPluginUI.render(refresh);}
function backendTabFocus(tab){$$('[data-backend-plugin-tab]').find(el=>el.dataset.backendPluginTab===tab)?.focus({preventScroll:true});}
function openBackendPluginDetails(kind,id){window.AsterPluginUI.open(kind,id);}
function openBackendPluginInstall(){
 if(!backendState.pluginData?.available||backendState.status!=='connected'||backendState.pluginPending.size||backendState.pluginStale)return;
 backendState.pluginInstall=null;
 openDialog(`<form id="inspect-plugin-form" class="form-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="Close plugin installer">${icon('close')}</button><div class="eyebrow">DSH · ADD A BUNDLE</div><h2>Bring in a companion.</h2><label>Package name or source<input name="spec" required maxlength="500" autocomplete="off" spellcheck="false" placeholder="@scope/package or an absolute Host path"/></label><p class="form-hint">Local paths are read by the DSH Host. New bundles are installed switched off; enable them after review.</p><button type="submit" class="solid-button">Inspect source ${icon('arrow')}</button></form>`);
 $('#inspect-plugin-form input')?.focus();
}
async function inspectBackendPlugin(form){
 const spec=String(new FormData(form).get('spec')||'').trim();
 if(!spec)return;
 const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
 try{
  const inspection=await backend.inspectPluginBundle(spec);
  if(inspection?.status!=='accepted'){
   const reason=String(inspection?.reason||inspection?.problem||'This source is unavailable.').slice(0,600);
   const hint=document.createElement('p');hint.className='dsh-plugin-error';hint.textContent=reason;
   form.querySelector('.dsh-plugin-error')?.remove();form.append(hint);
   return;
  }
  backendState.pluginInstall={spec,inspection,requestId:null,running:false,phase:'ready',log:'',result:null};
  const title=inspection.name||spec;
  const source=inspection.kind==='path'?'Local path on the DSH Host':inspection.kind==='git'?'Git source':inspection.kind==='tarball'?'Tarball URL':'Package registry';
  const confirmation=inspection.bundle===null?'DSH will verify the bundle after download.':inspection.bundle?'DSH identified a bundle patch.':'This package does not declare a DSH bundle patch.';
  openDialog(`<div class="form-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="Close plugin installer">${icon('close')}</button><div class="eyebrow">DSH · SOURCE REVIEW</div><h2>${escapeHTML(title)}</h2><p class="dsh-plugin-review">${escapeHTML(inspection.description||'No package description was provided.')}</p><div class="dsh-plugin-review-meta"><span>${escapeHTML(source)}</span>${inspection.version?`<span>Version ${escapeHTML(inspection.version)}</span>`:''}${inspection.host?`<span>Host ${escapeHTML(inspection.host)}</span>`:''}</div><p class="form-hint">${confirmation} Installation changes the DSH profile. It starts disabled and will not run blocked build scripts without a separate approval.</p><div class="interaction-actions"><button type="button" class="outline-button" data-close>Cancel</button><button type="button" class="solid-button" id="start-plugin-install" ${inspection.bundle===false?'disabled':''}>Install switched off ${icon('arrow')}</button></div></div>`);
 }catch{
  toast('Could not inspect that DSH plugin source.');
 }finally{if(button?.isConnected)button.disabled=false;}
}
function updateBackendInstallEvent(event){
 const install=backendState.pluginInstall;
 if(!install||event.requestId!==install.requestId)return;
 if(event.type==='plugin-install-state')install.phase=event.phase||install.phase;
 if(event.type==='plugin-install-log')install.log=(install.log+String(event.text||'')).slice(-8192);
 const phase=$('#plugin-install-phase');if(phase)phase.textContent=install.phase==='applying'?'Applying bundle…':install.phase==='cancelling'?'Cancelling and restoring…':'Installing in DSH…';
 const log=$('#plugin-install-log');if(log)log.textContent=install.log;
}
function showBackendInstallProgress(){
 const install=backendState.pluginInstall;
 if(!install)return;
 openDialog(`<div class="form-dialog"><div class="eyebrow">DSH · BUNDLE INSTALL</div><h2 id="plugin-install-phase">Installing in DSH…</h2><p class="form-hint">${escapeHTML(install.spec)} · The bundle will stay switched off.</p><pre id="plugin-install-log" class="dsh-plugin-install-log"></pre><div class="interaction-actions"><button type="button" class="outline-button" id="cancel-plugin-install">Cancel installation</button></div></div>`);
}
function finishBackendPluginInstall(result,requestError=null){
 const install=backendState.pluginInstall;if(!install)return;
 install.running=false;install.result=result;
 const application=result?.application||'unknown';
 const success=['applied','restart-required','overridden'].includes(application);
 const diagnostic=String(result?.error?.diagnostic||result?.error?.code||result?.packageResult?.kind||(!result?requestError?.message:'')||'').slice(0,700);
 const pending=Array.isArray(result?.pendingBuilds)?result.pendingBuilds:[];
 const message=success?`Installed ${result.bundle||install.spec} switched off.${application==='restart-required'?' Restart DSH to apply.':''}`:application==='cancelled'?'Installation cancelled and restored.':application==='unknown'?'DSH did not return a final install result. Check the bundle inventory before retrying.':'Installation failed. DSH restored the profile files.';
 const approval=pending.length?`<div class="dsh-plugin-build-approval"><p>These package build scripts were blocked: <strong>${escapeHTML(pending.join(', '))}</strong>. Approving them grants persistent permission in this DSH profile.</p><button type="button" class="outline-button" id="approve-plugin-builds">Approve scripts and retry</button></div>`:'';
 openDialog(`<div class="form-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="Close install result">${icon('close')}</button><div class="eyebrow">DSH · BUNDLE INSTALL</div><h2>${success?'Bundle added.':application==='cancelled'?'Install cancelled.':application==='unknown'?'Installation result unavailable.':'Bundle not added.'}</h2><p class="dsh-plugin-review">${escapeHTML(message)}</p>${diagnostic?`<pre class="interaction-detail">${escapeHTML(diagnostic)}</pre>`:''}${approval}<div class="interaction-actions">${application==='unknown'?'<button type="button" class="outline-button" id="refresh-plugin-inventory">Check DSH inventory</button>':''}<button type="button" class="solid-button" data-close>Done ${icon('check')}</button></div></div>`);
 if(success&&page==='plugins')renderBackendPlugins(true);
}
async function startBackendPluginInstall(approvedBuilds){
 const install=backendState.pluginInstall;
 if(!install||install.running)return;
 try{
  const started=backend.startPluginInstall(install.spec,{enabled:false,registry:install.inspection.registry,...approvedBuilds?{approvedBuilds}:{}});
  install.requestId=started.requestId;install.running=true;install.phase='installing';install.log='';showBackendInstallProgress();
  let result,requestError=null;
  try{result=await started.result;}
  catch(error){requestError=error;try{result=await backend.waitForPluginInstall(install.requestId);}catch{result=null;}}
  finishBackendPluginInstall(result,requestError);
 }catch(error){finishBackendPluginInstall(null,error);}
}
async function cancelBackendPluginInstall(){
 const install=backendState.pluginInstall;
 if(!install?.running||!install.requestId)return;
 const button=$('#cancel-plugin-install');if(button)button.disabled=true;
 try{
  const result=await backend.cancelPluginInstall(install.requestId);
  if(result?.status==='too-late')toast('DSH is already applying this bundle; waiting for its result.');
  else if(result?.status==='not-running')toast('DSH has already finished this installation.');
 }catch{toast('Could not cancel the DSH installation.');if(button?.isConnected)button.disabled=false;}
}
function openBackendBundleRemoval(name){
 const bundle=backendState.pluginData?.bundles?.find(item=>item.name===name);
 if(!bundle?.removable||backendState.status!=='connected'||backendState.pluginPending.size||backendState.pluginStale)return;
 openDialog(`<div class="form-dialog"><button type="button" class="dialog-close icon-button" data-close aria-label="Close uninstall review">${icon('close')}</button><div class="eyebrow">DSH · REMOVE A BUNDLE</div><h2>Uninstall ${escapeHTML(name)}?</h2><p class="dsh-plugin-review">This removes the bundle from the DSH profile and its plugin rows. You can install it again later.</p><div class="interaction-actions"><button type="button" class="outline-button" data-close>Keep bundle</button><button type="button" class="solid-button" data-confirm-remove="${escapeHTML(name)}">Uninstall bundle</button></div></div>`);
}
async function removeBackendBundle(name,button){
 const bundle=backendState.pluginData?.bundles?.find(item=>item.name===name);
 if(!bundle?.removable||backendState.status!=='connected'||backendState.pluginPending.size||backendState.pluginStale)return;
 const key=`bundle:${name}`;backendState.pluginPending.add(key);backendState.pluginStale=true;backendState.pluginRequest++;
 if(button)button.disabled=true;
 try{
  const result=await backend.removePluginBundle(name);
  if(['failed','cancelled'].includes(result?.application))throw new Error(result?.error?.diagnostic||result?.error?.code||'DSH did not remove this bundle');
  if(!['applied','restart-required','overridden'].includes(result?.application))throw new Error('DSH did not confirm removal; refresh the inventory before retrying.');
  const request=++backendState.pluginRequest,inventory=await backend.listPlugins();
  if(request===backendState.pluginRequest){backendState.pluginData=inventory;backendState.pluginError='';backendState.pluginStale=false;}
  closeDialog();
  toast(result?.application==='restart-required'?'Bundle removed; restart DSH to finish.':'Bundle removed from DSH.');
 }catch(error){backendState.pluginStale=true;backendState.pluginError=`Could not confirm bundle removal: ${error?.message||error}`;toast(backendState.pluginError);closeDialog();}
 finally{backendState.pluginPending.delete(key);if(page==='plugins')renderBackendPlugins(false);window.AsterPluginUI.syncDetail();}
}
async function toggleBackendPlugin(button){
 const kind=button.dataset.dshPluginKind,id=button.dataset.dshPluginId;
 const item=window.AsterPluginUI.record(kind,id);
 if(!item||window.AsterPluginUI.controlReason(item,kind))return;
 const enabled=item.enabled!==true,key=`${kind}:${id}`;
 if(button.disabled||backendState.pluginPending.size)return;
 backendState.pluginPending.add(key);backendState.pluginStale=true;backendState.pluginRequest++;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Updating…';
 let saved=false;
 try{
  const result=await backend.setPluginEnabled({kind,id,enabled});
  if(['failed','cancelled'].includes(result?.application))throw new Error(result?.error?.diagnostic||result?.error?.code||'DSH did not apply this change');
  if(!['applied','restart-required','overridden'].includes(result?.application))throw new Error('DSH did not confirm the final state; refresh the inventory before retrying.');
  saved=true;
  const feedback=result?.application==='restart-required'?'Saved; restart DSH to apply.':result?.application==='overridden'?'Saved, but another setting overrides it.':'Applied.';
  backendState.pluginFeedback.set(`${kind==='bundle'?'bundles':'plugins'}:${id}`,feedback);
  const request=++backendState.pluginRequest;
  const inventory=await backend.listPlugins();
  if(request===backendState.pluginRequest){backendState.pluginData=inventory;backendState.pluginError='';backendState.pluginStale=false;}
  toast(feedback);
 }catch(error){
  const message=`${saved?'Saved, but could not refresh plugin state':'Could not change plugin'}: ${error?.message||error}`;
  backendState.pluginStale=true;backendState.pluginError=message;backendState.pluginFeedback.set(`${kind==='bundle'?'bundles':'plugins'}:${id}`,message);toast(message);
 }finally{
  backendState.pluginPending.delete(key);
  if(page==='plugins')renderBackendPlugins(false);
  window.AsterPluginUI.syncDetail();
 }
}
function renderPlugins(){if(backendEnabled){renderBackendPlugins();return;}const filtered=pluginLibrary.filter(p=>pluginFilter==='All'||p.type===pluginFilter);$('#main').innerHTML=`<section class="page plugins-page">${pageHeader('CHAPTER II · THE ATELIER','A little <em>extra magic.</em>','New companions for your curiosity. Turn a card. Find a possibility.')}<div class="library-top"><div class="library-tabs" role="tablist" aria-label="Plugin categories">${['All','Skill','MCP','Connector'].map(tab=>`<button role="tab" aria-selected="${pluginFilter===tab}" data-filter="${tab}" class="${pluginFilter===tab?'selected':''}">${tab==='All'?'The whole collection':tab==='Skill'?'Skills':tab==='Connector'?'Connectors':'MCP tools'}</button>`).join('')}</div><span class="library-count">${data.plugins.length} companions awake</span></div><div class="tarot-grid">${filtered.map(p=>{const active=data.plugins.includes(p.id);return `<button class="tarot-item ${active?'awakened':'dormant'}" data-plugin="${p.id}" aria-label="Explore ${p.name}, ${active?'enabled':'not enabled'}"><div class="tarot-card"><div class="tarot-inner"><span class="tarot-number">${p.number}</span><span class="tarot-corner tl">✧</span><span class="tarot-corner tr">✧</span><span class="tarot-corner bl">✧</span><span class="tarot-corner br">✧</span>${active?`<div class="tarot-art"><img src="/assets/celestial.png" alt=""/><span class="tarot-symbol">${p.symbol}</span></div><span class="tarot-front-title">${p.name}</span><span class="tarot-tag">${p.tag}</span>`:`<div class="tarot-back-design"><span class="tarot-diamond"></span><span class="tarot-diamond second"></span>${icon('star')}<span class="tarot-back-orbit"></span></div><span class="tarot-back-label">A POSSIBILITY AWAITS</span><span class="tarot-back-subtitle">${p.subtitle}</span>`}</div></div><div class="tarot-caption"><div><h2>${p.name}</h2><span>${p.type}</span></div><span class="tarot-status">${active?'✧ Awake':'Turn to discover ↗'}</span></div></button>`;}).join('')}</div><div class="collection-footnote">✧ &nbsp; A collection of possibilities. Connections are simulated in this demo.</div></section>`;}
function setPluginEnabled(id, enabled){
 const plugin=pluginLibrary.find(p=>p.id===id);
 if(!plugin)throw new Error('Unknown companion.');
 if(typeof enabled!=='boolean')throw new Error('enabled must be a boolean.');
 data.plugins=enabled?[...new Set([...data.plugins,id])]:data.plugins.filter(p=>p!==id);
 save();
 if(page==='plugins')renderPlugins();
 return {id,name:plugin.name,enabled};
}
function openPlugin(id){const p=pluginLibrary.find(p=>p.id===id);if(!p)return;const active=data.plugins.includes(id);openDialog(`<div class="plugin-detail"><button class="dialog-close icon-button" data-close aria-label="Close plugin">${icon('close')}</button><div class="focused-tarot"><span class="focused-number">${p.number}</span><img src="/assets/celestial.png" alt="Celestial pencil drawing on the tarot card"/><div class="focused-title">${p.name}</div><span class="focused-type">${p.tag}</span></div><div class="plugin-detail-copy"><div class="eyebrow">${p.type.toUpperCase()} · ${active?'AWAKE':'WAITING TO AWAKEN'}</div><h2>${p.name}</h2><p class="detail-subtitle">${p.subtitle}</p><p>${p.description}</p><ul class="ability-list">${p.abilities.map(a=>`<li>${icon('star')}${a}</li>`).join('')}</ul><button class="solid-button" data-toggle-plugin="${id}">${active?'Let this card rest':'Awaken this companion'} ${icon(active?'moon':'star')}</button><p class="demo-explanation">Demo connection · No external account is accessed.</p></div></div>`);}
function renderBackendProviderSettings(refresh=true){
 if(page!=='settings')return;
 const settings=$('.settings-main');
 if(!settings)return;
 let panel=$('#backend-provider-settings');
 if(!panel){panel=document.createElement('section');panel.id='backend-provider-settings';panel.className='backend-provider-settings';settings.append(panel);}
 const providers=backendState.providerData;
 const configured=Array.isArray(providers)?providers.filter(item=>item.active||item.configured||item.configuredRef||item.credential?.configured):[];
 const shown=Array.isArray(providers)?(backendState.providerShowAll?providers:configured):null;
 const hidden=Array.isArray(providers)?providers.length-shown.length:0;
 const rows=shown?shown.map(item=>{
  const credential=item.credential||{};
  const canSave=Boolean(item.configuredRef&&item.ref&&credential.writable);
  const status=item.active?'Active DSH provider':item.configured?'Configured profile · inactive':'No configured DSH profile';
  const keyStatus=credential.configured?'Credential saved':'No credential saved';
  return `<article class="dsh-provider-card"><div><h3>${escapeHTML(item.name||item.provider)}</h3><p>${escapeHTML(status)} · ${escapeHTML(keyStatus)}</p>${item.error?`<small>${escapeHTML(item.error)}</small>`:''}</div>${canSave?`<form class="dsh-credential-form" data-provider-ref="${escapeHTML(item.ref)}"><label>API key for ${escapeHTML(item.name||item.provider)}<input type="password" name="credential" autocomplete="new-password" required placeholder="Enter API key"/></label><button type="submit" class="outline-button">Save in DSH</button></form>`:'<p class="dsh-provider-note">Key editing is unavailable for this provider profile.</p>'}</article>`;
 }).join(''):'';
 panel.innerHTML=`<div class="settings-section-label second">DSH MODEL PROVIDERS</div><p class="settings-note">Credentials are stored by DSH. This page does not keep API keys in Aster.</p>${shown?rows||'<p class="settings-note">No configured model providers were reported.</p>':'<p class="settings-note">Loading DSH providers…</p>'}${hidden||backendState.providerShowAll&&providers?.length>configured.length?`<button type="button" class="outline-button" id="toggle-provider-catalog">${backendState.providerShowAll?'Show configured providers':`Show ${hidden} other providers`}</button>`:''}`;
 if(refresh&&backendState.status==='connected'){
  const request=++backendState.providerRequest;
  Promise.resolve(backend.getModelProviders()).then(value=>{if(page!=='settings'||request!==backendState.providerRequest)return;backendState.providerData=Array.isArray(value)?value:[];renderBackendProviderSettings(false);}).catch(()=>toast('Could not load DSH model providers.'));
 }
}
async function saveBackendCredential(form){
 const input=form.elements.namedItem('credential');
 const button=form.querySelector('button[type=submit]');
 const ref=form.dataset.providerRef;
 let key=String(input?.value||'').trim();
 if(input)input.value='';
 if(!ref||!key)return;
 if(button)button.disabled=true;
 try{
  await backend.setModelCredential(ref,key);
  key='';
  toast('Credential saved in DSH. Provider activation remains managed by DSH.');
  if(page==='settings')renderBackendProviderSettings(true);
 }catch{
  toast('DSH could not save that credential. Check its provider settings.');
 }finally{
  key='';
  if(input)input.value='';
  if(button?.isConnected)button.disabled=false;
 }
}
function renderSettings(){const about=backendEnabled?'Conversations are handled by DSH. Appearance and profile details are saved locally on this device.':'This is a local, interactive demo. Conversations, companions, rituals, and preferences are saved in this browser. No live AI service or external account is connected.';$('#main').innerHTML=`<section class="page settings-page">${pageHeader('CHAPTER IV · YOUR WORLD','Make yourself <em>at home.</em>','Small details. A space that feels like you.')}<div class="settings-layout"><div class="settings-main"><div class="settings-section-label">THE FEELING OF YOUR SPACE</div><div class="setting-row"><div><h2>A little movement</h2><p>Star turns, paper drifts, and artful transitions.</p></div><button class="switch" role="switch" aria-label="Interface animations" aria-checked="${data.settings.motion}" data-setting="motion"><span></span></button></div><div class="setting-row"><div><h2>Send with a keystroke</h2><p>Enter to send. Shift + Enter for a new line.</p></div><button class="switch" role="switch" aria-label="Send with Enter" aria-checked="${data.settings.enterSend}" data-setting="enterSend"><span></span></button></div><div class="setting-row appearance-row"><div><h2>The shade of your paper</h2><p>A different light for your thoughts.</p></div><div class="paper-options" aria-label="Paper appearance"><button data-theme="paper" class="paper-swatch daylight ${data.settings.theme==='paper'?'chosen':''}" aria-pressed="${data.settings.theme==='paper'}"><span></span>Daylight</button><button data-theme="dusk" class="paper-swatch dusk ${data.settings.theme==='dusk'?'chosen':''}" aria-pressed="${data.settings.theme==='dusk'}"><span></span>Twilight</button></div></div><div class="settings-section-label second">THE PERSON BEHIND THE THOUGHTS</div><button class="profile-shortcut" data-page="profile"><span class="profile-small-avatar">${data.profile.avatar}</span><span><strong>${escapeHTML(data.profile.name)}</strong><small>Your personal profile</small></span>${icon('arrow')}</button><div class="settings-section-label second">A NOTE ABOUT THIS LITTLE UNIVERSE</div><p class="settings-note">${about}</p></div><aside class="settings-aside"><img src="/assets/celestial.png" alt="A quiet constellation"/><p class="hand-note">your world, your way.</p></aside></div></section>`;if(backendEnabled)renderBackendProviderSettings();}
function renderProfile(){$('#main').innerHTML=`<section class="page profile-page">${pageHeader('THE PERSON BEHIND THE THOUGHTS','Hello, <em>you.</em>','Every universe begins with someone. This one begins with you.')}<div class="profile-layout"><aside class="identity-card"><div class="identity-top">A CITIZEN OF CURIOSITY</div><div class="identity-avatar">${data.profile.avatar}</div><h2>${escapeHTML(data.profile.name)}</h2><p>${escapeHTML(data.profile.intention)}</p><div class="identity-bottom"><span>ASTER</span><span>N° 001</span></div></aside><form id="profile-form" class="profile-form"><label>What shall we call you?<input name="name" value="${escapeHTML(data.profile.name)}" required maxlength="24" placeholder="Your name"/></label><label>Your email<input type="email" name="email" value="${escapeHTML(data.profile.email)}" required maxlength="120"/></label><label>A little intention<textarea name="intention" rows="2" maxlength="120" placeholder="What brings you here?">${escapeHTML(data.profile.intention)}</textarea></label><fieldset class="avatar-picker"><legend>Choose your little symbol</legend>${['✧','☽','☉','❋'].map(a=>`<label class="avatar-option"><input type="radio" name="avatar" value="${a}" ${data.profile.avatar===a?'checked':''}/><span>${a}</span></label>`).join('')}</fieldset><button type="submit" class="solid-button">Make it yours ${icon('arrow')}</button><p class="form-hint">A local profile, saved in this browser.</p></form></div></section>`;$('#profile-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const name=f.get('name').trim();if(!name){toast('Add a name for your little universe.');return;}data.profile={name,email:f.get('email').trim(),intention:f.get('intention').trim(),avatar:f.get('avatar')};save();syncGreeting();renderProfile();toast('Your universe feels a little more like you.');});}
let dialogFocus=null;function openDialog(html){delete $('#detail-dialog').dataset.pluginDetail;delete $('#detail-dialog').dataset.editor;dialogFocus=document.activeElement;$('#dialog-content').innerHTML=html;const title=$('#dialog-content h2');if(title){title.id='dialog-title';$('#detail-dialog').setAttribute('aria-labelledby','dialog-title');}if(!$('#detail-dialog').open)$('#detail-dialog').showModal();}
function closeDialog(){if(window.asterRituals?.busy())return;$('#detail-dialog').close();if(dialogFocus?.isConnected)dialogFocus.focus();}
$('#detail-dialog').addEventListener('click',e=>{if(backendState.interactions.length||backendState.pluginInstall?.running)return;if(e.target===$('#detail-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeDialog();}});
document.addEventListener('click',event=>{
 const target=event.target,match=selector=>target.closest(selector);
 const nav=match('[data-page]');if(nav){navigate(nav.dataset.page);return;}
 if(match('[data-close]')){if(!backendState.interactions.length&&!backendState.pluginInstall?.running)closeDialog();return;}
 const approval=match('[data-approval]');if(approval){answerBackendInteraction(approval.dataset.approval);return;}
 if(match('#stop-button')){stopBackendMessage();return;}
 if(match('#reconnect-button')){initializeBackend();return;}
 if(match('#rename-session')){openBackendRename();return;}
 if(match('#fork-session')){forkBackendSession();return;}
 if(match('#pin-session')){toggleBackendPin();return;}
 if(match('#archive-session')){toggleBackendArchive();return;}
 if(match('#command-button')){openBackendCommand();return;}
 const commandChoice=match('[data-command-choice]');if(commandChoice){const input=$('#backend-command-form input[name=command]');if(input){input.value=commandChoice.dataset.commandChoice;input.focus();}return;}
 const unarchive=match('[data-unarchive]');if(unarchive){toggleBackendArchive(unarchive.dataset.unarchive,true);return;}
 const prompt=match('[data-prompt]');if(prompt){const input=$('#message-input');if(input){input.value=prompt.dataset.prompt;input.focus();}return;}
 if(match('#new-chat')||match('#history-new')){newChat();return;}
 if(match('#attach-button')){$('#file-input').click();return;}
 if(match('#history-more')){backendState.historyVisible+=8;renderBackendHistory(false);return;}
 const historyView=match('[data-history-view]');if(historyView){backendState.historyView=historyView.dataset.historyView;backendState.historyVisible=8;backendState.historyRequest++;renderBackendHistory(true);return;}
 const memory=match('[data-memory]');if(memory){if(backendEnabled)loadBackendSession(memory.dataset.memory);else openMemory(memory.dataset.memory);return;}
 const resume=match('[data-resume]');if(resume){if(backendEnabled){closeDialog();loadBackendSession(resume.dataset.resume);return;}if(pendingReply){toast('Let Aster finish the current thought first.');return;}const memory=allMemories().find(item=>item.id===resume.dataset.resume);currentChat=memory.id.startsWith('seed-')?'chat-'+Date.now():memory.id;messages=structuredClone(memory.messages);closeDialog();navigate('home');return;}
 const backendTab=match('[data-backend-plugin-tab]');if(backendTab){backendState.pluginTab=backendTab.dataset.backendPluginTab;backendState.pluginPage=0;renderBackendPlugins(false);backendTabFocus(backendState.pluginTab);return;}
 const category=match('[data-plugin-category]');if(category){backendState.pluginCategory=category.dataset.pluginCategory;backendState.pluginPage=0;renderBackendPlugins(false);$$('[data-plugin-category]').find(el=>el.dataset.pluginCategory===backendState.pluginCategory)?.focus({preventScroll:true});return;}
 const pluginPage=match('[data-plugin-page]');if(pluginPage&&!pluginPage.disabled){backendState.pluginPage=Number(pluginPage.dataset.pluginPage)||0;renderBackendPlugins(false);$('.plugin-results-line')?.scrollIntoView({block:'start',behavior:'instant'});return;}
 if(match('#plugin-favorites')){backendState.pluginFavoritesOnly=!backendState.pluginFavoritesOnly;backendState.pluginPage=0;renderBackendPlugins(false);$('#plugin-favorites')?.focus({preventScroll:true});return;}
 if(match('#refresh-plugin-library')){renderBackendPlugins(true);return;}
 const openCard=match('[data-open-plugin]');if(openCard){openBackendPluginDetails(openCard.dataset.openKind||'plugin',openCard.dataset.openPlugin);return;}
 const pinCard=match('[data-pin-plugin]');if(pinCard){window.AsterPluginUI.pin(pinCard.dataset.pinKind||'plugin',pinCard.dataset.pinPlugin);return;}
 if(match('#add-dsh-plugin')){openBackendPluginInstall();return;}
 const expandedBundle=match('[data-backend-bundle]');if(expandedBundle){const id=expandedBundle.dataset.backendBundle;if(backendState.expandedBundles.has(id))backendState.expandedBundles.delete(id);else backendState.expandedBundles.add(id);renderBackendPlugins(false);return;}
 const removeBundle=match('[data-remove-bundle]');if(removeBundle){openBackendBundleRemoval(removeBundle.dataset.removeBundle);return;}
 const confirmRemove=match('[data-confirm-remove]');if(confirmRemove){removeBackendBundle(confirmRemove.dataset.confirmRemove,confirmRemove);return;}
 if(match('#start-plugin-install')){startBackendPluginInstall();return;}
 if(match('#cancel-plugin-install')){cancelBackendPluginInstall();return;}
 if(match('#approve-plugin-builds')){const pending=backendState.pluginInstall?.result?.pendingBuilds;if(Array.isArray(pending)&&pending.length)startBackendPluginInstall(pending);return;}
 if(match('#refresh-plugin-inventory')){closeDialog();if(page==='plugins')renderBackendPlugins(true);return;}
 const relatedPlugin=match('[data-related-plugin]');if(relatedPlugin){openBackendPluginRelations(relatedPlugin.dataset.relationOwner,relatedPlugin.dataset.relatedPlugin);return;}
 const backendPlugin=match('[data-plugin-action=toggle]');if(backendPlugin){toggleBackendPlugin(backendPlugin);return;}
 const filter=match('[data-filter]');if(filter){pluginFilter=filter.dataset.filter;renderPlugins();$(`[data-filter="${pluginFilter}"]`)?.focus({preventScroll:true});return;}
 const plugin=match('[data-plugin]');if(plugin){openPlugin(plugin.dataset.plugin);return;}
 const togglePlugin=match('[data-toggle-plugin]');if(togglePlugin){if(backendEnabled){toast('DSH plugin management is not connected yet.');return;}const id=togglePlugin.dataset.togglePlugin,active=data.plugins.includes(id);setPluginEnabled(id,!active);openPlugin(id);toast(active?'Your companion is resting.':'A new companion joins your constellation.');return;}
 if(match('#toggle-provider-catalog')){backendState.providerShowAll=!backendState.providerShowAll;renderBackendProviderSettings(false);return;}
 const setting=match('[data-setting]');if(setting){data.settings[setting.dataset.setting]=!data.settings[setting.dataset.setting];save();applyPreferences();renderSettings();return;}
 const theme=match('button[data-theme]');if(theme){data.settings.theme=theme.dataset.theme;save();applyPreferences();renderSettings();}
});
document.addEventListener('submit',event=>{
 const form=event.target;
 if(form.id==='rename-session-form'){event.preventDefault();renameBackendSession(String(new FormData(form).get('title')||'').trim());return;}
 if(form.id==='backend-command-form'){event.preventDefault();runBackendCommand(String(new FormData(form).get('command')||'').trim());return;}
 if(form.id==='inspect-plugin-form'){event.preventDefault();inspectBackendPlugin(form);return;}
 if(form.matches('.dsh-credential-form')){event.preventDefault();saveBackendCredential(form);return;}
 if(form.id!=='interaction-form')return;
 event.preventDefault();
 const count=Number(form.dataset.questionCount)||0;
 const answers=Array.from({length:count},(_,index)=>{
  const selected=$$(`[name="choice-${index}"]:checked`,form).map(input=>input.value);
  const custom=String(form.elements.namedItem(`custom-${index}`)?.value||'').trim();
  return {selected,custom};
 });
 if(answers.some(answer=>!answer.selected.length&&!answer.custom)){toast('Please answer each question.');return;}
 answerBackendInteraction(answers);
});
document.addEventListener('change',async event=>{if(event.target.id==='plugin-scope'||event.target.id==='plugin-state'){const name=event.target.id;backendState[name==='plugin-scope'?'pluginScope':'pluginState']=event.target.value;backendState.pluginPage=0;renderBackendPlugins(false);document.getElementById(name)?.focus({preventScroll:true});return;}if(event.target.id==='model-select'){selectBackendModel(event.target.value);return;}if(event.target.id==='workspace-select'){const prior=backendState.selectedWorkspaceId;try{await backend.setWorkspace(event.target.value);backendState.selectedWorkspaceId=event.target.value;updateBackendContext({selectedWorkspaceId:event.target.value});}catch(error){backendState.selectedWorkspaceId=prior;renderBackendWorkspaces();toast(`Could not select workspace: ${error?.message||error}`);}}});
document.addEventListener('compositionstart',event=>{if(event.target.id==='plugin-search')backendState.pluginSearchComposing=true;});
document.addEventListener('compositionend',event=>{if(event.target.id!=='plugin-search')return;backendState.pluginSearchComposing=false;backendState.pluginSearch=event.target.value;backendState.pluginPage=0;renderBackendPlugins(false);});
document.addEventListener('input',event=>{
 if(event.target.id==='plugin-search'){
  backendState.pluginSearch=event.target.value;backendState.pluginPage=0;
  if(event.isComposing||backendState.pluginSearchComposing)return;
  const cursor=event.target.selectionStart,scroll=$('#main').scrollTop;
  renderBackendPlugins(false);
  const field=$('#plugin-search');field?.focus({preventScroll:true});if(cursor!==null)field?.setSelectionRange(cursor,cursor);
  $('#main').scrollTop=scroll;return;
 }
 if(event.target.id!=='history-search')return;
 backendState.historyQuery=event.target.value;backendState.historyResults=null;backendState.historyVisible=8;backendState.historyRequest++;
 clearTimeout(historySearchTimer);historySearchTimer=setTimeout(()=>{if(page==='history')renderBackendHistory(true);},240);
});
$('#detail-dialog').addEventListener('cancel',event=>{if(backendState.interactions.length||backendState.pluginInstall?.running||window.asterRituals?.busy())event.preventDefault();});
window.addEventListener('popstate',()=>{const raw=location.hash.slice(1)||'home';const next=raw==='schedule'?'dashboard':raw;if(['home','history','plugins','dashboard','settings','profile'].includes(next)){page=next;renderPage();}});
applyPreferences();const initialPage=location.hash.slice(1)==='schedule'?'dashboard':location.hash.slice(1);page=['history','plugins','dashboard','settings','profile'].includes(initialPage)?initialPage:'home';renderPage();if(backendEnabled)initializeBackend();
window.addEventListener('aster-context-changed',event=>{if(!backendEnabled)return;backendState.selectedWorkspaceId=event.detail?.selectedWorkspaceId??backendState.selectedWorkspaceId;backendState.selectedPermissionPresetId=event.detail?.mode??backendState.selectedPermissionPresetId;renderBackendWorkspaces();});

// Optional browser tools mirror the same local demo state as the interface.
if(!backendEnabled&&document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const registrations=[
  {name:'list_aster_companions',title:'List Aster companions',description:'Read the six demo companions and their current local enabled state. No external accounts are accessed.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('This tool takes no arguments.');return pluginLibrary.map(p=>({id:p.id,name:p.name,type:p.type,enabled:data.plugins.includes(p.id)}));}},
  {name:'set_aster_companion_enabled',title:'Set local companion state',description:'Enable or disable one companion in this local demo and update the visible tarot collection. This does not connect an external account.',inputSchema:{type:'object',properties:{id:{type:'string',enum:pluginLibrary.map(p=>p.id)},enabled:{type:'boolean'}},required:['id','enabled'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.id!=='string'||typeof input.enabled!=='boolean'||Object.keys(input).some(k=>!['id','enabled'].includes(k)))throw new Error('Provide a known companion id and a boolean enabled value.');const result=setPluginEnabled(input.id,input.enabled);page='plugins';history.replaceState({page},'','#plugins');renderPage();return result;}}
 ];
 for(const tool of registrations){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
document.addEventListener('keydown',event=>{const tab=event.target.closest('[role="tab"]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();if(backendEnabled){const tabs=['plugins','bundles'];let index=tabs.indexOf(backendState.pluginTab);index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;backendState.pluginTab=tabs[index];backendState.pluginPage=0;renderBackendPlugins(false);$(`[data-backend-plugin-tab="${backendState.pluginTab}"]`)?.focus();return;}const tabs=['All','Skill','MCP','Connector'];let index=tabs.indexOf(pluginFilter);index=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;pluginFilter=tabs[index];renderPlugins();$(`[data-filter="${pluginFilter}"]`)?.focus();});
