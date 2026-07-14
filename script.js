(() => {
'use strict';

const KEY='abyssDominion_canvas_v04';
const DEFAULT={
  floor:1,maxFloor:1,gold:0,streak:0,inRun:false,
  hp:140,maxHp:140,atk:10,skillPower:1,
  upgrades:{atk:0,hp:0,skill:0}
};

let state=load();
let game=null;
let raf=0;
let last=0;

const $=id=>document.getElementById(id);
const screens=['homeScreen','gameScreen','rewardScreen','resultScreen'];
const canvas=$('gameCanvas');
const ctx=canvas.getContext('2d');

function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){try{return Object.assign(clone(DEFAULT),JSON.parse(localStorage.getItem(KEY))||{})}catch{return clone(DEFAULT)}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function show(id){screens.forEach(x=>$(x).classList.toggle('active',x===id));window.scrollTo({top:0,behavior:'instant'})}
function syncHud(){
  $('floorText').textContent=state.floor;
  $('goldText').textContent=Math.floor(state.gold);
  $('dpsText').textContent=game?Math.round(game.dps):0;
  $('streakText').textContent=state.streak;
}
function floorKind(f){
  if(f%1000===0)return '創世神';
  if(f%100===0)return '大ボス';
  if(f%50===0)return '階層ボス';
  if(f%10===0)return '中ボス';
  if(f%5===0)return '小ボス';
  return '勇者隊';
}
function enemyStats(f){
  const k=floorKind(f);
  const mult=k==='創世神'?18:k==='大ボス'?5:k==='階層ボス'?3:k==='中ボス'?2:k==='小ボス'?1.7:1;
  const hp=Math.round((34+f*4.2)*mult);
  return {name:k,hp,maxHp:hp,atk:Math.round((4+f*.35)*mult),x:610,y:570,hitFlash:0};
}
function startRun(){
  state.inRun=true;
  state.floor=Math.max(1,state.maxFloor);
  state.hp=state.maxHp=140+state.upgrades.hp*18;
  state.atk=10+state.upgrades.atk*2;
  state.skillPower=1+state.upgrades.skill*.12;
  save();
  setupFloor();
}
function setupFloor(){
  game={
    phase:'walk',
    phaseTime:0,
    paused:false,
    speed:1,
    partyX:130,
    partyY:590,
    enemy:null,
    attackTimer:0,
    enemyTimer:0,
    totalDamage:0,
    dps:0,
    dpsWindow:[],
    particles:[],
    floats:[],
    coins:[],
    shake:0,
    barrier:0,
    cooldown:{thunder:0,heal:0,barrier:0,burst:0},
    walkDuration:2.2+Math.random()*1.3,
    lastHitAt:0
  };
  show('gameScreen');
  last=performance.now();
  if(raf)cancelAnimationFrame(raf);
  raf=requestAnimationFrame(loop);
  syncHud();
  save();
}
function spawnEnemy(){
  game.phase='fight';
  game.phaseTime=0;
  game.enemy=enemyStats(state.floor);
  burstParticles(560,540,'#ffcf7a',24);
}
function rand(a,b){return a+Math.random()*(b-a)}
function burstParticles(x,y,color,count=16){
  for(let i=0;i<count;i++){
    const ang=Math.random()*Math.PI*2;
    const sp=rand(70,220);
    game.particles.push({x,y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,life:rand(.35,.8),max:.8,size:rand(3,8),color});
  }
}
function floatText(text,x,y,color='#fff',size=30){
  game.floats.push({text,x,y,vy:-55,life:1,max:1,color,size});
}
function addDamage(amount){
  game.totalDamage+=amount;
  game.dpsWindow.push({t:performance.now()/1000,d:amount});
}
function partyAttack(){
  if(!game.enemy)return;
  const dmg=Math.max(1,Math.round(state.atk*rand(.85,1.2)));
  game.enemy.hp-=dmg;
  addDamage(dmg);
  game.enemy.hitFlash=.12;
  game.shake=Math.max(game.shake,4);
  floatText(`-${dmg}`,game.enemy.x,game.enemy.y-80,'#ffd76a',32);
  burstParticles(game.enemy.x-18,game.enemy.y-20,'#ff9c54',12);
  if(Math.random()<.14){
    const extra=dmg;
    game.enemy.hp-=extra;
    addDamage(extra);
    floatText(`CRIT ${extra}`,game.enemy.x+20,game.enemy.y-120,'#fff1a6',28);
    game.shake=9;
  }
}
function enemyAttack(){
  if(!game.enemy)return;
  const reduction=game.barrier>0?.45:1;
  const dmg=Math.max(1,Math.round(game.enemy.atk*reduction));
  state.hp-=dmg;
  floatText(`-${dmg}`,game.partyX+35,game.partyY-85,'#ff7777',30);
  burstParticles(game.partyX+55,game.partyY-15,'#ff5f6e',10);
  game.shake=Math.max(game.shake,5);
}
function victory(){
  state.streak++;
  state.gold+=20;
  for(let i=0;i<8;i++)game.coins.push({x:game.enemy.x,y:game.enemy.y-20,vx:rand(-60,60),vy:rand(-180,-80),life:1.4});
  game.phase='victory';
  game.phaseTime=0;
}
function defeat(){
  if(raf)cancelAnimationFrame(raf);
  const lost=Math.floor(state.gold*.5);
  state.gold-=lost;
  state.streak=0;
  state.inRun=false;
  save();
  showResult('DEFEAT','敗北',[
    `失ったゴールド：${lost}G`,
    `到達階：${state.floor}`,
    `恒久強化は保持`
  ]);
}
function update(dt){
  if(game.paused)return;
  game.phaseTime+=dt;
  game.barrier=Math.max(0,game.barrier-dt);
  for(const k in game.cooldown)game.cooldown[k]=Math.max(0,game.cooldown[k]-dt);

  if(game.phase==='walk'){
    game.partyX+=90*dt;
    if(game.phaseTime>=game.walkDuration)spawnEnemy();
  }else if(game.phase==='fight'){
    game.attackTimer+=dt;
    game.enemyTimer+=dt;
    if(game.attackTimer>=.75){game.attackTimer=0;partyAttack()}
    if(game.enemyTimer>=1.1){game.enemyTimer=0;enemyAttack()}
    if(game.enemy.hp<=0)victory();
    if(state.hp<=0){state.hp=0;defeat();return}
  }else if(game.phase==='victory'){
    if(game.phaseTime>1.15){
      if(raf)cancelAnimationFrame(raf);
      showRewards();
      return;
    }
  }

  const now=performance.now()/1000;
  game.dpsWindow=game.dpsWindow.filter(x=>now-x.t<=3);
  game.dps=game.dpsWindow.reduce((s,x)=>s+x.d,0)/3;

  for(const p of game.particles){
    p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=240*dt;
  }
  game.particles=game.particles.filter(x=>x.life>0);

  for(const f of game.floats){
    f.life-=dt;f.y+=f.vy*dt;
  }
  game.floats=game.floats.filter(x=>x.life>0);

  for(const c of game.coins){
    c.life-=dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.vy+=260*dt;
    if(c.life<.55){c.x+=(70-c.x)*dt*5;c.y+=(70-c.y)*dt*5}
  }
  game.coins=game.coins.filter(x=>x.life>0);

  game.shake=Math.max(0,game.shake-dt*18);
  syncHud();
  save();
}
function roundedRect(x,y,w,h,r,fill,stroke){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}
function bar(x,y,w,h,value,max,color){
  roundedRect(x,y,w,h,h/2,'#0a0710','#4a3556');
  roundedRect(x,y,Math.max(0,w*(value/max)),h,h/2,color,null);
}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#1c1027');g.addColorStop(.55,'#0e0914');g.addColorStop(1,'#07040a');
  ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.fillStyle='#21142c';
  for(let i=0;i<8;i++){
    ctx.fillRect(i*100-40,160+((i%2)*36),74,500);
  }
  ctx.fillStyle='#2a1b34';
  ctx.fillRect(0,700,720,280);
  ctx.strokeStyle='rgba(255,255,255,.07)';
  ctx.lineWidth=3;
  for(let y=725;y<980;y+=62){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(720,y-34);ctx.stroke()}
}
function drawParty(){
  const x=game.partyX,y=game.partyY;
  ctx.save();
  ctx.translate(x,y);
  const bob=game.phase==='walk'?Math.sin(game.phaseTime*10)*4:0;
  ctx.translate(0,bob);

  ctx.fillStyle='#3dc961';
  ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#0b0b10';ctx.beginPath();ctx.arc(-9,-4,3,0,Math.PI*2);ctx.arc(9,-4,3,0,Math.PI*2);ctx.fill();

  ctx.fillStyle='#8a7d48';
  ctx.beginPath();ctx.arc(48,-12,23,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#efe4ff';ctx.fillRect(42,-18,12,4);

  ctx.fillStyle='#7bdff2';
  ctx.beginPath();ctx.arc(88,-48,13,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#aef4ff';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(76,-48);ctx.lineTo(62,-62);ctx.moveTo(100,-48);ctx.lineTo(114,-62);ctx.stroke();

  ctx.restore();
}
function drawEnemy(){
  if(!game.enemy||game.phase==='walk')return;
  const e=game.enemy;
  ctx.save();
  ctx.translate(e.x,e.y);
  if(e.hitFlash>0){ctx.globalAlpha=.55;e.hitFlash=Math.max(0,e.hitFlash-.016)}
  ctx.fillStyle=e.hitFlash>0?'#fff':'#d6d0da';
  ctx.beginPath();ctx.arc(0,-38,22,0,Math.PI*2);ctx.fill();
  ctx.fillRect(-18,-18,36,66);
  ctx.fillStyle='#6d4f83';ctx.fillRect(-30,-8,60,18);
  ctx.fillStyle='#dadada';ctx.fillRect(18,-4,44,7);
  ctx.restore();
}
function drawTopUI(){
  ctx.fillStyle='rgba(12,7,16,.82)';
  roundedRect(24,22,672,115,20,'rgba(12,7,16,.82)','#4b355a');
  ctx.fillStyle='#f3c76f';ctx.font='700 18px sans-serif';ctx.fillText(`第${state.floor}階  ${floorKind(state.floor)}`,45,54);
  ctx.fillStyle='#fff';ctx.font='900 26px sans-serif';ctx.fillText('魔王軍',45,92);
  bar(150,72,285,18,state.hp,state.maxHp,'#67d17b');
  ctx.font='800 17px sans-serif';ctx.fillText(`${Math.max(0,Math.ceil(state.hp))} / ${state.maxHp}`,452,88);
  ctx.fillStyle='#8de6ff';ctx.font='900 18px sans-serif';ctx.fillText(`DPS ${Math.round(game.dps)}`,575,88);

  if(game.enemy&&game.phase!=='walk'){
    ctx.fillStyle='#fff';ctx.font='900 20px sans-serif';ctx.fillText(game.enemy.name,45,155);
    bar(45,169,630,18,game.enemy.hp,game.enemy.maxHp,'#e45f66');
    ctx.fillStyle='#fff';ctx.font='800 16px sans-serif';ctx.fillText(`${Math.max(0,Math.ceil(game.enemy.hp))} / ${game.enemy.maxHp}`,545,204);
  }
}
function drawPhaseText(){
  ctx.textAlign='center';
  if(game.phase==='walk'){
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.font='900 28px sans-serif';ctx.fillText('地下を進行中…',360,275);
  }else if(game.phase==='fight'){
    ctx.fillStyle='#ffda78';ctx.font='900 28px sans-serif';ctx.fillText('BATTLE',360,275);
  }else if(game.phase==='victory'){
    ctx.fillStyle='#fff3a0';ctx.font='900 42px sans-serif';ctx.fillText('VICTORY!',360,275);
  }
  ctx.textAlign='start';
}
function drawParticles(){
  for(const p of game.particles){
    ctx.globalAlpha=p.life/p.max;
    ctx.fillStyle=p.color;
    ctx.fillRect(p.x,p.y,p.size,p.size);
  }
  ctx.globalAlpha=1;
  for(const f of game.floats){
    ctx.globalAlpha=f.life/f.max;
    ctx.fillStyle=f.color;
    ctx.font=`900 ${f.size}px sans-serif`;
    ctx.textAlign='center';
    ctx.fillText(f.text,f.x,f.y);
  }
  ctx.globalAlpha=1;ctx.textAlign='start';
  for(const c of game.coins){
    ctx.fillStyle='#ffd34f';
    ctx.beginPath();ctx.arc(c.x,c.y,9,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#9a6b00';ctx.font='900 10px sans-serif';ctx.fillText('G',c.x-4,c.y+4);
  }
}
function drawSkillStatus(){
  const mapping={thunder:'thunderCd',heal:'healCd',barrier:'barrierCd',burst:'burstCd'};
  for(const [k,id] of Object.entries(mapping)){
    $(id).textContent=game.cooldown[k]>0?`${game.cooldown[k].toFixed(1)}秒`:'READY';
  }
}
function render(){
  ctx.save();
  const sx=game.shake?rand(-game.shake,game.shake):0;
  const sy=game.shake?rand(-game.shake,game.shake):0;
  ctx.translate(sx,sy);
  drawBackground();
  drawTopUI();
  drawPhaseText();
  drawParty();
  drawEnemy();
  drawParticles();
  ctx.restore();
  drawSkillStatus();
}
function loop(ts){
  const dt=Math.min(.05,(ts-last)/1000||0)*game.speed;last=ts;
  update(dt);
  if(!game)return;
  render();
  raf=requestAnimationFrame(loop);
}
function skill(id){
  if(!game||game.cooldown[id]>0)return;
  if(id==='thunder'&&game.enemy){
    const d=Math.round(35*state.skillPower);
    game.enemy.hp-=d;addDamage(d);game.cooldown[id]=10;
    floatText(`⚡ ${d}`,game.enemy.x,game.enemy.y-120,'#9de6ff',34);
    burstParticles(game.enemy.x,game.enemy.y-20,'#8ecbff',30);game.shake=10;
  }else if(id==='heal'){
    const h=Math.round(35*state.skillPower);
    state.hp=Math.min(state.maxHp,state.hp+h);game.cooldown[id]=14;
    floatText(`+${h}`,game.partyX+30,game.partyY-100,'#8dff9c',34);
    burstParticles(game.partyX+30,game.partyY-30,'#8dff9c',22);
  }else if(id==='barrier'){
    game.barrier=6;game.cooldown[id]=16;
    burstParticles(game.partyX+30,game.partyY-10,'#d5b5ff',26);
  }else if(id==='burst'&&game.enemy){
    const d=Math.round(state.atk*5*state.skillPower);
    game.enemy.hp-=d;addDamage(d);game.cooldown[id]=22;
    floatText(`🔥 ${d}`,game.enemy.x,game.enemy.y-130,'#ffb36b',38);
    burstParticles(game.enemy.x,game.enemy.y-10,'#ff6f4f',40);game.shake=14;
  }
  save();
}
function rewardSet(){
  return [
    {c:'red',t:'軍団強化',d:'この挑戦中、通常攻撃+25%',fn:()=>{state.atk=Math.round(state.atk*1.25)}},
    {c:'blue',t:'全回復',d:'HPを最大まで回復',fn:()=>{state.hp=state.maxHp}},
    {c:'purple',t:'魔力増幅',d:'この挑戦中、スキル威力+30%',fn:()=>{state.skillPower*=1.3}},
    {c:'gold',t:'ゴールド',d:`${120+state.floor*12}G獲得`,fn:()=>{state.gold+=120+state.floor*12}},
    {c:'black',t:'深淵契約',d:'最大HP-20%、攻撃+80%',fn:()=>{state.maxHp=Math.max(30,Math.round(state.maxHp*.8));state.hp=Math.min(state.hp,state.maxHp);state.atk=Math.round(state.atk*1.8)}}
  ].sort(()=>Math.random()-.5).slice(0,3);
}
function showRewards(){
  const list=rewardSet();
  $('rewardChoices').innerHTML=list.map((r,i)=>`<button class="rewardCard ${r.c}" data-r="${i}"><b>${r.t}</b><span>${r.d}</span></button>`).join('');
  $('rewardChoices').querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{
    list[i].fn();
    state.floor++;
    state.maxFloor=Math.max(state.maxFloor,state.floor);
    save();
    const go=confirm(`${list[i].t}を獲得。\n\n次の階へ進む？\nキャンセルで帰還。`);
    if(go)setupFloor();else safeReturn();
  });
  show('rewardScreen');
}
function safeReturn(){
  if(raf)cancelAnimationFrame(raf);
  state.inRun=false;
  save();
  showResult('SAFE RETURN','帰還成功',[
    `到達階：${state.floor}`,
    `所持ゴールド：${state.gold}G`,
    `恒久強化へ使用できる`
  ]);
}
function showResult(e,t,items){
  $('resultEye').textContent=e;$('resultTitle').textContent=t;
  $('resultBody').innerHTML=`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  show('resultScreen');
}
function renderHome(){
  syncHud();
  const data=[
    ['atk','軍団攻撃',state.upgrades.atk,100+state.upgrades.atk*120],
    ['hp','最大HP',state.upgrades.hp,100+state.upgrades.hp*120],
    ['skill','スキル威力',state.upgrades.skill,150+state.upgrades.skill*150]
  ];
  $('upgradeList').innerHTML=data.map(([id,n,lv,c])=>`
    <div class="upgradeRow">
      <div><b>${n}</b><small>Lv.${lv}</small></div>
      <button data-up="${id}" data-cost="${c}">${c}G</button>
    </div>`).join('');
}
$('startBtn').onclick=startRun;
$('upgradeList').onclick=e=>{
  const b=e.target.closest('[data-up]');if(!b)return;
  const id=b.dataset.up,cost=+b.dataset.cost;
  if(state.gold<cost){alert('ゴールド不足。');return}
  state.gold-=cost;state.upgrades[id]++;save();renderHome();
};
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>skill(b.dataset.skill));
$('speedBtn').onclick=()=>{if(!game)return;game.speed=game.speed===1?2:game.speed===2?3:1;$('speedBtn').textContent=`⏩ ×${game.speed}`};
$('pauseBtn').onclick=()=>{if(!game)return;game.paused=!game.paused;$('pauseBtn').textContent=game.paused?'▶ 再開':'⏸ 一時停止'};
$('returnBtn').onclick=()=>{if(confirm('ここで帰還する？'))safeReturn()};
$('homeBtn').onclick=()=>{game=null;renderHome();show('homeScreen')};
$('menuBtn').onclick=()=>{
  $('modalBody').innerHTML=`<h2>メニュー</h2><p>最高到達階：${state.maxFloor}</p><p>リアルタイム保存中。</p><button id="resetBtn">セーブ初期化</button>`;
  $('modal').showModal();
  setTimeout(()=>$('resetBtn').onclick=()=>{if(confirm('本当に初期化する？')){localStorage.removeItem(KEY);location.reload()}},0);
};
document.querySelectorAll('.closeBtn').forEach(b=>b.onclick=()=>$('modal').close());
window.addEventListener('beforeunload',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});

renderHome();
syncHud();
if(state.inRun)setupFloor();else show('homeScreen');
})();