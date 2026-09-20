const $=s=>document.querySelector(s), root=$('#root'), modal=$('#modal');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null, lists=[], current=null, gifts=[], groups=[], filter=0, pending=false, previewMode=false, page='home';
let birthdays=[], birthdayIndex=0, birthdayExamples=false;
let birthdayTimer=null, birthdayFlipping=false;
let splitCleanup=()=>{};
const requested=new URLSearchParams(location.search).get('list');
function toast(msg){$('#toast').textContent=msg;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4500)}
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let d;try{d=await r.json()}catch{throw Error('The secure server is unavailable. Your wishes stay locked.')}if(!r.ok){if(r.status===401){user=null;modal.close();gate(false)}throw Error(d.error||'Please try again.')}return d}
function button(text,act,attrs='',cls='secondary'){return `<button class="${cls}" data-act="${act}" ${attrs}>${text}</button>`}
function dialog(html){modal.innerHTML=html;modal.showModal()}
function gate(ready){splitCleanup();document.body.classList.remove('home-view');stopBirthdayRotation();if(previewMode){$('#nav').innerHTML='';$('#account').textContent='Preview';root.innerHTML=`<main class="gate-wrap"><div class="gate-mark">♡</div><div class="overline">JUST YOU & YOUR PEOPLE</div><h1>Good wishes.<br>Very small guest list.</h1><p>Take a little look around. No email or sign-in code needed for this preview.</p><form data-form="preview"><button class="primary">Enter preview →</button></form><p style="font-size:13px">A little space to try your wishes.</p></main>`;return}$('#nav').innerHTML='';$('#account').textContent='';root.innerHTML=`<main class="gate-wrap"><div class="gate-mark">♡</div><div class="overline">JUST YOU & YOUR PEOPLE</div><h1>Good wishes.<br>Very small guest list.</h1><p>Verify your email, then get the list owner’s okay. Your gift lists stay behind closed doors.</p>${!ready?'<p class="notice">Email verification is not connected yet. Your lists stay locked until it is ready.</p>':''}<form data-form="signin"><label for="email">Your email address</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"><button class="primary" ${ready?'':'disabled'}>Email me a sign-in code</button></form><p style="font-size:13px">Every gift needs a purchase link. Every guest needs approval.</p></main>`}
function navigation(){splitCleanup();document.body.classList.remove('home-view');stopBirthdayRotation(); $('#nav').innerHTML=button('Close People','groups',page==='groups'?'aria-current="page"':'','')+button('Gift List','giftlist',page==='list'?'aria-current="page"':'','')+button('Account','account','','');$('#account').textContent=''; }

