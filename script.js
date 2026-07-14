(() => {
'use strict';

const SAVE_KEY='abyssDominion_rpg_v02';

const MONSTERS={
  slime:{name:'スライム',cls:'slime',icon:'●',hp:10,atk:2,def:0,speed:1.0,skills:[
    {id:'attack',name:'体当たり',power:1.0,target:'enemy'},
    {id:'guard',name:'かばう',kind:'guard'},
    {id:'slow',name:'粘液',power:.6,target:'enemy',status:'slow',turns:5}
  ]},
  goblin:{name:'ゴブリン',cls:'goblin',icon:'◆',hp:18,atk:4,def:1,speed:1.4,skills:[
    {id:'attack',name:'斬りつけ',power:1.0,target:'enemy'},
    {id:'double',name:'連撃',power:.7,hits:2,target:'enemy'},
    {id:'guard',name:'防御',kind:'guard'}
  ]},
  fairy:{name:'妖精',cls:'fairy',icon:'✦',hp:14,atk:2,def:0,speed:2.8,skills:[
    {id:'attack',name:'光弾',power:.8,target:'enemy'},
    {id:'heal',name:'単体回復',kind:'heal',power:7,target:'ally'},
    {id:'cleanse',name:'浄化',kind:'cleanse',target:'ally'}
  ]},
  dragon:{name:'ドラゴン',cls:'dragon',icon:'▲',hp:120,atk:40,def:6,speed:8.0,skills:[
    {id:'claw',name:'爪撃',power:.7,target:'enemy'},
    {id:'breath',name:'範囲ブレス',power:1.0,target:'allEnemies'},
    {id:'guard',name:'威嚇',kind:'weaken',target:'allEnemies'}
  ]}
};

const DEFAULT_STATE={
  floor:1,maxFloor:1,gold:500,crystals:3,lordHp:100,lordMaxHp:100,
  inRun:false,runGold:0,pity:0,
  party:['slime','goblin','fairy','dragon'],
  inventory:{
    slime:{count:4,level:1,hp:[10,10,10,10]},
    goblin:{count:2,level:1,hp:[18,18]},
    fairy:{count:1,level:1,hp:[14]},
    dragon:{count:1,level:1,hp:[120]}
  },
  items:[],equipment:[],relics:[],aiMemory:{focus:{},partySeen:{},battles:0}
};

let state=load();
let battle=null;
let loop=null;
let last=0;

const $=id=>document.getElementById(id);
const screens=['homeScreen','battleScreen','rewardScreen','resultScreen'];

function clone(x){return JSON.parse(JSON.stringify(x))}
function merge(a,b){
  for(const k of Object.keys(b||{})){
    if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==='object')merge(a[k],b[k]);
    else a[k]=b[k];
  }
}
function load(){
  try{const out=clone(DEFAULT_STATE);merge(out,JSON.parse(localStorage.getItem(SAVE_KEY)));return out}
  catch{return clone(DEFAULT_STATE)}
}
function save(){localStorage.setItem(SAVE_KEY,JSON.stringify(state))}
function screen(id){screens.forEach(x=>$(x).classList.toggle('active',x===id));window.scrollTo({top:0,behavior:'instant'})}
function sync(){
  $('floorText').textContent=state.floor;
  $('goldText').textContent=Math.floor(state.gold);
  $('crystalText').textContent=state.crystals;
  $('lordHpText').textContent=Math.ceil(state.lordHp);
}
function log(text){
  if(!battle)return;
  battle.log.unshift(text);
  battle.log=battle.log.slice(0,45);
  $('battleLog').innerHTML=battle.log.map(x=>`<p>${x}</p>`).join('');
}
function renderHome(){
  sync();
  $('homeParty').innerHTML=state.party.map((id,i)=>{
    const m=MONSTERS[id],inv=state.inventory[id];
    const hp=inv.hp[i]??m.hp;
    return `<div class="listRow"><div class="token ${m.cls}">${m.icon}</div><div class="meta"><b>${m.name}</b><small>Lv.${inv.level} / HP ${hp}/${m.hp}</small></div></div>`
  }).join('');
  $('inventoryList').innerHTML=Object.entries(state.inventory).map(([id,v])=>{
    const m=MONSTERS[id];
    return `<div class="listRow"><div class="token ${m.cls}">${m.icon}</div><div class="meta"><b>${m.name} ×${v.count}</b><small>Lv.${v.level}</small></div></div>`;
  }).join('');
}

function floorKind(f){
  if(f%1000===0)return '神戦';
  if(f%100===0)return '大ボス';
  if(f%50===0)return '階層ボス';
  if(f%10===0)return '中ボス';
  if(f%5===0)return '小ボス';
  return '通常戦';
}
function makeEnemies(f){
  let count=1+Math.floor(Math.random()*3),mult=1;
  const kind=floorKind(f);
  if(kind==='小ボス'){count=1;mult=2.7}
  if(kind==='中ボス'){count=3;mult=1.8}
  if(kind==='階層ボス'){count=5;mult=2.2}
  if(kind==='大ボス'){count=6;mult=3.2}
  if(kind==='神戦'){count=1;mult=18}
  return Array.from({length:count},(_,i)=>{
    const maxHp=Math.round((14+f*1.6)*mult);
    return {
      id:'e'+i,name:kind==='神戦'?'創世神':kind==='小ボス'?'強敵':`勇者${i+1}`,
      maxHp,hp:maxHp,atk:Math.max(2,Math.round((3+f*.22)*mult)),def:Math.floor(f/40),
      speed:Math.max(.7,1.7-f*.0005),atb:Math.random()*.45,status:{},alive:true,guard:false
    };
  });
}
function makeAllies(){
  return state.party.map((id,i)=>{
    const m=MONSTERS[id],inv=state.inventory[id],hp=inv.hp[i]??m.hp;
    return {id:'a'+i,type:id,name:m.name,maxHp:m.hp,hp,atk:m.atk,def:m.def,speed:m.speed,atb:0,status:{},alive:hp>0,guard:false};
  });
}
function setupBattle(){
  battle={
    allies:makeAllies(),enemies:makeEnemies(state.floor),paused:false,activeId:null,log:[],
    skillCd:{thunder:0,haste:0,barrier:0,surge:0},hasteUntil:0,barrierUntil:0
  };
  $('battleTitle').textContent=`第${state.floor}階`;
  $('floorKind').textContent=floorKind(state.floor);
  $('battleState').textContent='戦闘中';
  renderBattle();
  log(`${floorKind(state.floor)}開始。勇者隊が現れた。`);
  screen('battleScreen');
  last=performance.now();
  loop=requestAnimationFrame(tick);
  save();
}
function pct(a,b){return Math.max(0,Math.min(100,a/b*100))}
function statuses(u){
  const s=[];
  if(u.guard)s.push('防御');
  if(u.status.slow>0)s.push('鈍足');
  if(u.status.weaken>0)s.push('弱体');
  return s.join(' / ');
}
function unitCard(u,enemy=false){
  const cls=enemy?'enemy':'';
  const ready=!enemy&&u.alive&&u.atb>=1?' ready':'';
  const token=enemy?`<div class="token" style="background:#9b5e4c">🧑</div>`:`<div class="token ${MONSTERS[u.type].cls}">${MONSTERS[u.type].icon}</div>`;
  return `<div class="unitCard ${cls}${ready}" data-unit="${u.id}">
    <div class="unitHead">${token}<b>${u.name}</b></div>
    <div class="unitHp"><i style="width:${pct(u.hp,u.maxHp)}%"></i></div>
    <div class="unitInfo"><span>HP ${Math.max(0,Math.ceil(u.hp))}/${u.maxHp}</span><span>ATK ${u.atk}</span></div>
    <div class="atb"><i style="width:${pct(u.atb,1)}%"></i></div>
    <div class="statusLine">${u.alive?statuses(u):'戦闘不能'}</div>
  </div>`;
}
function renderBattle(){
  $('allyField').innerHTML=battle.allies.map(x=>unitCard(x,false)).join('');
  $('enemyField').innerHTML=battle.enemies.map(x=>unitCard(x,true)).join('');
  $('lordBar').style.width=`${pct(state.lordHp,state.lordMaxHp)}%`;
  $('lordHpBattle').textContent=`${Math.max(0,Math.ceil(state.lordHp))} / ${state.lordMaxHp}`;
  renderCommands();
  sync();
}
function renderCommands(){
  const u=battle.allies.find(x=>x.id===battle.activeId&&x.alive&&x.atb>=1);
  if(!u){
    $('activeUnitName').textContent='行動待ち';
    $('commandHint').textContent='ゲージが溜まると操作できる';
    $('commandButtons').innerHTML='';
    return;
  }
  $('activeUnitName').textContent=u.name;
  $('commandHint').textContent='コマンドを選択';
  $('commandButtons').innerHTML=MONSTERS[u.type].skills.map((s,i)=>`<button data-command="${i}">${s.name}</button>`).join('');
}
function living(arr){return arr.filter(x=>x.alive)}
function lowest(arr){return [...arr].filter(x=>x.alive).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]}
function damage(attacker,target,power=1){
  const weaken=attacker.status.weaken>0?.7:1;
  const guard=target.guard?.55:1;
  return Math.max(1,Math.round((attacker.atk*power-target.def)*weaken*guard));
}
function applySkill(user,skill,target){
  user.guard=false;
  if(skill.kind==='guard'){
    user.guard=true; log(`${user.name}は防御した。`);
  }else if(skill.kind==='heal'){
    const t=target||lowest(battle.allies);
    const amount=Math.round(skill.power+user.atk*1.5);
    t.hp=Math.min(t.maxHp,t.hp+amount); log(`${user.name}が${t.name}を${amount}回復。`);
  }else if(skill.kind==='cleanse'){
    const t=target||lowest(battle.allies);t.status={};log(`${user.name}が${t.name}を浄化。`);
  }else if(skill.kind==='weaken'){
    living(battle.enemies).forEach(e=>e.status.weaken=6);log(`${user.name}の威嚇。勇者隊が弱体化。`);
  }else if(skill.target==='allEnemies'){
    living(battle.enemies).forEach(e=>{const d=damage(user,e,skill.power);e.hp-=d;});
    log(`${user.name}の${skill.name}！勇者隊全体へ攻撃。`);
  }else{
    const t=target||lowest(battle.enemies);
    const hits=skill.hits||1;
    let total=0;
    for(let i=0;i<hits;i++){const d=damage(user,t,skill.power);t.hp-=d;total+=d}
    if(skill.status==='slow')t.status.slow=skill.turns||5;
    log(`${user.name}の${skill.name}！${t.name}へ${total}ダメージ。`);
  }
  user.atb=0;battle.activeId=null;
  cleanup();
}
function chooseAiTarget(enemy){
  const alive=living(battle.allies);
  if(!alive.length)return null;
  let best=null,score=-Infinity;
  for(const a of alive){
    const seen=state.aiMemory.focus[a.type]||0;
    let s=seen;
    if(a.type==='fairy')s+=10;
    if(a.type==='dragon')s+=7;
    if(a.hp<a.maxHp*.35)s+=4;
    if(a.guard)s-=5;
    if(s>score){score=s;best=a;}
  }
  return best||alive[0];
}
function enemyAct(e){
  e.guard=false;
  const target=chooseAiTarget(e);
  if(target){
    const d=damage(e,target,1);
    target.hp-=d;
    log(`${e.name}「${target.name}を先に崩す！」 ${d}ダメージ。`);
  }else{
    const barrier=performance.now()/1000<battle.barrierUntil?.55:1;
    const d=Math.max(1,Math.round(e.atk*barrier));
    state.lordHp-=d;
    log(`${e.name}が魔王へ${d}ダメージ。`);
  }
  e.atb=0;
  cleanup();
}
function cleanup(){
  battle.allies.forEach(a=>{if(a.alive&&a.hp<=0){a.alive=false;log(`${a.name}が戦闘不能。`)}});
  battle.enemies.forEach(e=>{if(e.alive&&e.hp<=0){e.alive=false;state.gold+=20;state.runGold+=20;log(`${e.name}を撃破。+20G`)}});
  if(!living(battle.enemies).length){finish(true);return}
  if(!living(battle.allies).length){
    living(battle.enemies).forEach(e=>e.atb=Math.max(e.atb,.85));
  }
  if(state.lordHp<=0){state.lordHp=0;finish(false)}
}
function tick(ts){
  if(!battle||battle.paused){loop=requestAnimationFrame(tick);return}
  const dt=Math.min(.12,(ts-last)/1000||0);last=ts;
  const now=performance.now()/1000;
  for(const a of living(battle.allies)){
    const slow=a.status.slow>0?.7:1;
    const haste=now<battle.hasteUntil?1.55:1;
    a.atb=Math.min(1,a.atb+dt/a.speed*slow*haste);
    if(a.status.slow>0)a.status.slow-=dt;
    if(a.status.weaken>0)a.status.weaken-=dt;
  }
  for(const e of living(battle.enemies)){
    const slow=e.status.slow>0?.7:1;
    e.atb=Math.min(1,e.atb+dt/e.speed*slow);
    if(e.status.slow>0)e.status.slow-=dt;
    if(e.status.weaken>0)e.status.weaken-=dt;
    if(e.atb>=1)enemyAct(e);
  }
  if(!battle.activeId){
    const ready=battle.allies.find(x=>x.alive&&x.atb>=1);
    if(ready)battle.activeId=ready.id;
  }
  for(const k of Object.keys(battle.skillCd))battle.skillCd[k]=Math.max(0,battle.skillCd[k]-dt);
  renderBattle();
  loop=requestAnimationFrame(tick);
}
function finish(win){
  if(loop)cancelAnimationFrame(loop);loop=null;
  if(win){
    persistPartyHp();recordAi();
    state.maxFloor=Math.max(state.maxFloor,state.floor+1);
    giveBossCrystals();
    save();showRewards();
  }else{
    persistPartyHp();defeat();
  }
}
function persistPartyHp(){
  battle.allies.forEach((a,i)=>{
    const inv=state.inventory[a.type];
    if(!inv.hp)inv.hp=[];
    inv.hp[i]=Math.max(0,Math.ceil(a.hp));
  });
}
function recordAi(){
  state.aiMemory.battles++;
  for(const a of battle.allies)state.aiMemory.focus[a.type]=(state.aiMemory.focus[a.type]||0)+1;
}
function giveBossCrystals(){
  const f=state.floor;
  if(f%100===0)state.crystals+=20;
  else if(f%50===0)state.crystals+=10;
  else if(f%10===0)state.crystals+=3;
  else if(f%5===0)state.crystals+=2;
}
function rewards(){
  const arr=[
    {c:'red',t:'赤箱',d:'魔物を1体獲得',fn:gainMonster},
    {c:'blue',t:'青箱',d:'装備を1つ獲得',fn:()=>state.equipment.push('ランダム装備')},
    {c:'purple',t:'紫箱',d:'遺物抽選',fn:()=>state.relics.push('深淵の遺物')},
    {c:'gold',t:'金箱',d:'ゴールド獲得',fn:()=>{const g=120+state.floor*10;state.gold+=g;state.runGold+=g}},
    {c:'black',t:'黒箱',d:'超レアか、何もなし',fn:()=>{if(Math.random()<.35)gainMonster(true)}}
  ];
  return arr.sort(()=>Math.random()-.5).slice(0,3);
}
function showRewards(){
  const rs=rewards();
  $('rewardChoices').innerHTML=rs.map((r,i)=>`<button class="rewardCard ${r.c}" data-r="${i}"><b>${r.t}</b><span>中身は開けるまで分からない。</span></button>`).join('');
  $('rewardChoices').querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{
    rs[i].fn();state.floor++;save();
    const go=confirm(`${rs[i].t}を開封。\n\n次の階へ進む？\nキャンセルで帰還する。`);
    if(go)setupBattle();else returnHome(true);
  });
  screen('rewardScreen');
}
function gainMonster(high=false){
  const pool=high?['fairy','dragon']:['slime','goblin','fairy','dragon'];
  const id=pool[Math.floor(Math.random()*pool.length)];
  const inv=state.inventory[id];inv.count++;inv.hp.push(MONSTERS[id].hp);
  state.items.push(MONSTERS[id].name);
}
function defeat(){
  const lost=Math.floor(state.gold*.5);state.gold-=lost;
  const gone=[];
  for(const [id,inv] of Object.entries(state.inventory)){
    const next=[];
    for(let i=0;i<inv.count;i++){
      if(Math.random()<.10)gone.push(MONSTERS[id].name);
      else next.push(inv.hp[i]??MONSTERS[id].hp);
    }
    inv.count=next.length;inv.hp=next;
  }
  state.inRun=false;state.lordHp=state.lordMaxHp;save();
  showResult('DEFEAT','魔王軍敗北',[
    `失ったゴールド：${lost}G`,
    `消滅した魔物：${gone.length?gone.join('、'):'なし'}`,
    `装備・魔晶石・獲得アイテムは保持`
  ]);
}
function returnHome(success){
  state.inRun=false;state.maxFloor=Math.max(state.maxFloor,state.floor);state.lordHp=state.lordMaxHp;save();
  showResult('SAFE RETURN','帰還成功',[
    `到達階：${state.floor}`,
    `獲得ゴールド：${state.runGold}G`,
    `HPは現在値のまま保存`
  ]);
}
function showResult(e,t,items){
  $('resultEyebrow').textContent=e;$('resultTitle').textContent=t;
  $('resultBody').innerHTML=`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  screen('resultScreen');
}
function useLordSkill(id){
  if(!battle||battle.skillCd[id]>0)return;
  const now=performance.now()/1000;
  if(id==='thunder'){
    const target=lowest(battle.enemies);
    if(target){target.hp-=18+state.floor*.2;log(`魔王スキル「落雷」！${target.name}へ大ダメージ。`)}
    battle.skillCd[id]=12;
  }
  if(id==='haste'){battle.hasteUntil=now+7;battle.skillCd[id]=16;log('魔王スキル「加速」！')}
  if(id==='barrier'){battle.barrierUntil=now+7;battle.skillCd[id]=18;log('魔王スキル「結界」！')}
  if(id==='surge'){
    const dead=battle.allies.find(x=>!x.alive);
    if(dead){dead.alive=true;dead.hp=Math.max(1,Math.round(dead.maxHp*.25));dead.atb=.5;log(`召喚促進で${dead.name}が再参戦。`)}
    else log('交代できる控えがいない。');
    battle.skillCd[id]=22;
  }
  cleanup();save();
}
function summonOne(){
  if(state.crystals<1){alert('魔晶石が足りない。');return}
  state.crystals--;state.pity++;
  const guaranteed=state.pity>=100;
  const roll=Math.random()*100;
  let id;
  if(guaranteed){id='dragon';state.pity=0}
  else if(roll<70)id='slime';
  else if(roll<97)id='goblin';
  else if(roll<99.5)id='fairy';
  else id='dragon';
  state.inventory[id].count++;state.inventory[id].hp.push(MONSTERS[id].hp);save();renderHome();
  alert(`${MONSTERS[id].name}を召喚！`);
}

$('startBtn').onclick=()=>{
  state.inRun=true;state.floor=Math.max(1,state.maxFloor);state.runGold=0;state.lordHp=state.lordMaxHp;save();setupBattle();
};
$('partyBtn').onclick=()=>{
  $('modalBody').innerHTML=`<h2>パーティ編成</h2><p>4枠をタップして選ぶ。</p>${[0,1,2,3].map(i=>`
    <label style="display:block;margin:10px 0">枠${i+1}
      <select data-slot="${i}" style="width:100%;margin-top:5px;padding:10px;border-radius:10px">
      ${Object.keys(MONSTERS).filter(id=>state.inventory[id].count>0).map(id=>`<option value="${id}" ${state.party[i]===id?'selected':''}>${MONSTERS[id].name}</option>`).join('')}
      </select>
    </label>`).join('')}`;
  $('modal').showModal();
  $('modalBody').querySelectorAll('select').forEach(s=>s.onchange=()=>{state.party[+s.dataset.slot]=s.value;save();renderHome()});
};
$('summonBtn').onclick=()=>{
  $('modalBody').innerHTML=`<h2>召喚</h2><p>魔晶石1個で1回。100連目はドラゴン確定。</p><p>天井：${state.pity}/100</p><button id="summonOneBtn">1回召喚</button>`;
  $('modal').showModal();
  setTimeout(()=>$('summonOneBtn').onclick=()=>{summonOne();$('modal').close()},0);
};
$('resetBtn').onclick=()=>{if(confirm('セーブを完全初期化する？')){localStorage.removeItem(SAVE_KEY);location.reload()}};
$('pauseBtn').onclick=()=>{battle.paused=!battle.paused;$('battleState').textContent=battle.paused?'一時停止':'戦闘中';save()};
$('retreatBtn').onclick=()=>{if(confirm('ここで帰還する？')){if(loop)cancelAnimationFrame(loop);persistPartyHp();returnHome(true)}};
$('commandButtons').onclick=e=>{
  const btn=e.target.closest('[data-command]');if(!btn)return;
  const u=battle.allies.find(x=>x.id===battle.activeId);
  if(!u)return;
  const skill=MONSTERS[u.type].skills[+btn.dataset.command];
  let target=null;
  if(skill.target==='enemy')target=lowest(battle.enemies);
  if(skill.target==='ally')target=lowest(battle.allies);
  applySkill(u,skill,target);
};
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>useLordSkill(b.dataset.skill));
$('resultHomeBtn').onclick=()=>{battle=null;renderHome();screen('homeScreen')};
$('menuBtn').onclick=()=>{$('modalBody').innerHTML=`<h2>メニュー</h2><p>最高到達階：${state.maxFloor}</p><p>AI学習戦闘数：${state.aiMemory.battles}</p><p>すべてリアルタイム保存。</p>`;$('modal').showModal()};
document.querySelectorAll('.modalClose').forEach(b=>b.onclick=()=>$('modal').close());
window.addEventListener('beforeunload',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});

renderHome();sync();
if(state.inRun)setupBattle();else screen('homeScreen');

})();