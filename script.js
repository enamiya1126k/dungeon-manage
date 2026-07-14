(() => {
'use strict';

const KEY='abyssDominion_maze_v05';
const DEFAULT={
  floor:1,maxFloor:1,gold:0,streak:0,inRun:false,
  maxHp:150,hp:150,skillPower:1,
  upgrades:{atk:0,hp:0,skill:0}
};

const MONSTER_DEFS={
  slime:{name:'スライム',icon:'●',color:'#3ecf65',hp:36,atk:5,interval:1.0,crit:.08},
  goblin:{name:'ゴブリン',icon:'◆',color:'#8d8052',hp:44,atk:8,interval:.82,crit:.14},
  fairy:{name:'妖精',icon:'✦',color:'#79dff3',hp:28,atk:3,interval:1.55,crit:.05,healer:true},
  dragon:{name:'ドラゴン',icon:'▲',color:'#d65353',hp:110,atk:26,interval:5.8,crit:.20,aoe:true}
};

let state=load();
let game=null;
let raf=0;
let last=0;

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas');
const ctx=canvas.getContext('2d');
const screens=['homeScreen','gameScreen','rewardScreen','resultScreen'];

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
function mazeGenerate(size=7){
  const grid=Array.from({length:size},()=>Array(size).fill(1));
  function carve(x,y){
    grid[y][x]=0;
    const dirs=[[2,0],[-2,0],[0,2],[0,-2]].sort(()=>Math.random()-.5);
    for(const [dx,dy] of dirs){
      const nx=x+dx,ny=y+dy;
      if(nx>0&&ny>0&&nx<size-1&&ny<size-1&&grid[ny][nx]===1){
        grid[y+dy/2][x+dx/2]=0;carve(nx,ny);
      }
    }
  }
  carve(1,1);
  return grid;
}
function openNeighbors(grid,x,y){
  const dirs=[['↑',0,-1],['→',1,0],['↓',0,1],['←',-1,0]];
  return dirs.filter(([,dx,dy])=>grid[y+dy]&&grid[y+dy][x+dx]===0);
}
function randomOpenCell(grid,exclude=[]){
  const cells=[];
  for(let y=1;y<grid.length;y++)for(let x=1;x<grid.length;x++)if(grid[y][x]===0&&!exclude.some(p=>p.x===x&&p.y===y))cells.push({x,y});
  return cells[Math.floor(Math.random()*cells.length)];
}
function enemyStats(f){
  const k=floorKind(f);
  const mult=k==='創世神'?18:k==='大ボス'?5:k==='階層ボス'?3:k==='中ボス'?2:k==='小ボス'?1.7:1;
  const hp=Math.round((70+f*6)*mult);
  return {name:k,hp,maxHp:hp,atk:Math.round((5+f*.4)*mult),x:560,y:590,alive:true,flash:0};
}
function makeMonsters(){
  return Object.entries(MONSTER_DEFS).map(([id,d],i)=>({
    id,name:d.name,icon:d.icon,color:d.color,maxHp:d.hp,hp:d.hp,
    atk:d.atk+state.upgrades.atk*1.5,interval:d.interval,
    crit:d.crit,healer:!!d.healer,aoe:!!d.aoe,
    x:120+i*48,y:620+(i%2)*34,attackCd:Math.random()*d.interval,
    damage:0,healing:0,kills:0,alive:true,dash:0
  }));
}
function startRun(){
  state.inRun=true;
  state.floor=Math.max(1,state.maxFloor);
  state.hp=state.maxHp=150+state.upgrades.hp*18;
  state.skillPower=1+state.upgrades.skill*.12;
  save();setupFloor();
}
function setupFloor(){
  const maze=mazeGenerate(7);
  const player={x:1,y:1};
  const exit=randomOpenCell(maze,[player]);
  const chest=randomOpenCell(maze,[player,exit]);
  const enemy=randomOpenCell(maze,[player,exit,chest]);
  game={
    phase:'explore',paused:false,maze,player,visited:new Set(['1,1']),
    exit,chest,enemyCell:enemy,chestOpened:false,enemyDefeated:false,
    target:null,moveProgress:0,moveFrom:null,moveTo:null,
    monsters:makeMonsters(),enemy:null,
    particles:[],floats:[],shake:0,dps:0,dpsWindow:[],
    cooldown:{thunder:0,heal:0,barrier:0,burst:0},
    barrier:0,battleTime:0,lastStats:null
  };
  show('gameScreen');
  hideDirections();
  last=performance.now();
  if(raf)cancelAnimationFrame(raf);
  raf=requestAnimationFrame(loop);
  syncHud();
  maybeShowDirections();
  save();
}
function maybeShowDirections(){
  if(!game||game.phase!=='explore'||game.moveTo)return;
  const dirs=openNeighbors(game.maze,game.player.x,game.player.y);
  $('directionButtons').innerHTML=dirs.map(([label,dx,dy])=>`<button data-dx="${dx}" data-dy="${dy}">${label}</button>`).join('');
  $('choiceOverlay').classList.toggle('hidden',dirs.length<=1);
  if(dirs.length===1){
    const [,dx,dy]=dirs[0];
    setTimeout(()=>movePlayer(dx,dy),250);
  }
}
function hideDirections(){$('choiceOverlay').classList.add('hidden')}
function movePlayer(dx,dy){
  if(!game||game.phase!=='explore'||game.moveTo)return;
  hideDirections();
  game.moveFrom={...game.player};
  game.moveTo={x:game.player.x+dx,y:game.player.y+dy};
  game.moveProgress=0;
}
function enterCell(){
  game.player={...game.moveTo};
  game.visited.add(`${game.player.x},${game.player.y}`);
  game.moveTo=null;game.moveFrom=null;game.moveProgress=0;

  if(!game.enemyDefeated&&game.player.x===game.enemyCell.x&&game.player.y===game.enemyCell.y){
    startBattle();return;
  }
  if(!game.chestOpened&&game.player.x===game.chest.x&&game.player.y===game.chest.y){
    game.chestOpened=true;
    state.gold+=35+state.floor*3;
    game.floats.push({text:`+${35+state.floor*3}G`,x:360,y:300,vy:-50,life:1,max:1,color:'#ffd76a',size:36});
  }
  if(game.enemyDefeated&&game.player.x===game.exit.x&&game.player.y===game.exit.y){
    if(raf)cancelAnimationFrame(raf);showRewards();return;
  }
  maybeShowDirections();
}
function startBattle(){
  game.phase='battle';hideDirections();game.enemy=enemyStats(state.floor);game.battleTime=0;
  game.monsters.forEach((m,i)=>{m.x=120+i*44;m.y=610+(i%2)*36;m.attackCd=Math.random()*m.interval});
  burst(520,560,'#ffc77d',28);
}
function burst(x,y,color,count=16){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,s=80+Math.random()*180;
    game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+Math.random()*.45,max:.85,size:3+Math.random()*6,color});
  }
}
function floatText(text,x,y,color='#fff',size=30){
  game.floats.push({text,x,y,vy:-55,life:1,max:1,color,size});
}
function addDps(d){
  const t=performance.now()/1000;
  game.dpsWindow.push({t,d});
}
function monsterAct(m){
  if(!m.alive||!game.enemy?.alive)return;
  if(m.healer){
    const target=game.monsters.filter(x=>x.alive&&x.hp<x.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
    if(target){
      const h=Math.round(8*state.skillPower);
      target.hp=Math.min(target.maxHp,target.hp+h);m.healing+=h;
      floatText(`+${h}`,target.x,target.y-55,'#8dff9c',24);burst(target.x,target.y,'#8dff9c',10);
    }
    return;
  }
  m.dash=.18;
  const base=Math.max(1,Math.round(m.atk*(.85+Math.random()*.3)));
  const crit=Math.random()<m.crit;
  const dmg=crit?Math.round(base*1.8):base;
  game.enemy.hp-=dmg;m.damage+=dmg;addDps(dmg);
  floatText(crit?`CRIT ${dmg}`:`-${dmg}`,game.enemy.x,game.enemy.y-80-(Math.random()*45),crit?'#fff2a8':'#ffd76a',crit?34:28);
  burst(game.enemy.x,game.enemy.y-10,crit?'#fff1a4':'#ff9c54',crit?26:12);
  game.shake=Math.max(game.shake,crit?11:4);
}
function enemyAct(){
  const target=game.monsters.filter(x=>x.alive).sort((a,b)=>a.hp-b.hp)[0];
  if(!target){
    const dmg=Math.round(game.enemy.atk*(game.barrier>0?.45:1));
    state.hp-=dmg;floatText(`-${dmg}`,180,330,'#ff7777',32);game.shake=6;
    return;
  }
  const dmg=Math.max(1,Math.round(game.enemy.atk*(game.barrier>0?.45:1)));
  target.hp-=dmg;floatText(`-${dmg}`,target.x,target.y-58,'#ff7777',26);burst(target.x,target.y,'#ff5f6e',10);
  if(target.hp<=0){target.alive=false}
}
function finishBattle(){
  game.enemy.alive=false;game.enemyDefeated=true;state.streak++;state.gold+=20;
  game.lastStats=game.monsters.map(m=>({name:m.name,damage:Math.round(m.damage),healing:Math.round(m.healing),kills:m.kills}));
  game.phase='explore';game.enemy=null;
  game.monsters.forEach(m=>{m.hp=m.maxHp;m.alive=true});
  setTimeout(maybeShowDirections,450);
}
function defeat(){
  if(raf)cancelAnimationFrame(raf);
  const lost=Math.floor(state.gold*.5);state.gold-=lost;state.streak=0;state.inRun=false;save();
  showResult('DEFEAT','敗北',[`失ったゴールド：${lost}G`,`到達階：${state.floor}`]);
}
function update(dt){
  if(game.paused)return;
  game.barrier=Math.max(0,game.barrier-dt);
  for(const k in game.cooldown)game.cooldown[k]=Math.max(0,game.cooldown[k]-dt);

  if(game.phase==='explore'&&game.moveTo){
    game.moveProgress+=dt*2.6;
    if(game.moveProgress>=1)enterCell();
  }

  if(game.phase==='battle'){
    game.battleTime+=dt;
    for(const m of game.monsters){
      m.attackCd-=dt;
      m.dash=Math.max(0,m.dash-dt);
      if(m.attackCd<=0){m.attackCd=m.interval;monsterAct(m)}
    }
    game.enemy.attackCd=(game.enemy.attackCd??1.0)-dt;
    if(game.enemy.attackCd<=0){game.enemy.attackCd=1.05;enemyAct()}
    if(game.enemy.hp<=0)finishBattle();
    if(state.hp<=0){state.hp=0;defeat();return}
  }

  const now=performance.now()/1000;
  game.dpsWindow=game.dpsWindow.filter(x=>now-x.t<=3);
  game.dps=game.dpsWindow.reduce((s,x)=>s+x.d,0)/3;

  for(const p of game.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=250*dt}
  game.particles=game.particles.filter(x=>x.life>0);
  for(const f of game.floats){f.life-=dt;f.y+=f.vy*dt}
  game.floats=game.floats.filter(x=>x.life>0);
  game.shake=Math.max(0,game.shake-dt*18);
  syncHud();save();
}
function rr(x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);
  if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}