const birthdayMonths=['January','February','March','April','May','June','July','August','September','October','November','December'];
function nextBirthday(person,now=new Date()){
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  function occurrence(year){
    // February 29 is observed on February 28 in non-leap years.
    const day=Math.min(person.day,new Date(Date.UTC(year,person.month,0)).getUTCDate());
    return Date.UTC(year,person.month-1,day);
  }
  let date=person.year?Date.UTC(person.year,person.month-1,person.day):occurrence(now.getFullYear());
  if(!person.year&&date<today)date=occurrence(now.getFullYear()+1);
  return {...person,date,days:Math.round((date-today)/86400000)};
}
function sortedBirthdays(items,now=new Date()){return items.map(p=>nextBirthday(p,now)).sort((a,b)=>(a.days<0)-(b.days<0)||a.days-b.days||a.name.localeCompare(b.name))}
function birthdayItems(){
  if(!birthdayExamples)return sortedBirthdays(birthdays).filter(p=>p.days>=0);
  return [0,5,12].map((offset,i)=>{const d=new Date();d.setDate(d.getDate()+offset);return nextBirthday({id:'example-'+i,name:['Alex','Jamie','Sam'][i],occasion:['Birthday','New home','Just because'][i],month:d.getMonth()+1,day:d.getDate()})});
}
function birthdayFace(){
  const items=birthdayItems();birthdayIndex=items.length?birthdayIndex%items.length:0;
  if(!items.length)return '<span class="birthday-empty">Add a date in Close People.</span>';
  const p=items[birthdayIndex], when=p.days===0?'Today':p.days===1?'Tomorrow':`In ${p.days} days`;
  return `<span class="birthday-message"><strong>${esc(p.name)} · ${esc(p.occasion||'Birthday')}</strong><span class="birthday-countdown">${when}</span></span>`;
}
function birthdayBar(){
  return `<section class="notification-bar birthday-bar" aria-label="Noted dates"><span class="notification-label">Noted Dates</span><div class="birthday-stage"><div id="birthday-face" class="birthday-face" role="status" aria-live="off" aria-atomic="true">${birthdayFace()}</div></div></section>`;
}
function updateBirthdayBar(){const bar=$('.birthday-bar');if(bar){bar.outerHTML=birthdayBar();startBirthdayRotation()}}
function stopBirthdayRotation(){clearInterval(birthdayTimer);birthdayTimer=null}
function startBirthdayRotation(){
  stopBirthdayRotation();
  if(page!=='home'||birthdayItems().length<2)return;
  birthdayTimer=setInterval(()=>{
    const bar=$('.birthday-bar');
    if(!bar||page!=='home'){stopBirthdayRotation();return}
    if(document.hidden||pending||modal.open||birthdayFlipping||bar.matches(':hover')||bar.contains(document.activeElement))return;
    flipBirthday(1,true).catch(()=>{});
  },5000);
}
async function flipBirthday(direction,automatic=false){
  const items=birthdayItems();if(items.length<2||birthdayFlipping)return;
  const face=$('#birthday-face');if(!face)return;
  birthdayFlipping=true;
  face.setAttribute('aria-live',automatic?'off':'polite');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{
    if(!reduced)await face.animate([{transform:'rotateX(0deg)',opacity:1},{transform:`rotateX(${direction*-90}deg)`,opacity:0}],{duration:180,easing:'ease-in',fill:'forwards'}).finished.catch(()=>{});
    if(!face.isConnected)return;
    birthdayIndex=(birthdayIndex+direction+items.length)%items.length;
    face.innerHTML=birthdayFace();
    face.getAnimations().forEach(a=>a.cancel());
    if(!reduced)await face.animate([{transform:`rotateX(${direction*90}deg)`,opacity:0},{transform:'rotateX(0deg)',opacity:1}],{duration:220,easing:'ease-out'}).finished.catch(()=>{});
  }finally{
    birthdayFlipping=false;
    if(!automatic)startBirthdayRotation();
  }
}
function birthdayForm(id){
  const p=birthdays.find(p=>p.id===id)||{};
  dialog(`<h2>${p.id?'A little date to remember.':'Never miss their day.'}</h2><p>A birthday, a new home, or any reason to give.</p><form data-form="birthday" ${p.id?`data-id="${esc(p.id)}"`:''}><label for="birthday-name">Name</label><input id="birthday-name" name="name" value="${esc(p.name||'')}" required maxlength="60" placeholder="Someone close to you"><label for="date-occasion">Occasion</label><input id="date-occasion" name="occasion" list="occasion-options" value="${esc(p.occasion||'')}" required maxlength="60" placeholder="Birthday, anniversary, graduation…"><datalist id="occasion-options"><option value="Birthday"><option value="Anniversary"><option value="New home"><option value="Graduation"><option value="A little thank-you"><option value="Just because"></datalist><div class="birthday-fields"><div><label for="birthday-month">Month</label><select id="birthday-month" name="month" required><option value="">Choose month</option>${birthdayMonths.map((m,i)=>`<option value="${i+1}" ${p.month===i+1?'selected':''}>${m}</option>`).join('')}</select></div><div><label for="birthday-day">Day</label><input id="birthday-day" name="day" type="number" min="1" max="31" value="${p.day||''}" required placeholder="Day"></div></div><label for="date-year">Year (optional)</label><input id="date-year" name="year" type="number" min="2000" max="9999" value="${p.year||''}" placeholder="e.g. ${new Date().getFullYear()}"><p class="birthday-note">Leave the year blank to repeat every year. Add a year for a one-time occasion. Recurring February 29 dates appear on February 28 in non-leap years.</p><div class="actions">${button('Cancel','close')}<button class="primary">Save date</button></div></form>`);
}
function birthdaySection(){return `<section class="birthday-book" aria-labelledby="birthday-title"><div class="mainhead"><div><h2 id="birthday-title">Dates close to your heart.</h2><p class="sub">Your occasions and little reasons to give, closest first.</p></div>${button('Add date','birthdayadd','','primary')}</div>${birthdays.length?sortedBirthdays(birthdays).map(p=>`<div class="birthday-row"><div><strong>${esc(p.name)}</strong><span>${esc(p.occasion||'Birthday')} · ${birthdayMonths[p.month-1]} ${p.day}${p.year?' '+p.year:''} · ${p.days<0?'Past date':p.days===0?'Today':p.days===1?'Tomorrow':`In ${p.days} days`}</span></div><div>${button('Edit','birthdayedit',`data-id="${esc(p.id)}"`)} ${button('Remove','birthdayremove',`data-id="${esc(p.id)}"`)}</div></div>`).join(''):'<p class="birthday-note">No dates noted yet. Add an occasion to start your reminders.</p>'}</section>`}

