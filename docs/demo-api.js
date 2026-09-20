/* GitHub Pages demo: fictional seed data and browser-local changes, no network API. */
(() => {
  const KEY = 'guiltypleasure-public-demo-v1';
  const WHO = 'preview@example.com';
  const people = [
    ['sophie','Sophie Chen',1,'Birthday'],['oliver','Oliver Park',3,'New home'],
    ['mia','Mia Wilson',5,'Graduation'],['theo','Theo Martin',8,'Birthday'],
    ['emma','Emma Lee',12,'Anniversary'],['leo','Leo Rivera',17,'A little thank-you'],
    ['nina','Nina Patel',23,'New job'],['noah','Noah Kim',31,'Birthday'],
    ['chloe','Chloe Davis',42,'Just because'],['max','Max Bennett',56,'Anniversary'],
    ['lily','Lily Nguyen',70,'Birthday'],['ethan','Ethan Brooks',89,'Holiday dinner']
  ];
  const wishes = [
    ['A little espresso ritual','Ceramic cup, in butter yellow','$28'],
    ['Sunday flower vase','Something sculptural for fresh stems','$45'],
    ['One more good book','An art book for a slow afternoon','$38'],
    ['The everyday tote','Room for a sketchbook and everything else','$32'],
    ['Soft landing','A warm, textured throw for the sofa','$68'],
    ['Silver little things','A simple silver ring, size 6','$55'],
    ['On repeat','A favorite album on vinyl','$30'],
    ['A candle kind of evening','A warm, woody scent','$26']
  ];
  const gift = (id,list_id,item) => ({id,list_id,name:item[0],url:'https://example.com',detail:'Example wish · '+item[1],price:item[2],claimed_by:null,status:0});
  function seed() {
    const s={version:1,signedIn:true,lists:[{id:'preview-wishlist',owner:WHO,name:'My little wishlist'}],gifts:[],birthdays:[],groups:[],access:{}};
    wishes.slice(0,7).forEach((w,i)=>s.gifts.push(gift('demo-my-gift-'+i,'preview-wishlist',w)));
    people.forEach(([slug,name,offset,occasion],i)=>{
      const day=new Date();day.setDate(day.getDate()+offset);
      const id='demo-list-'+slug;
      s.lists.push({id,owner:'demo-'+slug+'@example.com',name});
      s.birthdays.push({id:'demo-birthday-'+slug,name,month:day.getMonth()+1,day:day.getDate(),occasion,year:['Birthday','Anniversary'].includes(occasion)?null:day.getFullYear()});
      for(let j=0;j<3;j++)s.gifts.push(gift('demo-gift-'+slug+'-'+j,id,wishes[(i+j)%wishes.length]));
    });
    return s;
  }
  let state;
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved?.version===1&&['lists','gifts','birthdays','groups'].every(k=>Array.isArray(saved[k]))&&saved.access)state=saved}catch{}
  if(!state)state=seed();
  const copy=x=>JSON.parse(JSON.stringify(x));
  const fail=msg=>{throw new Error(msg)};
  const uid=()=>crypto.randomUUID();
  function text(value,label,max,required=true){const t=String(value??'').trim();if((required&&!t)||t.length>max)fail('Check '+label+'.');return t}
  function email(value){const t=text(value,'the email address',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))fail('Enter a valid email address.');return t}
  function list(id,own=false){const l=state.lists.find(l=>l.id===id);if(!l||own&&l.owner!==WHO)fail('This demo wishlist is unavailable.');return l}
  function group(id){const g=state.groups.find(g=>g.id===id);if(!g)fail('Group not found.');return g}
  function run(path,d){
    if(path==='/api/session')return {email:state.signedIn?WHO:null,emailConfigured:false,previewMode:true};
    if(path==='/api/auth/preview'&&d){state.signedIn=true;return {email:WHO}}
    if(!state.signedIn)fail('Enter the demo to continue.');
    if(path==='/api/auth/logout'&&d){state.signedIn=false;return {ok:true}}
    if(path==='/api/birthdays'){
      if(d){
        const existing=d.id?state.birthdays.find(p=>p.id===d.id):null;
        if(d.id&&!existing)fail('Date not found.');
        if(d.remove){if(!existing)fail('Choose a date.');state.birthdays=state.birthdays.filter(p=>p.id!==d.id)}
        else{
          const name=text(d.name,'the name',60),occasion=text(d.occasion||'Birthday','the occasion',60);
          const {month,day}=d,year=d.year??null;
          if(!Number.isInteger(month)||!Number.isInteger(day)||month<1||month>12||day<1||year!==null&&(!Number.isInteger(year)||year<2000||year>9999))fail('Choose a valid date.');
          const check=new Date(Date.UTC(year??2000,month-1,day));
          if(check.getUTCMonth()!==month-1||check.getUTCDate()!==day)fail('Choose a valid date.');
          const p={id:existing?.id||uid(),name,occasion,month,day,year};
          if(existing)Object.assign(existing,p);else state.birthdays.push(p);
        }
      }
      return {birthdays:state.birthdays};
    }
    if(path==='/api/lists'){
      if(d){const id=uid();state.lists.push({id,owner:WHO,name:text(d.name,'the wishlist name',60)});return {id}}
      return {lists:state.lists};
    }
    const match=path.match(/^\/api\/lists\/([\w-]+)(?:\/(gifts|access|request|claim|groups))?$/);
    if(match){
      const [,id,action]=match,l=list(id,['gifts','access','groups'].includes(action));
      if(!action&&!d)return {list:l,gifts:state.gifts.filter(g=>g.list_id===id).slice().reverse()};
      if(action==='gifts'&&d){
        const name=text(d.name,'the wish name',90),detail=text(d.detail,'the details',200,false),price=text(d.price,'the price',40,false),url=text(d.url,'the purchase link',2048);
        let parsed;try{parsed=new URL(url)}catch{fail('Add a valid purchase link.')}
        if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||!parsed.hostname.includes('.'))fail('Add a valid http or https purchase link.');
        state.gifts.push({id:uid(),list_id:id,name,detail,price,url,claimed_by:null,status:0});return {ok:true};
      }
      if(action==='claim'&&d){
        const g=state.gifts.find(g=>g.id===d.id&&g.list_id===id);
        if(!g||![0,1,2].includes(d.status))fail('Choose a valid gift status.');
        g.status=d.status;g.claimed_by=d.status?WHO:null;return {ok:true};
      }
      if(action==='request')return {ok:true};
      const access=state.access[id]||(state.access[id]={members:[],groups:[]});
      if(action==='access'){
        if(d){const address=email(d.email);if(!['approved','revoked'].includes(d.status))fail('Choose approve or revoke.');const member=access.members.find(m=>m.email===address);if(member)member.status=d.status;else access.members.push({email:address,status:d.status,verified_at:null})}
        return {members:access.members,groups:state.groups.filter(g=>access.groups.includes(g.id))};
      }
      if(action==='groups'&&d){group(d.id);access.groups=access.groups.filter(g=>g!==d.id);if(d.grant)access.groups.push(d.id);return {ok:true}}
    }
    if(path==='/api/groups'){
      if(d)state.groups.push({id:uid(),owner:WHO,name:text(d.name,'the group name',60),members:[]});
      return {groups:state.groups};
    }
    const gm=path.match(/^\/api\/groups\/([\w-]+)$/);
    if(gm){const g=group(gm[1]);if(d){const address=email(d.email);g.members=g.members.filter(m=>m.email!==address);if(!d.remove)g.members.push({email:address,verified_at:null})}return {members:g.members}}
    fail('This action is unavailable in the demo.');
  }
  window.guiltypleasureDemo={request:async(path,data)=>{
    const before=data?copy(state):null;
    try{
      const result=run(path,data);
      if(data){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{state=before;fail('Your browser could not save this change. Allow site storage or free some space and try again.')}}
      return copy(result);
    }catch(error){if(before)state=before;throw error}
  }};
})();