function bar(x,y,w,h,v,max,color){rr(x,y,w,h,h/2,'#09070c','#4a3556');rr(x,y,Math.max(0,w*(v/max)),h,h/2,color,null)}
function drawBg(){
  const g=ctx.createLinearGradient(0,0,0,980);g.addColorStop(0,'#1b1026');g.addColorStop(.5,'#0e0914');g.addColorStop(1,'#07040a');ctx.fillStyle=g;ctx.fillRect(0,0,720,980);
}
function cellToScreen(x,y){
  const size=78,ox=72,oy=270;
  return {x:ox+x*size,y:oy+y*size};
}
function drawMaze(){
  const n=game.maze.length,size=78,ox=72,oy=270;
  ctx.lineWidth=8;ctx.lineCap='round';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    if(game.maze[y][x]!==0)continue;
    const p=cellToScreen(x,y);
    const seen=game.visited.has(`${x},${y}`);
    ctx.fillStyle=seen?'#352244':'#21172a';
    rr(p.x-size/2,p.y-size/2,size-8,size-8,16,ctx.fillStyle,'#4d3860');
    for(const [,dx,dy] of openNeighbors(game.maze,x,y)){
      const nx=x+dx,ny=y+dy;if(nx<x||ny<y)continue;
      const q=cellToScreen(nx,ny);
      ctx.strokeStyle=seen||game.visited.has(`${nx},${ny}`)?'#463053':'#271b30';
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
    }
  }
  const miniX=540,miniY=72,miniS=18;
  rr(miniX-18,miniY-18,160,160,16,'rgba(8,5,12,.78)','#503963');
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(game.maze[y][x]===0){
    const seen=game.visited.has(`${x},${y}`);
    ctx.fillStyle=seen?'#8e64b1':'#2a1d33';ctx.fillRect(miniX+x*miniS,miniY+y*miniS,miniS-3,miniS-3);
  }
  ctx.fillStyle='#fff';ctx.fillRect(miniX+game.player.x*miniS+4,miniY+game.player.y*miniS+4,7,7);
}
function drawMarkers(){
  const pp=cellToScreen(game.player.x,game.player.y);
  let px=pp.x,py=pp.y;
  if(game.moveTo&&game.moveFrom){
    const a=cellToScreen(game.moveFrom.x,game.moveFrom.y),b=cellToScreen(game.moveTo.x,game.moveTo.y);
    px=a.x+(b.x-a.x)*game.moveProgress;py=a.y+(b.y-a.y)*game.moveProgress;
  }
  ctx.fillStyle='#3ecf65';ctx.beginPath();ctx.arc(px,py,18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.arc(px-6,py-4,2,0,Math.PI*2);ctx.arc(px+6,py-4,2,0,Math.PI*2);ctx.fill();

  if(!game.enemyDefeated){
    const p=cellToScreen(game.enemyCell.x,game.enemyCell.y);
    if(game.visited.has(`${game.enemyCell.x},${game.enemyCell.y}`)||Math.abs(game.player.x-game.enemyCell.x)+Math.abs(game.player.y-game.enemyCell.y)<=2){
      ctx.font='34px sans-serif';ctx.fillText('🧑‍⚔️',p.x-20,p.y+12);
    }
  }
  if(!game.chestOpened){
    const p=cellToScreen(game.chest.x,game.chest.y);
    if(game.visited.has(`${game.chest.x},${game.chest.y}`)||Math.abs(game.player.x-game.chest.x)+Math.abs(game.player.y-game.chest.y)<=1){
      ctx.font='32px sans-serif';ctx.fillText('🎁',p.x-18,p.y+10);
    }
  }
  const e=cellToScreen(game.exit.x,game.exit.y);
  ctx.font='32px sans-serif';ctx.fillText(game.enemyDefeated?'🚪':'❓',e.x-18,e.y+10);
}
function drawBattle(){
  ctx.fillStyle='rgba(7,4,10,.78)';ctx.fillRect(0,225,720,755);
  ctx.fillStyle='#f3c76f';ctx.font='900 26px sans-serif';ctx.fillText('BATTLE',32,270);
  ctx.fillStyle='#fff';ctx.font='900 21px sans-serif';ctx.fillText(game.enemy.name,32,310);
  bar(32,325,656,18,game.enemy.hp,game.enemy.maxHp,'#e45f66');
  ctx.fillStyle='#fff';ctx.font='800 15px sans-serif';ctx.fillText(`${Math.max(0,Math.ceil(game.enemy.hp))}/${game.enemy.maxHp}`,576,360);

  for(const m of game.monsters){
    const dx=m.dash>0?22:0;
    ctx.fillStyle=m.color;ctx.beginPath();ctx.arc(m.x+dx,m.y,20,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='800 12px sans-serif';ctx.fillText(m.name,m.x-28,m.y+38);
    bar(m.x-30,m.y+48,60,7,m.hp,m.maxHp,'#6bd27b');
  }
  ctx.fillStyle='#d7d1dd';ctx.beginPath();ctx.arc(game.enemy.x,game.enemy.y-40,22,0,Math.PI*2);ctx.fill();ctx.fillRect(game.enemy.x-18,game.enemy.y-18,36,65);
}
function drawTop(){
  rr(22,20,470,108,18,'rgba(10,6,14,.82)','#4b355a');
  ctx.fillStyle='#f3c76f';ctx.font='700 17px sans-serif';ctx.fillText(`第${state.floor}階`,42,52);
  ctx.fillStyle='#fff';ctx.font='900 23px sans-serif';ctx.fillText('魔王軍',42,88);
  bar(145,69,240,18,state.hp,state.maxHp,'#67d17b');
  ctx.fillStyle='#8de6ff';ctx.font='900 17px sans-serif';ctx.fillText(`DPS ${Math.round(game.dps)}`,400,87);
}
function drawFx(){
  for(const p of game.particles){ctx.globalAlpha=p.life/p.max;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}
  ctx.globalAlpha=1;
  for(const f of game.floats){ctx.globalAlpha=f.life/f.max;ctx.fillStyle=f.color;ctx.font=`900 ${f.size}px sans-serif`;ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y)}
  ctx.globalAlpha=1;ctx.textAlign='start';
}
function render(){
  ctx.save();
  ctx.translate(game.shake?(Math.random()-.5)*game.shake:0,game.shake?(Math.random()-.5)*game.shake:0);
  drawBg();drawTop();drawMaze();drawMarkers();
  if(game.phase==='battle')drawBattle();
  drawFx();ctx.restore();
  const map={thunder:'thunderCd',heal:'healCd',barrier:'barrierCd',burst:'burstCd'};
  for(const [k,id] of Object.entries(map))$(id).textContent=game.cooldown[k]>0?`${game.cooldown[k].toFixed(1)}秒`:'READY';
}
function loop(ts){
  const dt=Math.min(.05,(ts-last)/1000||0);last=ts;update(dt);if(!game)return;render();raf=requestAnimationFrame(loop);
}
function skill(id){
  if(!game||game.phase!=='battle'||game.cooldown[id]>0)return;
  if(id==='thunder'){const d=Math.round(40*state.skillPower);game.enemy.hp-=d;addDps(d);floatText(`⚡${d}`,game.enemy.x,game.enemy.y-120,'#9de6ff',34);burst(game.enemy.x,game.enemy.y,'#8ecbff',28);game.cooldown[id]=10}
  if(id==='heal'){const h=Math.round(36*state.skillPower);for(const m of game.monsters){m.hp=Math.min(m.maxHp,m.hp+h)}floatText(`+${h}`,180,560,'#8dff9c',34);game.cooldown[id]=14}
  if(id==='barrier'){game.barrier=6;game.cooldown[id]=16;burst(190,600,'#d5b5ff',24)}
  if(id==='burst'){let d=0;for(const m of game.monsters.filter(x=>x.alive)){const x=Math.round(m.atk*2.5*state.skillPower);d+=x;m.damage+=x}game.enemy.hp-=d;addDps(d);floatText(`🔥${d}`,game.enemy.x,game.enemy.y-130,'#ffb36b',38);burst(game.enemy.x,game.enemy.y,'#ff6f4f',40);game.shake=14;game.cooldown[id]=22}
}
function rewardSet(){
  const before=game.lastStats||[];
  return [
    {c:'red',t:'小さな軍団強化',d:'各魔物の攻撃力+3%',fn:()=>{for(const m of game.monsters)m.atk*=1.03},detail:()=>before.map(x=>`${x.name} ATK +3%`).join('<br>')},
    {c:'blue',t:'応急回復',d:'各魔物のHPを25%回復',fn:()=>{for(const m of game.monsters)m.hp=Math.min(m.maxHp,m.hp+m.maxHp*.25)},detail:()=>before.map(x=>`${x.name} HP +25%`).join('<br>')},
    {c:'purple',t:'魔力微増',d:'スキル威力+4%',fn:()=>{state.skillPower*=1.04},detail:()=>`魔王スキル威力 +4%`},
    {c:'gold',t:'ゴールド',d:`${55+state.floor*5}G獲得`,fn:()=>{state.gold+=55+state.floor*5},detail:()=>`${55+state.floor*5}G獲得`},
    {c:'black',t:'深淵契約',d:'最大HP-10%、攻撃力+12%',fn:()=>{state.maxHp=Math.round(state.maxHp*.9);state.hp=Math.min(state.hp,state.maxHp);for(const m of game.monsters)m.atk*=1.12},detail:()=>`最大HP -10%<br>各魔物 ATK +12%`}
  ].sort(()=>Math.random()-.5).slice(0,3);
}
function showRewards(){
  const stats=game.lastStats||[];
  const mvp=[...stats].sort((a,b)=>(b.damage+b.healing)-(a.damage+a.healing))[0];
  const rs=rewardSet();
  $('rewardChoices').innerHTML=`
    <div class="panel" style="margin-bottom:0">
      <h3>今回の戦績</h3>
      ${stats.map(x=>`<p>${x.name}：${x.damage}ダメージ / ${x.healing}回復</p>`).join('')}
      <p><b>MVP：${mvp?mvp.name:'—'}</b></p>
    </div>
    ${rs.map((r,i)=>`<button class="rewardCard ${r.c}" data-r="${i}"><b>${r.t}</b><span>${r.d}</span></button>`).join('')}`;
  $('rewardChoices').querySelectorAll('[data-r]').forEach((b,i)=>b.onclick=()=>{
    rs[i].fn();
    alert(`${rs[i].t}\n\n${rs[i].detail().replaceAll('<br>','\n')}`);
    state.floor++;state.maxFloor=Math.max(state.maxFloor,state.floor);save();
    const go=confirm('次の階へ進む？\nキャンセルで帰還。');
    if(go)setupFloor();else safeReturn();
  });
  show('rewardScreen');
}
function safeReturn(){
  if(raf)cancelAnimationFrame(raf);
  state.inRun=false;save();
  showResult('SAFE RETURN','帰還成功',[`到達階：${state.floor}`,`所持ゴールド：${state.gold}G`]);
}
function showResult(e,t,items){$('resultEye').textContent=e;$('resultTitle').textContent=t;$('resultBody').innerHTML=`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;show('resultScreen')}
function renderHome(){
  syncHud();
  const data=[['atk','軍団攻撃',state.upgrades.atk,100+state.upgrades.atk*120],['hp','最大HP',state.upgrades.hp,100+state.upgrades.hp*120],['skill','スキル威力',state.upgrades.skill,150+state.upgrades.skill*150]];
  $('upgradeList').innerHTML=data.map(([id,n,lv,c])=>`<div class="upgradeRow"><div><b>${n}</b><small>Lv.${lv}</small></div><button data-up="${id}" data-cost="${c}">${c}G</button></div>`).join('');
}
$('startBtn').onclick=startRun;
$('directionButtons').onclick=e=>{const b=e.target.closest('[data-dx]');if(b)movePlayer(+b.dataset.dx,+b.dataset.dy)};
$('upgradeList').onclick=e=>{const b=e.target.closest('[data-up]');if(!b)return;const id=b.dataset.up,c=+b.dataset.cost;if(state.gold<c){alert('ゴールド不足');return}state.gold-=c;state.upgrades[id]++;save();renderHome()};
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>skill(b.dataset.skill));
$('pauseBtn').onclick=()=>{if(!game)return;game.paused=!game.paused;$('pauseBtn').textContent=game.paused?'▶ 再開':'⏸ 一時停止'};
$('mapBtn').onclick=()=>{if(!game)return;$('modalBody').innerHTML='<h2>全体マップ</h2><p>Canvas右上のミニマップに、探索済みルートが表示される。</p>';$('modal').showModal()};
$('returnBtn').onclick=()=>{if(confirm('ここで帰還する？'))safeReturn()};
$('homeBtn').onclick=()=>{game=null;renderHome();show('homeScreen')};
$('menuBtn').onclick=()=>{$('modalBody').innerHTML=`<h2>メニュー</h2><p>最高到達階：${state.maxFloor}</p><p>リアルタイム保存中。</p><button id="resetBtn">セーブ初期化</button>`;$('modal').showModal();setTimeout(()=>$('resetBtn').onclick=()=>{if(confirm('本当に初期化する？')){localStorage.removeItem(KEY);location.reload()}},0)};
document.querySelectorAll('.closeBtn').forEach(b=>b.onclick=()=>$('modal').close());
window.addEventListener('beforeunload',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});

renderHome();syncHud();if(state.inRun)setupFloor();else show('homeScreen');
})();