async function showHome(){
page='home'; navigation();document.body.classList.add('home-view');birthdays=(await api('/api/birthdays')).birthdays;
const mine=lists.filter(l=>l.owner===user), shared=lists.filter(l=>l.owner!==user);
const collections=await Promise.all(mine.map(l=>api('/api/lists/'+l.id)));
const wishes=collections.flatMap(d=>d.gifts.map(g=>({...g,listId:d.list.id,listName:d.list.name})));
const ownCards=wishes.map(g=>`<button class="home-tile wish-tile" data-act="select" data-id="${esc(g.listId)}" aria-label="Open ${esc(g.name)} in ${esc(g.listName)}"><span class="wish-symbol" aria-hidden="true">${g.id.startsWith('demo-my-gift-')?['☕','🌷','📖','👜','🧶','💍','🎵'][Number(g.id.split('-').pop())]||'✧':'✧'}</span><span class="tile-caption"><strong>${esc(g.name)}</strong><span>${esc(g.price||g.listName)}</span></span></button>`);
ownCards.unshift(`<button class="home-tile add-tile" data-act="homeadd" aria-label="Add a wish"><span class="add-symbol" aria-hidden="true">＋</span><span class="tile-prompt">Add a wish</span></button>`);
const friendCards=shared.map(l=>{
const birthday=sortedBirthdays(birthdays.filter(p=>p.name===l.name)).find(p=>p.days>=0);
return `<button class="home-tile friend-tile" data-act="select" data-id="${esc(l.id)}"><span class="friend-monogram" aria-hidden="true">${esc(l.name.charAt(0).toUpperCase())}</span><span class="tile-caption"><strong>${esc(l.name)}</strong>${birthday?`<span class="person-birthday">${esc(birthday.occasion||'Birthday')} · ${birthdayMonths[birthday.month-1].slice(0,3)} ${birthday.day}</span>`:''}</span></button>`;
});
if(!shared.length) friendCards.push(`<button class="home-tile connect-tile" data-act="groups"><span class="connect-symbol" aria-hidden="true">♡</span><span class="tile-prompt">Add your people</span></button>`);

root.innerHTML=`<main class="homepage">${birthdayBar()}<div class="home-columns"><section id="own-board" class="home-panel own-panel" aria-labelledby="own-heading"><div class="panel-heading"><h1 id="own-heading">My Wishes</h1></div><div class="home-grid" role="region" aria-label="Your gifts" tabindex="0"><div class="home-grid-content">${ownCards.join('')}</div></div></section><div class="home-divider" role="separator" aria-label="Resize gift and people panels" aria-orientation="vertical" aria-controls="own-board people-board" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" tabindex="0" title="Drag to resize. Double-click to reset."></div><section id="people-board" class="home-panel friends-panel" aria-labelledby="friends-heading"><div class="panel-heading"><h2 id="friends-heading">Close People</h2>${shared.some(l=>l.id.startsWith('demo-'))?'<span class="demo-caption">Sample people</span>':''}</div><div class="home-grid" role="region" aria-label="Close people gift lists" tabindex="0"><div class="home-grid-content">${friendCards.join('')}</div></div></section></div><footer class="home-footer">A little want never hurt. ♡</footer></main>`;
initializeHomeSplit();
startBirthdayRotation();
}

