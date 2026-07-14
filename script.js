(() => {
'use strict';

const KEY='abyssDominion_alpha_v06';

const DEFAULT={
  floor:1,maxFloor:1,gold:0,streak:0,inRun:false,
  maxHp:150,hp:150,skillPower:1,
  upgrades:{atk:0,hp:0,skill:0}
};

const MONSTER_DEFS={
  slime:{name:'スライム',color:'#41d469',hp:38,atk:5,interval:1.0,crit:.08,radius:18},
  goblin:{name:'ゴブリン',color:'#8c8052',hp:48,atk:8,interval:.78,crit:.15,radius:18},
  fairy:{name:'妖精',color:'#7cdef5',hp:30,atk:3,interval:1.55,crit:.05,radius:14,healer:true},
  dragon:{name:'ドラゴン',color:'#d85454',hp:120,atk:28,interval:5.6,crit:.2,radius:24}
};

const TILE=56;
const MAP_W=19;
const MAP_H=19;

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
function toast(text,ms=1000){
  const el=$('toast');el.textContent=text;el.classList.remove('hidden');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),ms);
}
function floorKind(f){
  if(f%1000===0)return '創世神';
  if(f%100===0)return '大ボス';
  if(f%50===0)return '階層ボス';
  if(f%10===0)return '中ボス';
  if(f%5===0)return '小ボス';
  return '勇者隊';
}
function makeDungeon(){
  const g=Array.from({length:MAP_H},()=>Array(MAP_W).fill(1));
  function carve(x,y){
    g[y][x]=0;
    const dirs=[[2,0],[-2,0],[0,2],[0,-2]].sort(()=>Math.random()-.5);
    for(const [dx,dy] of dirs){
      const nx=x+dx,ny=y+dy;
      if(nx>0&&ny>0&&nx<MAP_W-1&&ny<MAP_H-1&&g[ny][nx]===1){
        g[y+dy/2][x+dx/2]=0;
        carve(nx,ny);
      }
    }
  }
  carve(1,1);
  // add loops
  for(let i=0;i<18;i++){
    const x=1+Math.floor(Math.random()*(MAP_W-2));
    const y=1+Math.floor(Math.random()*(MAP_H-2));
    if(g[y][x]===1){
      const horiz=g[y][x-1]===0&&g[y][x+1]===0;
      const vert=g[y-1][x]===0&&g[y+1][x]===0;
      if(horiz||vert)g[y][x]=0;
    }
  }
  return g;
}
function openCells(grid){
  const out=[];
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++)if(grid[y][x]===0)out.push({x,y});
  return out;
}
function pickFar(cells,from,minDist=8,exclude=[]){
  const list=cells.filter(c=>Math.abs(c.x-from.x)+Math.abs(c.y-from.y)>=minDist&&!exclude.some(e=>e.x===c.x&&e.y===c.y));
  return clone(list[Math.floor(Math.random()*list.length)]||cells[cells.length-1]);
}
function bfs(grid,start,goal){
  const key=(x,y)=>`${x},${y}`;
  const q=[start],prev=new Map(),seen=new Set([key(start.x,start.y)]);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){
    const c=q.shift();
    if(c.x===goal.x&&c.y===goal.y)break;
    for(const [dx,dy] of dirs){
      const nx=c.x+dx,ny=c.y+dy,k=key(nx,ny);
      if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H||grid[ny][nx]===1||seen.has(k))continue;
      seen.add(k);prev.set(k,c);q.push({x:nx,y:ny});
    }
  }
  const path=[];let cur=goal;
  while(cur&&!(cur.x===start.x&&cur.y===start.y)){
    path.push(cur);cur=prev.get(key(cur.x,cur.y));
  }
  path.push(start);return path.reverse();
}
function enemyStats(f){
  const k=floorKind(f);
  const mult=k==='創世神'?18:k==='大ボス'?5:k==='階層ボス'?3:k==='中ボス'?2:k==='小ボス'?1.7:1;
  const hp=Math.round((80+f*6.5)*mult);
  return {name:k,hp,maxHp:hp,atk:Math.round((5+f*.42)*mult)};
}
function makeParty(){
  return Object.entries(MONSTER_DEFS).map(([id,d],i)=>({
    id,name:d.name,color:d.color,maxHp:d.hp,hp:d.hp,
    atk:d.atk+state.upgrades.atk*1.5,interval:d.interval,crit:d.crit,
    healer:!!d.healer,radius:d.radius,cd:Math.random()*d.interval,
    damage:0,healing:0,kills:0,alive:true,attackAnim:0,x:0,y:0
  }));
}
function startRun(){
  state.inRun=true;
  state.floor=Math.max(1,state.maxFloor);
  state.maxHp=150+state.upgrades.hp*18;
  state.hp=state.maxHp;
  state.skillPower=1+state.upgrades.skill*.12;
  save();setupFloor();
}
function setupFloor(){
  const map=makeDungeon();
  const cells=openCells(map);
  const start={x:1,y:1};
  const stairs=pickFar(cells,start,12,[start]);
  const chest1=pickFar(cells,start,7,[start,stairs]);
  const chest2=pickFar(cells,start,5,[start,stairs,chest1]);
  const enemyCells=[
    pickFar(cells,start,6,[start,stairs,chest1,chest2]),
    pickFar(cells,start,4,[start,stairs,chest1,chest2])
  ];

  game={
    phase:'explore',paused:false,map,
    player:{x:start.x,y:start.y,px:start.x,py:start.y,path:[],moveT:0},
    camera:{x:start.x*TILE,y:start.y*TILE},
    visited:new Set([`${start.x},${start.y}`]),
    discovered:new Set([`${start.x},${start.y}`]),
    stairs,
    chests:[
      {x:chest1.x,y:chest1.y,opened:false},
      {x:chest2.x,y:chest2.y,opened:false}
    ],
    enemies:enemyCells.map((p,i)=>({
      id:i,x:p.x,y:p.y,px:p.x,py:p.y,path:[],moveT:0,alive:true,alert:0,patrolCd:1+Math.random()*2,
      battle:null
    })),
    battleEnemy:null,
    party:makeParty(),
    cooldown:{thunder:0,heal:0,barrier:0,burst:0},
    barrier:0,
    particles:[],floats:[],shake:0,dps:0,dpsWindow:[],
    lastSummary:null,rewardShown:false
  };
  revealAround(start.x,start.y,3);
  show('gameScreen');
  last=performance.now();
  if(raf)cancelAnimationFrame(raf);
  raf=requestAnimationFrame(loop);
  syncHud();save();
}
function revealAround(cx,cy,r){
  for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
    if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&Math.abs(x-cx)+Math.abs(y-cy)<=r)game.discovered.add(`${x},${y}`);
  }
}
function screenToTile(sx,sy){
  const rect=canvas.getBoundingClientRect();
  const x=(sx-rect.left)*(canvas.width/rect.width);
  const y=(sy-rect.top)*(canvas.height/rect.height);
  const worldX=x+game.camera.x-canvas.width/2;
  const worldY=y+game.camera.y-canvas.height/2;
  return {x:Math.floor(worldX/TILE),y:Math.floor(worldY/TILE)};
}
function setPlayerPath(tx,ty){
  if(game.phase!=='explore')return;
  if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H||game.map[ty][tx]===1)return;
  game.player.path=bfs(game.map,{x:game.player.x,y:game.player.y},{x:tx,y:ty}).slice(1);
}
function updateMover(obj,dt,speed=4){
  if(!obj.path.length)return false;
  const target=obj.path[0];
  obj.moveT+=dt*speed;
  obj.px=obj.x+(target.x-obj.x)*Math.min(1,obj.moveT);
  obj.py=obj.y+(target.y-obj.y)*Math.min(1,obj.moveT);
  if(obj.moveT>=1){
    obj.x=target.x;obj.y=target.y;obj.px=obj.x;obj.py=obj.y;obj.path.shift();obj.moveT=0;
    return true;
  }
  return false;
}
function onPlayerStep(){
  game.visited.add(`${game.player.x},${game.player.y}`);
  revealAround(game.player.x,game.player.y,3);

  for(const c of game.chests){
    if(!c.opened&&c.x===game.player.x&&c.y===game.player.y){
      c.opened=true;
      const g=40+state.floor*3;state.gold+=g;
      floatText(`+${g}G`,canvas.width/2,260,'#ffd86f',38);
      burst(canvas.width/2,300,'#ffd86f',24);
      toast('宝箱発見！');
    }
  }

  if(game.player.x===game.stairs.x&&game.player.y===game.stairs.y){
    if(game.enemies.some(e=>e.alive)){
      toast('勇者が残っている…');
    }else{
      if(raf)cancelAnimationFrame(raf);
      showRewards();
      return;
    }
  }

  for(const e of game.enemies){
    if(e.alive&&e.x===game.player.x&&e.y===game.player.y){
      startBattle(e);return;
    }
  }
}
function enemyCanSee(e){
  const d=Math.abs(e.x-game.player.x)+Math.abs(e.y-game.player.y);
  if(d>5)return false;
  const path=bfs(game.map,{x:e.x,y:e.y},{x:game.player.x,y:game.player.y});
  return path.length-1===d;
}
function updateEnemies(dt){
  for(const e of game.enemies){
    if(!e.alive)continue;
    if(enemyCanSee(e)){
      e.alert=1;
      e.path=bfs(game.map,{x:e.x,y:e.y},{x:game.player.x,y:game.player.y}).slice(1);
    }else{
      e.alert=Math.max(0,e.alert-dt);
      e.patrolCd-=dt;
      if(e.patrolCd<=0&&!e.path.length){
        const dirs=[[1,0],[-1,0],[0,1],[0,-1]]
          .map(([dx,dy])=>({x:e.x+dx,y:e.y+dy}))
          .filter(p=>game.map[p.y]&&game.map[p.y][p.x]===0);
        if(dirs.length)e.path=[dirs[Math.floor(Math.random()*dirs.length)]];
        e.patrolCd=1.2+Math.random()*2;
      }
    }
    if(updateMover(e,dt,e.alert>0?4.5:2.2)){
      if(e.x===game.player.x&&e.y===game.player.y){startBattle(e);return}
    }
  }
}
function startBattle(enemy){
  game.phase='battle';
  game.player.path=[];
  enemy.path=[];
  game.battleEnemy=enemy;
  enemy.battle=enemyStats(state.floor);
  game.party.forEach((m,i)=>{
    m.hp=m.maxHp;m.alive=true;m.cd=Math.random()*m.interval;
    m.x=180+(i%2)*70;m.y=610+Math.floor(i/2)*75;m.damage=0;m.healing=0;m.attackAnim=0;
  });
  toast('勇者隊と遭遇！');
  burst(520,540,'#ffc76e',28);
}
function finishBattle(){
  const e=game.battleEnemy;
  e.alive=false;
  game.phase='explore';
  game.battleEnemy=null;
  state.streak++;
  state.gold+=20;
  game.lastSummary=game.party.map(m=>({name:m.name,damage:Math.round(m.damage),healing:Math.round(m.healing)}));
  toast('勝利！');
}
function defeat(){
  if(raf)cancelAnimationFrame(raf);
  const lost=Math.floor(state.gold*.5);state.gold-=lost;state.streak=0;state.inRun=false;save();
  showResult('DEFEAT','敗北',[`失ったゴールド：${lost}G`,`到達階：${state.floor}`]);
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
  game.dpsWindow.push({t:performance.now()/1000,d});
}
function partyAct(m){
  if(!game.battleEnemy)return;
  const b=game.battleEnemy.battle;
  if(m.healer){
    const target=game.party.filter(x=>x.alive&&x.hp<x.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
    if(target){
      const h=Math.round(8*state.skillPower);
      target.hp=Math.min(target.maxHp,target.hp+h);m.healing+=h;
      floatText(`+${h}`,target.x,target.y-45,'#8dff9c',24);burst(target.x,target.y,'#8dff9c',8);
    }
    return;
  }
  m.attackAnim=.18;
  const base=Math.max(1,Math.round(m.atk*(.85+Math.random()*.3)));
  const crit=Math.random()<m.crit;
  const dmg=crit?Math.round(base*1.8):base;
  b.hp-=dmg;m.damage+=dmg;addDps(dmg);
  floatText(crit?`CRIT ${dmg}`:`-${dmg}`,525,500-Math.random()*45,crit?'#fff2a8':'#ffd76a',crit?34:28);
  burst(525,545,crit?'#fff1a4':'#ff9c54',crit?24:11);
  game.shake=Math.max(game.shake,crit?10:4);
}
function enemyAct(){
  const target=game.party.filter(x=>x.alive).sort((a,b)=>a.hp-b.hp)[0];
  if(target){
    const dmg=Math.max(1,Math.round(game.battleEnemy.battle.atk*(game.barrier>0?.45:1)));
    target.hp-=dmg;
    floatText(`-${dmg}`,target.x,target.y-40,'#ff7777',25);burst(target.x,target.y,'#ff5f6e',8);
    if(target.hp<=0)target.alive=false;
  }else{
    const dmg=Math.max(1,Math.round(game.battleEnemy.battle.atk*(game.barrier>0?.45:1)));
    state.hp-=dmg;floatText(`-${dmg}`,160,310,'#ff7777',30);
  }
}
function updateBattle(dt){
  const b=game.battleEnemy.battle;
  for(const m of game.party){
    m.cd-=dt;m.attackAnim=Math.max(0,m.attackAnim-dt);
    if(m.alive&&m.cd<=0){m.cd=m.interval;partyAct(m)}
  }
  b.cd=(b.cd??1.0)-dt;
  if(b.cd<=0){b.cd=1.05;enemyAct()}
  if(b.hp<=0)finishBattle();
  if(state.hp<=0){state.hp=0;defeat()}
}
function update(dt){
  if(game.paused)return;
  game.barrier=Math.max(0,game.barrier-dt);
  for(const k in game.cooldown)game.cooldown[k]=Math.max(0,game.cooldown[k]-dt);

  if(game.phase==='explore'){
    if(updateMover(game.player,dt,4.8))onPlayerStep();
    updateEnemies(dt);
    game.camera.x+=(game.player.px*TILE-game.camera.x)*Math.min(1,dt*6);
    game.camera.y+=(game.player.py*TILE-game.camera.y)*Math.min(1,dt*6);
  }else if(game.phase==='battle'){
    updateBattle(dt);
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
function bar(x,y,w,h,v,max,color){
  rr(x,y,w,h,h/2,'#09070c','#4a3556');
  rr(x,y,Math.max(0,w*(v/max)),h,h/2,color,null);
}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,980);g.addColorStop(0,'#1b1026');g.addColorStop(.55,'#0d0813');g.addColorStop(1,'#07040a');ctx.fillStyle=g;ctx.fillRect(0,0,720,980);
}
function drawTile(tx,ty,val){
  const sx=tx*TILE-game.camera.x+canvas.width/2;
  const sy=ty*TILE-game.camera.y+canvas.height/2;
  if(sx<-TILE||sy<-TILE||sx>canvas.width+TILE||sy>canvas.height+TILE)return;
  const key=`${tx},${ty}`;
  const seen=game.discovered.has(key);
  if(val===1){
    ctx.fillStyle=seen?'#22172b':'#100b15';
    ctx.fillRect(sx,sy,TILE,TILE);
    if(seen){
      ctx.fillStyle='#2f203a';ctx.fillRect(sx+5,sy+5,TILE-10,TILE-10);
      ctx.fillStyle='rgba(255,255,255,.04)';ctx.fillRect(sx+10,sy+10,12,12);
    }
  }else{
    ctx.fillStyle=seen?'#3a2947':'#16101d';
    ctx.fillRect(sx,sy,TILE,TILE);
    if(seen){
      ctx.strokeStyle='rgba(255,255,255,.06)';ctx.strokeRect(sx,sy,TILE,TILE);
      if((tx+ty)%5===0){ctx.fillStyle='#5b3d69';ctx.fillRect(sx+7,sy+9,6,6)}
    }
  }
}
function drawDungeon(){
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)drawTile(x,y,game.map[y][x]);
  for(const c of game.chests){
    if(c.opened)continue;
    const key=`${c.x},${c.y}`;if(!game.discovered.has(key))continue;
    const sx=c.x*TILE-game.camera.x+360,sy=c.y*TILE-game.camera.y+490;
    ctx.font='34px sans-serif';ctx.fillText('🎁',sx+10,sy+38);
  }
  {
    const key=`${game.stairs.x},${game.stairs.y}`;
    if(game.discovered.has(key)){
      const sx=game.stairs.x*TILE-game.camera.x+360,sy=game.stairs.y*TILE-game.camera.y+490;
      ctx.font='34px sans-serif';ctx.fillText('🪜',sx+10,sy+38);
    }
  }
  for(const e of game.enemies){
    if(!e.alive)continue;
    const key=`${e.x},${e.y}`;
    if(!game.discovered.has(key)&&Math.abs(e.x-game.player.x)+Math.abs(e.y-game.player.y)>4)continue;
    const sx=e.px*TILE-game.camera.x+360,sy=e.py*TILE-game.camera.y+490;
    ctx.font='32px sans-serif';ctx.fillText('🧑‍⚔️',sx+10,sy+38);
    if(e.alert>0){ctx.fillStyle='#ffdc6b';ctx.font='900 28px sans-serif';ctx.fillText('!',sx+18,sy-4)}
  }
  const px=game.player.px*TILE-game.camera.x+360,py=game.player.py*TILE-game.camera.y+490;
  ctx.fillStyle='#41d469';ctx.beginPath();ctx.arc(px+TILE/2,py+TILE/2,18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.arc(px+TILE/2-6,py+TILE/2-4,2,0,Math.PI*2);ctx.arc(px+TILE/2+6,py+TILE/2-4,2,0,Math.PI*2);ctx.fill();
}
function drawMiniMap(){
  const ox=500,oy=42,s=9;
  rr(ox-14,oy-14,192,192,14,'rgba(7,4,10,.82)','#4b355a');
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const key=`${x},${y}`;
    if(!game.discovered.has(key))continue;
    ctx.fillStyle=game.map[y][x]===0?'#8a62ac':'#25192d';
    ctx.fillRect(ox+x*s,oy+y*s,s-1,s-1);
  }
  ctx.fillStyle='#fff';ctx.fillRect(ox+game.player.x*s+2,oy+game.player.y*s+2,5,5);
}
function drawTopUI(){
  rr(20,20,450,110,18,'rgba(10,6,14,.84)','#4b355a');
  ctx.fillStyle='#f3c76f';ctx.font='700 17px sans-serif';ctx.fillText(`第${state.floor}階`,40,52);
  ctx.fillStyle='#fff';ctx.font='900 23px sans-serif';ctx.fillText('魔王軍',40,88);
  bar(140,69,230,18,state.hp,state.maxHp,'#67d17b');
  ctx.fillStyle='#8de6ff';ctx.font='900 17px sans-serif';ctx.fillText(`DPS ${Math.round(game.dps)}`,385,87);
}
function drawBattle(){
  ctx.fillStyle='rgba(7,4,10,.84)';ctx.fillRect(0,230,720,750);
  const b=game.battleEnemy.battle;
  ctx.fillStyle='#f3c76f';ctx.font='900 26px sans-serif';ctx.fillText('BATTLE',32,278);
  ctx.fillStyle='#fff';ctx.font='900 21px sans-serif';ctx.fillText(b.name,32,320);
  bar(32,335,656,18,b.hp,b.maxHp,'#e45f66');
  ctx.fillStyle='#fff';ctx.font='800 15px sans-serif';ctx.fillText(`${Math.max(0,Math.ceil(b.hp))}/${b.maxHp}`,570,370);

  for(const m of game.party){
    const x=m.x+(m.attackAnim>0?22:0),y=m.y;
    ctx.fillStyle=m.color;ctx.beginPath();ctx.arc(x,y,m.radius,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='800 12px sans-serif';ctx.fillText(m.name,x-28,y+35);
    bar(x-30,y+44,60,7,m.hp,m.maxHp,'#6bd27b');
  }
  ctx.fillStyle='#d7d1dd';ctx.beginPath();ctx.arc(525,530,22,0,Math.PI*2);ctx.fill();ctx.fillRect(507,552,36,65);
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
  drawBackground();drawDungeon();drawMiniMap();drawTopUI();
  if(game.phase==='battle')drawBattle();
  drawFx();ctx.restore();

  const ids={thunder:'thunderCd',heal:'healCd',barrier:'barrierCd',burst:'burstCd'};
  for(const [k,id] of Object.entries(ids))$(id).textContent=game.cooldown[k]>0?`${game.cooldown[k].toFixed(1)}秒`:'READY';
}
function loop(ts){
  const dt=Math.min(.05,(ts-last)/1000||0);last=ts;update(dt);if(!game)return;render();raf=requestAnimationFrame(loop);
}
function skill(id){
  if(!game||game.phase!=='battle'||game.cooldown[id]>0)return;
  const b=game.battleEnemy.battle;
  if(id==='thunder'){
    const d=Math.round(40*state.skillPower);b.hp-=d;addDps(d);floatText(`⚡${d}`,525,455,'#9de6ff',34);burst(525,540,'#8ecbff',28);game.cooldown[id]=10;
  }
  if(id==='heal'){
    const h=Math.round(36*state.skillPower);for(const m of game.party){m.hp=Math.min(m.maxHp,m.hp+h)}floatText(`+${h}`,220,535,'#8dff9c',34);game.cooldown[id]=14;
  }
  if(id==='barrier'){game.barrier=6;game.cooldown[id]=16;burst(210,590,'#d5b5ff',24)}
  if(id==='burst'){
    let d=0;for(const m of game.party.filter(x=>x.alive)){const x=Math.round(m.atk*2.4*state.skillPower);d+=x;m.damage+=x}b.hp-=d;addDps(d);floatText(`🔥${d}`,525,450,'#ffb36b',38);burst(525,540,'#ff6f4f',40);game.shake=14;game.cooldown[id]=22;
  }
}
function rewardSet(){
  return [
    {c:'red',t:'軍団強化',d:'各魔物の攻撃力+2%',apply:()=>game.party.forEach(m=>m.atk*=1.02),detail:()=>game.party.map(m=>`${m.name}: ATK +2%`).join('\n')},
    {c:'blue',t:'応急回復',d:'各魔物のHPを20%回復',apply:()=>game.party.forEach(m=>m.hp=Math.min(m.maxHp,m.hp+m.maxHp*.2)),detail:()=>game.party.map(m=>`${m.name}: HP +20%`).join('\n')},
    {c:'purple',t:'魔力微増',d:'スキル威力+3%',apply:()=>state.skillPower*=1.03,detail:()=>`魔王スキル威力 +3%`},
    {c:'gold',t:'ゴールド',d:`${50+state.floor*4}G獲得`,apply:()=>state.gold+=50+state.floor*4,detail:()=>`${50+state.floor*4}G獲得`},
    {c:'black',t:'深淵契約',d:'最大HP-8%、攻撃力+10%',apply:()=>{state.maxHp=Math.round(state.maxHp*.92);state.hp=Math.min(state.hp,state.maxHp);game.party.forEach(m=>m.atk*=1.1)},detail:()=>`最大HP -8%\n各魔物 ATK +10%`}
  ].sort(()=>Math.random()-.5).slice(0,3);
}
function showRewards(){
  if(game.rewardShown)return;
  game.rewardShown=true;
  const summary=game.lastSummary||game.party.map(m=>({name:m.name,damage:m.damage,healing:m.healing}));
  const mvp=[...summary].sort((a,b)=>(b.damage+b.healing)-(a.damage+a.healing))[0];
  $('battleSummary').innerHTML=`<div class="summaryCard"><h3>今回の戦績</h3>${summary.map(x=>`<p>${x.name}：${x.damage}ダメージ / ${x.healing}回復</p>`).join('')}<p><b>MVP：${mvp?mvp.name:'—'}</b></p></div>`;
  const rewards=rewardSet();
  $('rewardChoices').innerHTML=rewards.map((r,i)=>`<button class="rewardCard ${r.c}" data-r="${i}"><b>${r.t}</b><span>${r.d}</span></button>`).join('');
  let locked=false;
  $('rewardChoices').querySelectorAll('[data-r]').forEach((btn,i)=>btn.onclick=()=>{
    if(locked)return;
    locked=true;
    $('rewardChoices').querySelectorAll('button').forEach(b=>b.disabled=true);
    rewards[i].apply();
    alert(`${rewards[i].t}\n\n${rewards[i].detail()}`);
    state.floor++;
    state.maxFloor=Math.max(state.maxFloor,state.floor);
    save();
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
function showResult(e,t,items){
  $('resultEye').textContent=e;$('resultTitle').textContent=t;
  $('resultBody').innerHTML=`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  show('resultScreen');
}
function renderHome(){
  syncHud();
  const list=[
    ['atk','軍団攻撃',state.upgrades.atk,100+state.upgrades.atk*120],
    ['hp','最大HP',state.upgrades.hp,100+state.upgrades.hp*120],
    ['skill','スキル威力',state.upgrades.skill,150+state.upgrades.skill*150]
  ];
  $('upgradeList').innerHTML=list.map(([id,name,lv,c])=>`<div class="upgradeRow"><div><b>${name}</b><small>Lv.${lv}</small></div><button data-up="${id}" data-cost="${c}">${c}G</button></div>`).join('');
}

canvas.addEventListener('pointerdown',e=>{
  if(!game||game.phase!=='explore')return;
  const t=screenToTile(e.clientX,e.clientY);
  setPlayerPath(t.x,t.y);
});
$('startBtn').onclick=startRun;
$('upgradeList').onclick=e=>{
  const b=e.target.closest('[data-up]');if(!b)return;
  const id=b.dataset.up,c=+b.dataset.cost;
  if(state.gold<c){alert('ゴールド不足');return}
  state.gold-=c;state.upgrades[id]++;save();renderHome();
};
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>skill(b.dataset.skill));
$('pauseBtn').onclick=()=>{if(!game)return;game.paused=!game.paused;$('pauseBtn').textContent=game.paused?'▶ 再開':'⏸ 一時停止'};
$('centerBtn').onclick=()=>{if(!game)return;game.camera.x=game.player.px*TILE;game.camera.y=game.player.py*TILE};
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

renderHome();syncHud();if(state.inRun)setupFloor();else show('homeScreen');
})();