function initializeHomeSplit(){
  splitCleanup();
  const columns=$('.home-columns'), divider=$('.home-divider');
  if(!columns||!divider)return;
  let ratio=.5, pointer=null;
  try{const saved=Number(localStorage.getItem('gp-home-split-v1'));if(saved>0&&saved<1)ratio=saved}catch{}
  function limits(){
    const available=Math.max(1,columns.clientWidth-divider.offsetWidth);
    const minimum=Math.min(220,available*.3)/available;
    return {available,min:minimum,max:1-minimum};
  }
  function apply(value,save=false){
    const {min,max}=limits();ratio=Math.min(max,Math.max(min,value));
    columns.style.gridTemplateColumns=`minmax(0,${ratio}fr) 12px minmax(0,${1-ratio}fr)`;
    divider.setAttribute('aria-valuemin',Math.round(min*100));
    divider.setAttribute('aria-valuemax',Math.round(max*100));
    divider.setAttribute('aria-valuenow',Math.round(ratio*100));
    divider.setAttribute('aria-valuetext',`My Wishes ${Math.round(ratio*100)} percent, Close People ${Math.round((1-ratio)*100)} percent`);
    if(save)try{localStorage.setItem('gp-home-split-v1',String(ratio))}catch{}
  }
  function move(event){
    if(pointer!==event.pointerId)return;
    const bounds=columns.getBoundingClientRect();
    apply((event.clientX-bounds.left-divider.offsetWidth/2)/limits().available);
  }
  function finish(event){
    if(pointer===null||event&&event.pointerId!==pointer)return;
    const id=pointer;pointer=null;
    if(divider.hasPointerCapture(id))divider.releasePointerCapture(id);
    document.body.classList.remove('resizing-panels');apply(ratio,true);
  }
  divider.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();pointer=event.pointerId;divider.setPointerCapture(pointer);divider.focus({preventScroll:true});
    document.body.classList.add('resizing-panels');
  });
  divider.addEventListener('pointermove',move);
  divider.addEventListener('pointerup',finish);
  divider.addEventListener('pointercancel',finish);
  divider.addEventListener('lostpointercapture',finish);
  divider.addEventListener('dblclick',()=>apply(.5,true));
  divider.addEventListener('keydown',event=>{
    const {min,max}=limits(),step=event.shiftKey ? .1 : .02;
    const values={ArrowLeft:ratio-step,ArrowRight:ratio+step,Home:min,End:max,Enter:.5};
    if(!(event.key in values))return;
    event.preventDefault();apply(values[event.key],true);
  });
  const observer=new ResizeObserver(()=>apply(ratio));observer.observe(columns);apply(ratio);
  splitCleanup=()=>{observer.disconnect();if(pointer!==null){const id=pointer;pointer=null;if(divider.hasPointerCapture(id))divider.releasePointerCapture(id)}document.body.classList.remove('resizing-panels');splitCleanup=()=>{}};
}

function sidebar(){return `<aside><div class="eyebrow">YOUR LITTLE WISHES</div>${lists.map(l=>button(`${l.owner===user?'♡':'↗'} ${esc(l.name)}`,'select',`data-id="${l.id}"`,`listbtn ${current?.id===l.id?'selected':''}`)).join('')}${button('＋ Create a wishlist','newlist','','newlist')}<div class="note"><b>Big hints. Zero guilt.</b><p>Only you and your approved people can see your wishes.</p></div></aside>`}
async function refresh(id){lists=(await api('/api/lists')).lists;if(id){await loadList(id)}else{await showHome()}}
async function loadList(id){splitCleanup();page='list';document.body.classList.remove('home-view');try{const d=await api('/api/lists/'+id);current=d.list;gifts=d.gifts;render()}catch(e){current=null;gifts=[];root.innerHTML=`<main class="locked"><div class="gate-mark">♡</div><h1>This wishlist is private.</h1><p>You are signed in as ${esc(user)}. The owner needs to approve your access before you can see any gifts.</p>${button('Request access','request',`data-id="${esc(id)}"`,'primary')} ${button('My wishlists','home')}<p class="sub" style="margin-top:20px">A shared link never grants access on its own.</p></main>`}}
function render(){navigation();let own=current?.owner===user;const visible=gifts.filter(g=>filter===0||filter===1&&g.status===0||filter===2&&g.status>0);root.innerHTML=`<div class="shell">${sidebar()}<main>${current?`<div class="mainhead"><div><div class="overline">A LITTLE WANT NEVER HURT</div><h1>${esc(current.name)} ✧</h1><p class="sub">For all your “ooh, I want that” moments.</p></div>${own?button('＋ Add a wish','add','','primary'):''}</div><div class="sharing"><span>♡ ${own?'Your private wishlist':'Shared with you · approved access'}</span>${own?button('Manage access','share'):''}</div><div class="toolbar">${['All wishes','Still wishing','Claimed'].map((t,i)=>button(t,'filter',`data-filter="${i}"`,`filter ${i===filter?'on':''}`)).join('')}<span class="total">${gifts.length} little wishes</span></div><div class="grid">${visible.length?visible.map(g=>`<article class="card"><div class="picture"><span>🎁</span><span class="heart">♡</span></div><div class="info"><div class="store">${esc(new URL(g.url).hostname)}</div><h2>${esc(g.name)}</h2><div class="details">${esc(g.detail)}</div><div class="price">${esc(g.price||'A little wish')}</div><a class="shop" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">View purchase link ↗</a><div class="bottom"><span class="status">${g.status===0?'♡ Still wishing':esc((g.status===1?'Claimed by ':'Purchased by ')+g.claimed_by)}</span>${!g.claimed_by||g.claimed_by===user?button(['Claim gift','Mark purchased','Release'][g.status],'claim',`data-id="${g.id}" data-status="${(g.status+1)%3}"`,'claim'):''}</div></div></article>`).join(''):`<div class="empty">Your next little obsession goes here.<br><br>${own?'Found something lovely? Add a wish with its purchase link.':'No wishes here just yet.'}</div>`}</div>`:`<h1>A little room to wish. ♡</h1><p class="sub">Create your first private wishlist. You choose who gets in.</p><div class="actions">${button('Create a wishlist','newlist','','primary')}</div>`}<footer>Excellent taste. Very helpful hints. ♡</footer></main></div>`}
async function share(){const d=await api('/api/lists/'+current.id+'/access');groups=(await api('/api/groups')).groups;dialog(`<h2>Just your kind of people.</h2><p>Approve an exact email address. They must verify that email before this wishlist opens.</p><div class="shareperson">${esc(user)} <small>Owner</small></div>${d.members.map(m=>`<div class="member"><div>${esc(m.email)}<small>${esc(m.status)} · ${m.verified_at?'email verified':'email not yet verified'}</small></div>${m.status==='approved'?button('Revoke','access',`data-email="${esc(m.email)}" data-status="revoked"`):button('Approve','access',`data-email="${esc(m.email)}" data-status="approved"`)}</div>`).join('')}<form data-form="approve"><label for="invite">Friend or family member’s email</label><input id="invite" name="email" type="email" required placeholder="alex@example.com"><div class="actions"><button class="primary">Approve access</button></div></form>${groups.length?`<label>Share with a group</label>${groups.map(g=>`<div class="member"><span>${esc(g.name)}</span>${button(d.groups.some(x=>x.id===g.id)?'Remove group':'Approve group','sharegroup',`data-id="${g.id}" data-grant="${!d.groups.some(x=>x.id===g.id)}"`)}</div>`).join('')}<p>Group members also need verified email. Revoking a person’s list access overrides their group access.</p>`:''}<div class="actions">${button('Copy private link','copy')} ${button('Done','close')}</div><p>Send the link yourself. Knowing the link does not bypass approval.</p>`)}
async function showGroups(){page='groups';[groups,birthdays]=await Promise.all([api('/api/groups').then(d=>d.groups),api('/api/birthdays').then(d=>d.birthdays)]);navigation();root.innerHTML=`<div class="shell">${sidebar()}<main><h1>Close People</h1>${birthdaySection()}<h2>Your inner circles ♡</h2><p class="sub">Adding an email approves that person for wishlists shared with the group. They must verify it first.</p><form data-form="newgroup" class="inlineform"><div><label for="groupname">New group name</label><input id="groupname" name="name" required maxlength="60" placeholder="The family"></div><button class="primary">Create group</button></form>${groups.map(g=>`<div class="groupview"><h2>${esc(g.name)}</h2>${button('Manage members','groupmembers',`data-id="${g.id}"`)}</div>`).join('')}</main></div>`}
async function groupMembers(id){const d=await api('/api/groups/'+id);dialog(`<h2>Who’s in your circle?</h2><p>Members can access lists shared with this group after verifying their email.</p>${d.members.map(m=>`<div class="member"><div>${esc(m.email)}<small>${m.verified_at?'Email verified':'Email not yet verified'}</small></div>${button('Remove','removegroupmember',`data-id="${id}" data-email="${esc(m.email)}"`)}</div>`).join('')}<form data-form="groupmember" data-id="${id}"><label for="groupemail">Approved member’s email</label><input id="groupemail" name="email" type="email" required><div class="actions">${button('Done','close')}<button class="primary">Approve member</button></div></form>`)}
const actions={
close:()=>modal.close(),home:()=>refresh(),
birthdaynext:()=>flipBirthday(1),birthdayprev:()=>flipBirthday(-1),
birthdaydemo:()=>{birthdayExamples=true;birthdayIndex=0;updateBirthdayBar()},
birthdayenddemo:()=>{birthdayExamples=false;birthdayIndex=0;updateBirthdayBar()},
birthdayadd:()=>birthdayForm(),birthdayedit:el=>birthdayForm(el.dataset.id),
birthdayremove:el=>{const p=birthdays.find(p=>p.id===el.dataset.id);dialog(`<h2>Remove this date?</h2><p>${esc(p.name)} will no longer have this occasion in your reminders.</p><div class="actions">${button('Cancel','close')}${button('Remove date','birthdaydelete',`data-id="${esc(p.id)}"`,'primary')}</div>`)},
birthdaydelete:async el=>{birthdays=(await api('/api/birthdays',{id:el.dataset.id,remove:true})).birthdays;modal.close();await showGroups()},
giftlist:async()=>{lists=(await api('/api/lists')).lists;const l=lists.find(l=>l.owner===user)||lists[0];if(l){filter=0;await loadList(l.id)}else{page='list';current=null;gifts=[];render()}},
account:()=>dialog(`<h2>Your little corner.</h2><p>${previewMode?'You’re exploring with the preview account.':esc(user)}</p><div class="actions">${button('Close','close')}${button('Sign out','logout','','primary')}</div>`),
homeadd:()=>{const mine=lists.filter(l=>l.owner===user);if(!mine.length)return actions.newlist();if(mine.length===1){current=mine[0];return actions.add()}dialog(`<h2>Which gift list?</h2><p>Choose a home for your next little wish.</p>${mine.map(l=>button(esc(l.name),'addtolist',`data-id="${esc(l.id)}"`,'listbtn')).join('')}<div class="actions">${button('Cancel','close')}</div>`)},
addtolist:el=>{current=lists.find(l=>l.id===el.dataset.id);modal.close();actions.add()},select:el=>{filter=0;return loadList(el.dataset.id)},filter:el=>{filter=Number(el.dataset.filter);render()},
newlist:()=>dialog(`<h2>Another list? Oh, go on.</h2><p>Private from the very first wish.</p><form data-form="newlist"><label for="listname">Wishlist name</label><input name="name" id="listname" required maxlength="60"><div class="actions">${button('Cancel','close')}<button class="primary">Create wishlist</button></div></form>`),
add:()=>dialog(`<h2>Ooh, what caught your eye?</h2><p>A purchase link makes your little hint perfectly clear.</p><form data-form="gift" class="purchase-form"><label for="url">Purchase link · required</label><input name="url" id="url" type="url" pattern="https?://.+" required maxlength="2048" placeholder="https://store.com/your-gift"><label for="title">Your wish</label><input id="title" name="name" required maxlength="90"><label for="detail">The little details</label><input id="detail" name="detail" maxlength="200" placeholder="Size, color, or the exact edition"><label for="price">Price or estimated budget</label><input id="price" name="price" maxlength="40"><div class="actions">${button('Cancel','close')}<button class="primary">Save wish ♡</button></div></form>`),
claim:async el=>{await api('/api/lists/'+current.id+'/claim',{id:el.dataset.id,status:Number(el.dataset.status)});await loadList(current.id)},
share,groups:showGroups,groupmembers:el=>groupMembers(el.dataset.id),
access:async el=>{await api('/api/lists/'+current.id+'/access',{email:el.dataset.email,status:el.dataset.status});modal.close();await share()},
sharegroup:async el=>{await api('/api/lists/'+current.id+'/groups',{id:el.dataset.id,grant:el.dataset.grant==='true'});modal.close();await share()},
removegroupmember:async el=>{await api('/api/groups/'+el.dataset.id,{email:el.dataset.email,remove:true});modal.close();await groupMembers(el.dataset.id)},
copy:async()=>{await navigator.clipboard.writeText(location.origin+'/?list='+current.id);toast('Private link copied. Only approved people can open it.')},
request:async el=>{await api('/api/lists/'+el.dataset.id+'/request',{});el.disabled=true;el.textContent='Access requested';toast('Request received. The owner can approve it in Manage access.')},
logout:async()=>{modal.close();await api('/api/auth/logout',{});user=null;lists=[];gifts=[];current=null;await init()}
};
document.addEventListener('click',async e=>{const el=e.target.closest('[data-act]');if(!el)return;e.preventDefault();if(pending)return;pending=true;try{await actions[el.dataset.act]?.(el)}catch(err){toast(err.message)}finally{pending=false}});
document.addEventListener('submit',async e=>{const form=e.target;if(!form.dataset.form)return;e.preventDefault();if(pending)return;pending=true;const submit=form.querySelector('button:not([data-act])');if(submit)submit.disabled=true;const d=Object.fromEntries(new FormData(form));try{
switch(form.dataset.form){
case 'birthday':birthdays=(await api('/api/birthdays',{...d,id:form.dataset.id||'',month:Number(d.month),day:Number(d.day),year:d.year?Number(d.year):null})).birthdays;birthdayExamples=false;birthdayIndex=0;modal.close();if(page==='home'){updateBirthdayBar()}else{await showGroups()}toast('Date noted. A little something to look forward to.');break;
case 'preview':user=(await api('/api/auth/preview',{})).email;navigation();await refresh();break;
case 'signin':await api('/api/auth/start',d);root.innerHTML=`<main class="gate-wrap"><div class="gate-mark">♡</div><h1>A little note in your inbox.</h1><p>Enter the 8-digit code sent to ${esc(d.email)}. It expires in 10 minutes.</p><form data-form="verify"><label for="code">Verification code</label><input name="code" id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required><button class="primary">Verify my email</button></form><p>Wrong address or expired code? Reload to start again.</p></main>`;break;
case 'verify':user=(await api('/api/auth/verify',d)).email;navigation();await refresh(requested);break;
case 'newlist':{const l=await api('/api/lists',d);modal.close();await refresh(l.id);break}
case 'gift':await api('/api/lists/'+current.id+'/gifts',d);modal.close();if(page==='home'){await refresh()}else{await loadList(current.id)};toast('Wish tucked away. Hint, hint. ♡');break;
case 'approve':await api('/api/lists/'+current.id+'/access',{email:d.email,status:'approved'});modal.close();await share();toast('Email approved. Share the private link with them.');break;
case 'newgroup':await api('/api/groups',d);await showGroups();break;
case 'groupmember':await api('/api/groups/'+form.dataset.id,d);modal.close();await groupMembers(form.dataset.id);break;
}
}catch(err){toast(err.message)}finally{pending=false;if(submit)submit.disabled=false}});
async function init(){try{const s=await api('/api/session');previewMode=s.previewMode===true;user=s.email;if(!user){gate(s.emailConfigured);return}navigation();await refresh(requested)}catch(err){gate(false);toast(err.message)}}
init();
