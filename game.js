'use strict';

(() => {
  const C = window.CRASH_CONTENT;
  const L = window.CRASH_LEVELS;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const canvas = $('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const W=1280,H=720,GROUND=620;

  const images = {};
  const imageSources = {
    birds:'birds-sprites.png', pigs:'pigs-sprites.png', materials:'materials.png',
    field:'bg-field.png', factory:'bg-factory.png', storm:'bg-storm.png', cavern:'bg-cavern.png', sky:'bg-sky.png', citadel:'bg-citadel.png', launcher:'launcher.png'
  };
  Object.entries(imageSources).forEach(([k,src])=>{ const im=new Image(); im.src=src; images[k]=im; });

  const sounds = {
    launch:new Audio('launch.wav'), impact:new Audio('impact.wav'), shatter:new Audio('shatter.wav'), victory:new Audio('victory.wav'), boss:new Audio('boss-hit.wav')
  };
  Object.values(sounds).forEach(a=>{ a.preload='auto'; a.volume=.62; });

  const defaultSave = () => ({
    version:2, coins:2500, capsules:3, sound:true,
    settings:{music:true,sfx:true,musicVolume:.55,sfxVolume:.62,aim:true,reducedMotion:false,physicsDebug:false}, owner:false, daily:null,
    progress:{bird:1,pig:1}, completed:{bird:{},pig:{}}, stars:{bird:{},pig:{}},
    inventory:{bird:{},pig:{}}, infinite:{bird:{'bird-0':true},pig:{'pig-0':true}},
    awarded:{}, rewards:[], bestEndless:{bird:0,pig:0}, achievements:{claimed:{}}, stats:{clears:0,stars:0,blocks:0,bosses:0,abilities:0}
  });
  let save;
  try { save = Object.assign(defaultSave(), JSON.parse(localStorage.getItem('crashflock-save')||'{}')); }
  catch { save = defaultSave(); }
  // nested migration safety
  save.progress={...defaultSave().progress,...(save.progress||{})};
  save.completed={bird:{...(save.completed?.bird||{})},pig:{...(save.completed?.pig||{})}};
  save.stars={bird:{...(save.stars?.bird||{})},pig:{...(save.stars?.pig||{})}};
  save.inventory={bird:{...(save.inventory?.bird||{})},pig:{...(save.inventory?.pig||{})}};
  save.infinite={bird:{'bird-0':true,...(save.infinite?.bird||{})},pig:{'pig-0':true,...(save.infinite?.pig||{})}};
  save.awarded=save.awarded||{}; save.rewards=save.rewards||[]; save.bestEndless=save.bestEndless||{bird:0,pig:0};
  save.settings={...defaultSave().settings,...(save.settings||{})}; if(save.sound===false){save.settings.sfx=false;}
  save.achievements={claimed:{...(save.achievements?.claimed||{})}}; save.stats={...defaultSave().stats,...(save.stats||{})}; save.owner=!!save.owner;

  function persist(){ try{localStorage.setItem('crashflock-save',JSON.stringify(save));}catch{} updateWallet(); }
  function updateWallet(){ $('#coinCount').textContent=Math.floor(save.coins).toLocaleString(); $('#capsuleCount').textContent=save.capsules; $('#soundBtn').textContent=save.settings.sfx?'SFX ON':'SFX OFF'; $('#ownerTopBtn')?.classList.toggle('owner-hidden',!save.owner); }
  updateWallet();

  function playSound(name){ if(!save.settings.sfx) return; const a=sounds[name]; if(!a) return; try{ a.volume=save.settings.sfxVolume; a.currentTime=0; a.play().catch(()=>{}); }catch{} }


  let audioCtx=null,musicTimer=null,musicStep=0;
  const musicSets={menu:[110,146.83,164.81,220],field:[130.81,164.81,196,261.63],factory:[98,123.47,146.83,196],storm:[92.5,116.54,138.59,185],cavern:[82.41,110,130.81,164.81],sky:[146.83,196,220,293.66],citadel:[110,138.59,164.81,220]};
  function ensureAudio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}
  function musicMood(){return currentScreen==='gameScreen'?(level?.theme||'field'):'menu';}
  function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=null;}}
  function musicPulse(){
    if(!save.settings.music||!audioCtx)return;
    const notes=musicSets[musicMood()]||musicSets.menu,now=audioCtx.currentTime,root=notes[musicStep%notes.length],gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=1200;gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,save.settings.musicVolume*.045),now+.16);gain.gain.exponentialRampToValueAtTime(.0001,now+1.45);
    filter.connect(gain);gain.connect(audioCtx.destination);
    for(const [f,type,det] of [[root,'sine',0],[root*1.5,'triangle',-4],[root*2,'sine',3]]){const o=audioCtx.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=det;o.connect(filter);o.start(now);o.stop(now+1.5);}
    musicStep++;
  }
  function syncMusic(){stopMusic();if(!save.settings.music)return;ensureAudio();musicPulse();musicTimer=setInterval(musicPulse,1250);}
  document.addEventListener('pointerdown',()=>{if(save.settings.music){ensureAudio();if(!musicTimer)syncMusic();}},{once:true});

  let currentScreen='homeScreen';
  function showScreen(id){
    $$('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
    currentScreen=id;
    if(id==='homeScreen') renderHome();
    if(id==='rosterScreen') renderRoster();
    if(id==='capsuleScreen') renderCapsules();
    if(id==='settingsScreen') renderSettings();
    if(id==='challengesScreen') renderChallenges();
    if(id==='ownerScreen') renderOwner();
    syncMusic();
  }
  function renderHome(){ updateWallet(); }

  let campaignSide='bird', rosterSide='bird';
  function sideTitle(side){ return side==='bird'?'Bird':'Pig'; }
  function isLevelUnlocked(side,n){ return n<=Math.max(1,save.progress[side]||1); }
  function isCharUnlocked(side,char){ return char.unlockLevel===0 || (save.progress[side]-1)>=char.unlockLevel; }
  function charCopies(side,char){ return save.inventory[side][char.id]||0; }
  function isInfinite(side,char){ return !!save.infinite[side][char.id]; }

  function openCampaign(side){ campaignSide=side; showScreen('campaignScreen'); renderCampaign(); }
  function renderCampaign(){
    const side=campaignSide;
    $('#campaignEyebrow').textContent=`${sideTitle(side).toUpperCase()} SIDE / 200 LEVELS`;
    $('#campaignTitle').textContent=`${sideTitle(side)} Campaign`;
    $('#switchSideBtn').textContent=`SWITCH TO ${side==='bird'?'PIG':'BIRD'} SIDE`;
    const grid=$('#storyGrid'); grid.innerHTML='';
    for(let s=1;s<=10;s++){
      const first=(s-1)*20+1, last=s*20, unlocked=isLevelUnlocked(side,first);
      const cleared=Object.keys(save.completed[side]).filter(k=>+k>=first&&+k<=last&&save.completed[side][k]).length;
      const theme=C.THEMES[(s-1)%C.THEMES.length];
      const b=document.createElement('button'); b.type='button'; b.className=`story-card ${unlocked?'':'locked'} ${save.progress[side]>=first&&save.progress[side]<=last?'current':''}`;
      b.innerHTML=`<div class="art" style="background-image:url('bg-${theme}.png')"></div><div class="body"><b>STORY ${s}: ${C.STORY_NAMES[side][s-1]}</b><small>${cleared}/20 cleared · bosses at 5, 10, 15, 20</small></div>`;
      b.disabled=!unlocked; b.addEventListener('click',()=>openStory(s)); grid.appendChild(b);
    }
  }
  function openStory(story){
    const side=campaignSide, first=(story-1)*20+1;
    $('#levelPanel').classList.remove('hidden');
    $('#storyLabel').textContent=`STORY ${story} / LEVELS ${first}-${first+19}`;
    $('#storyTitle').textContent=C.STORY_NAMES[side][story-1];
    $('#storyIntro').textContent=C.STORY_INTROS[side][story-1];
    const grid=$('#levelGrid'); grid.innerHTML='';
    for(let local=1;local<=20;local++){
      const n=first+local-1, level=L.generateLevel(side,n), unlocked=isLevelUnlocked(side,n);
      const b=document.createElement('button'); b.type='button';
      b.className=`level-btn ${level.type==='boss'?'boss':level.type==='major'?'major':level.type==='final'?'final':''} ${unlocked?'':'locked'} ${save.completed[side][n]?'complete':''}`;
      b.disabled=!unlocked;
      b.innerHTML=`${local}<span>${level.type==='regular'?'LEVEL':level.type.toUpperCase()}</span>`;
      b.addEventListener('click',()=>requestCampaignLevel(side,n)); grid.appendChild(b);
    }
    $('#levelPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function showModal({kicker='',title='',body='',actions=[]}){
    $('#modalKicker').textContent=kicker; $('#modalTitle').textContent=title;
    $('#modalBody').innerHTML=body; const box=$('#modalActions'); box.innerHTML='';
    actions.forEach((a,i)=>{ const b=document.createElement('button'); b.type='button'; b.className=a.kind==='secondary'?'secondary':'primary'; b.textContent=a.label; b.addEventListener('click',()=>{ $('#modal').classList.add('hidden'); a.onClick?.(); }); box.appendChild(b); });
    $('#modal').classList.remove('hidden');
  }

  function requestCampaignLevel(side,n){
    const level=L.generateLevel(side,n);
    const local=level.local;
    const lines=[];
    if(local===1) lines.push(`<div class="cutscene-strip"><div class="cutscene-frame" style="background-image:url('bg-${level.theme}.png')"><b>STORY ${level.story}</b><span>${side==='bird'?'The flock enters new territory.':'The rebellion pushes into new territory.'}</span></div><div class="cutscene-frame" style="background-image:url('bg-${level.theme}.png')"><b>${C.STORY_NAMES[side][level.story-1]}</b><span>${C.STORY_INTROS[side][level.story-1]}</span></div></div>`);
    if(level.type!=='regular') lines.push(`<p>${level.type==='final'?'The story ends here. This boss has multiple exposed systems and no single-shot shortcut.':level.type==='major'?'A major defender blocks the route. Break every weak point.':'A field commander has entered the fight.'}</p>`);
    if(local%10===0){ const ch=C.ROSTERS[side][local===20?level.story*2:Math.min(20,Math.floor(n/10))]; if(ch) lines.push(`<p>Clear this level to discover <strong>${ch.name}</strong>.</p>`); }
    if(lines.length){ showModal({kicker:`${sideTitle(side).toUpperCase()} SIDE · STORY ${level.story}`,title:level.title,body:lines.join(''),actions:[{label:'START LEVEL',onClick:()=>startGameLevel(level,{mode:'campaign'})},{label:'BACK',kind:'secondary'}]}); }
    else startGameLevel(level,{mode:'campaign'});
  }

  // GAME STATE
  let level=null, modeState=null, running=false, lastTime=0, raf=0;
  let blocks=[], targets=[], cores=[], boss=null, projectiles=[], particles=[];
  let shotIndex=0, score=0, selectedCharIndex=0, usedCopies={}, dragging=false, dragPos={x:L.ORIGIN.x,y:L.ORIGIN.y};
  let shotActive=false, abilityUsed=false, resultPending=false, cameraShake=0, attemptBlocksBroken=0, attemptAbilities=0;
  const projectileRadius=23;

  function cloneLevel(src){ return JSON.parse(JSON.stringify(src)); }
  function blockDef(mat){ return C.BLOCK_BY_ID[mat]||C.BLOCK_BY_ID.wood; }
  function blockHp(mat){ return blockDef(mat).hp; }
  function startGameLevel(src, opts={mode:'campaign'}){
    level=cloneLevel(src); modeState={...(opts||{}), mode:opts.mode||'campaign'};
    blocks=level.blocks.map(b=>({...b,hp:b.hp||blockHp(b.mat),vx:0,vy:0,rotation:0,av:0,dead:false,landed:false}));
    targets=level.targets.map(t=>({...t,vx:0,vy:0,landed:false,dead:false})); cores=level.cores.map(c=>({...c,dead:false}));
    boss=level.boss?cloneLevel(level.boss):null;
    if(boss) boss.weak=boss.weak.map(w=>({...w,alive:true}));
    projectiles=[]; particles=[]; shotIndex=0; score=0; usedCopies={}; shotActive=false; abilityUsed=false; resultPending=false; dragging=false; cameraShake=0; attemptBlocksBroken=0; attemptAbilities=0;
    const roster=C.ROSTERS[level.side]; selectedCharIndex=Math.min(selectedCharIndex,roster.length-1);
    if(!isCharAvailable(roster[selectedCharIndex])) selectedCharIndex=0;
    showScreen('gameScreen');
    $('#hudMode').textContent=(modeState.mode==='campaign'?`${sideTitle(level.side).toUpperCase()} CAMPAIGN`:modeState.mode.toUpperCase());
    $('#hudTitle').textContent=level.type==='regular'?`${level.title} · ${blockDef(level.mechanic).label}`:level.title; $('#canvasHint').classList.remove('hidden');
    if(boss){ $('#bossBar').classList.remove('hidden'); $('#bossName').textContent=boss.name.toUpperCase(); } else $('#bossBar').classList.add('hidden');
    updateGameHud(); running=true; lastTime=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  }

  function isCharAvailable(ch){
    if(!isCharUnlocked(level?.side||ch.side,ch)) return false;
    if(isInfinite(ch.side,ch)) return true;
    return charCopies(ch.side,ch) - (usedCopies[ch.id]||0) > 0;
  }
  function getSelectedChar(){ return C.ROSTERS[level.side][selectedCharIndex]||C.ROSTERS[level.side][0]; }
  function updateGameHud(){
    $('#scoreText').textContent=Math.round(score).toLocaleString(); $('#twoStarText').textContent=(level?.stars?.[1]||0).toLocaleString(); $('#threeStarText').textContent=(level?.stars?.[2]||0).toLocaleString(); $('#shotsText').textContent=`${shotIndex}/${level?.birds||0}`;
    const ch=getSelectedChar(); $('#loadedName').textContent=ch.name; $('#loadedAbility').textContent=C.ABILITIES[ch.ability].label;
    $('#abilityBtn').disabled=!shotActive||abilityUsed;
    $('#abilityBtn').textContent=abilityUsed?'ABILITY USED':'USE ABILITY';
    const dots=$('#shotDots'); dots.innerHTML='';
    if(level) for(let i=0;i<level.birds;i++){ const d=document.createElement('i'); d.className=`shot-dot ${i<shotIndex?'used':''}`; dots.appendChild(d); }
    if(boss){ $('#bossHealth').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`; }
  }

  function canvasPoint(ev){
    const r=canvas.getBoundingClientRect(); return {x:(ev.clientX-r.left)*W/r.width,y:(ev.clientY-r.top)*H/r.height};
  }
  canvas.addEventListener('pointerdown',ev=>{
    if(!running||shotActive||resultPending||shotIndex>=level.birds) return;
    const p=canvasPoint(ev); if(Math.hypot(p.x-L.ORIGIN.x,p.y-L.ORIGIN.y)>95) return;
    dragging=true; dragPos=p; canvas.setPointerCapture?.(ev.pointerId); ev.preventDefault();
  });
  canvas.addEventListener('pointermove',ev=>{
    if(!dragging) return; const p=canvasPoint(ev); const dx=p.x-L.ORIGIN.x,dy=p.y-L.ORIGIN.y; const dist=Math.hypot(dx,dy),max=185;
    const s=dist>max?max/dist:1; dragPos={x:L.ORIGIN.x+dx*s,y:L.ORIGIN.y+dy*s}; ev.preventDefault();
  });
  canvas.addEventListener('pointerup',ev=>{ if(!dragging) return; dragging=false; fireFromDrag(); ev.preventDefault(); });

  function fireFromDrag(){
    const dx=L.ORIGIN.x-dragPos.x,dy=L.ORIGIN.y-dragPos.y; const pull=Math.hypot(dx,dy);
    if(pull<28){ dragPos={...L.ORIGIN}; return; }
    const ch=getSelectedChar();
    if(!isCharAvailable(ch)){ showPicker(); return; }
    const scale=5.35*ch.power;
    const p={x:L.ORIGIN.x,y:L.ORIGIN.y,vx:dx*scale,vy:dy*scale,r:projectileRadius,age:0,alive:true,charIndex:ch.index,pierce:0,bounce:0,primary:true};
    projectiles=[p]; shotIndex++; shotActive=true; abilityUsed=false; $('#canvasHint').classList.add('hidden');
    if(!isInfinite(level.side,ch)) usedCopies[ch.id]=(usedCopies[ch.id]||0)+1;
    playSound('launch'); dragPos={...L.ORIGIN}; updateGameHud();
  }

  function useAbility(){
    if(!shotActive||abilityUsed) return; const p=projectiles.find(q=>q.alive&&q.primary) || projectiles.find(q=>q.alive); if(!p) return;
    abilityUsed=true; attemptAbilities++; const ch=C.ROSTERS[level.side][p.charIndex];
    if(ch.ability==='boost'){ p.vx*=1.55; p.vy*=1.15; burstParticles(p.x,p.y,14); }
    else if(ch.ability==='split'){
      const ang=Math.atan2(p.vy,p.vx), sp=Math.hypot(p.vx,p.vy)*.92;
      for(const off of [-.19,.19]) projectiles.push({...p,vx:Math.cos(ang+off)*sp,vy:Math.sin(ang+off)*sp,primary:false,r:19,age:p.age});
      burstParticles(p.x,p.y,10);
    }
    else if(ch.ability==='bomb'){ explodeAt(p.x,p.y,165,2.6,true); cameraShake=12; }
    else if(ch.ability==='drill'){ p.pierce=1.35; p.vx*=1.18; }
    else if(ch.ability==='bounce'){ p.bounce=2.0; p.vx*=1.16; p.vy-=130; }
    else if(ch.ability==='gravity'){ p.vy+=560; p.vx*=1.08; }
    else if(ch.ability==='brake'){ p.vx*=.22; p.vy=-95; }
    updateGameHud();
  }
  $('#abilityBtn').addEventListener('click',useAbility);
  window.addEventListener('keydown',e=>{ if(currentScreen==='gameScreen'&&e.code==='Space'){e.preventDefault();useAbility();} });

  function circleRect(px,py,pr,b){
    const cx=Math.max(b.x,Math.min(px,b.x+b.w)), cy=Math.max(b.y,Math.min(py,b.y+b.h));
    const dx=px-cx,dy=py-cy; return dx*dx+dy*dy<=pr*pr;
  }
  function damageBlock(b,amount,px,py){
    if(b.dead) return;
    const def=blockDef(b.mat); b.hp-=amount; const cx=b.x+b.w/2; b.vx+=(cx-(px??cx))*Math.min(1.8,amount)*.8; b.av+=((py??(b.y+b.h/2))-(b.y+b.h/2))*0.0009*Math.min(3,amount);
    if(b.hp<=0){
      b.dead=true; attemptBlocksBroken++; score+=def.score||220; playSound(def.shatter?'shatter':'impact'); burstParticles(b.x+b.w/2,b.y+b.h/2,def.shatter?14:9);
      if(def.explosive) explodeAt(b.x+b.w/2,b.y+b.h/2,175,3.25);
      else if(def.crystal) explodeAt(b.x+b.w/2,b.y+b.h/2,92,1.5);
    }
  }
  function killTarget(t){ if(t.dead)return; t.dead=true; score+=1000; playSound('impact'); burstParticles(t.x,t.y,12); }
  function hitBossWeak(w){
    if(!w.alive)return; w.alive=false; boss.hp--; score+=1800; cameraShake=16; playSound('boss'); burstParticles(w.x,w.y,22);
    boss.phase=Math.min(3,1+Math.floor((boss.maxHp-boss.hp)/(boss.maxHp/3)));
    updateGameHud();
  }
  function explodeAt(x,y,r,power=2,fromAbility=false){
    for(const t of targets){ if(!t.dead&&Math.hypot(t.x-x,t.y-y)<r+t.r) killTarget(t); }
    for(const c of cores){ if(!c.dead&&Math.hypot(c.x-x,c.y-y)<r*.6+c.r) triggerCore(c); }
    if(boss) for(const w of boss.weak){ if(w.alive&&Math.hypot(w.x-x,w.y-y)<r*.7+w.r) hitBossWeak(w); }
    for(const b of blocks){ if(!b.dead){ const bx=b.x+b.w/2,by=b.y+b.h/2,d=Math.hypot(bx-x,by-y); if(d<r+Math.max(b.w,b.h)/2) damageBlock(b,power*Math.max(.4,1-d/(r+100)),x,y); } }
    if(fromAbility) score+=250;
  }
  function triggerCore(c){ if(c.dead)return; c.dead=true; score+=750; playSound('boss'); explodeAt(c.x,c.y,c.blast,3); burstParticles(c.x,c.y,26); cameraShake=13; }
  function burstParticles(x,y,count){
    for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2,s=70+Math.random()*260; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+Math.random()*.5,max:.9}); }
  }

  function updateProjectile(p,dt){
    if(!p.alive)return; p.age+=dt; p.portalCd=Math.max(0,(p.portalCd||0)-dt); if(p.pierce>0)p.pierce-=dt; if(p.bounce>0)p.bounce-=dt;

    // Environmental blocks affect the projectile before collision. Their influence is intentionally local and readable.
    for(const b of blocks){
      if(b.dead||b.decorative)continue; const def=blockDef(b.mat),cx=b.x+b.w/2,cy=b.y+b.h/2,dx=cx-p.x,dy=cy-p.y,d=Math.hypot(dx,dy)||1;
      if(def.fan && d<175) p.vx += (b.fanDir||1)*420*dt*(1-d/175);
      if(def.magnet && d<225){const pull=520*dt*(1-d/225);p.vx+=dx/d*pull;p.vy+=dy/d*pull;}
    }

    p.vx+=(level.wind||0)*dt; p.vy+=level.gravity*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    const speed=Math.hypot(p.vx,p.vy);

    for(const c of cores){ if(!c.dead&&Math.hypot(p.x-c.x,p.y-c.y)<p.r+c.r){ triggerCore(c); p.vx*=.55;p.vy*=.55; } }
    for(const t of targets){ if(!t.dead&&Math.hypot(p.x-t.x,p.y-t.y)<p.r+t.r){ killTarget(t); p.vx*=.68;p.vy*=.68; } }
    if(boss) for(const w of boss.weak){ if(w.alive&&Math.hypot(p.x-w.x,p.y-w.y)<p.r+w.r){ hitBossWeak(w); if(level.type==='final'){ p.alive=false; break; } p.vx*=.6;p.vy*=.6; } }

    for(const b of blocks){
      if(b.dead||b.decorative||!circleRect(p.x,p.y,p.r,b)) continue;
      const def=blockDef(b.mat);
      if(def.teleporter && p.portalCd<=0){
        const mate=blocks.find(o=>!o.dead&&o!==b&&o.mat==='teleporter'&&o.portalGroup&&o.portalGroup===b.portalGroup);
        if(mate){p.x=mate.x+mate.w/2+Math.sign(p.vx||1)*(mate.w/2+p.r+8);p.y=mate.y+mate.h/2;p.portalCd=.55;burstParticles(p.x,p.y,15);continue;}
      }
      const ch=C.ROSTERS[level.side][p.charIndex];
      damageBlock(b,(speed/520)*ch.mass*def.impact*(p.pierce>0?3.2:1),p.x,p.y);
      if(def.spring){p.vy=-Math.max(360,Math.abs(p.vy)*1.05+160);p.vx*=1.08;p.bounce=Math.max(p.bounce,1.0);continue;}
      if(def.sticky){p.vx*=.22;p.vy*=.18;p.age+=.28;continue;}
      if(p.pierce<=0){
        const cx=b.x+b.w/2,cy=b.y+b.h/2,nx=(p.x-cx)/(b.w/2+p.r),ny=(p.y-cy)/(b.h/2+p.r);
        const rebound=def.ice?.72:def.snow?.18:.42;
        if(Math.abs(nx)>Math.abs(ny)) p.vx*=-rebound-(p.bounce>0?.32:0); else p.vy*=-rebound-(p.bounce>0?.36:0);
        p.x+=Math.sign(p.vx||1)*4;p.y+=Math.sign(p.vy||-1)*4;
      }
    }
    if(p.y+p.r>=GROUND){p.y=GROUND-p.r;if(Math.abs(p.vy)>90){p.vy*=-((p.bounce>0)?.78:.35);p.vx*=.78;playSound('impact');}else{p.vy=0;p.vx*=Math.pow(.1,dt);}}
    if(p.x>W+120||p.x<-180||p.y>H+120||p.age>8.2||(p.age>2.1&&Math.hypot(p.vx,p.vy)<18)){p.alive=false;}
  }

  function updateBlocks(dt){
    const live=blocks.filter(b=>!b.dead&&!b.decorative);
    live.sort((a,b)=>(b.y+b.h)-(a.y+a.h));
    for(const b of live){
      let supportY=GROUND;
      for(const o of live){
        if(o===b)continue;
        const overlap=Math.min(b.x+b.w,o.x+o.w)-Math.max(b.x,o.x);
        const bottom=b.y+b.h;
        if(overlap>Math.min(12,b.w*.22) && o.y>=bottom-5 && o.y<supportY) supportY=o.y;
      }
      const gap=supportY-(b.y+b.h);
      if(gap>2){
        b.landed=false; b.vy+=level.gravity*dt; b.x+=b.vx*dt; b.y+=b.vy*dt; b.rotation+=b.av*dt;
        b.vx*=Math.pow(.985,dt*60); b.av*=Math.pow(.992,dt*60);
      } else {
        const impact=Math.max(0,b.vy);
        if(!b.landed&&impact>145){
          if(shotIndex>0&&impact>245) damageBlock(b,Math.min(2.2,impact/720),b.x+b.w/2,b.y+b.h);
          if(shotIndex>0)for(const t of targets){if(!t.dead&&t.x>b.x-t.r&&t.x<b.x+b.w+t.r&&t.y>b.y-t.r&&t.y<b.y+b.h+t.r&&impact>230)killTarget(t);}
        }
        b.y=supportY-b.h; b.vy=0; b.landed=true; b.x+=b.vx*dt; b.vx*=Math.pow(.72,dt*60); b.rotation+=b.av*dt; b.av*=Math.pow(.76,dt*60);
        if(Math.abs(b.rotation)<.008)b.rotation=0;
      }
      if(b.x<-80){b.x=-80;b.vx=Math.abs(b.vx)*.25;} if(b.x+b.w>W+80){b.x=W+80-b.w;b.vx=-Math.abs(b.vx)*.25;}
    }
  }

  function updateTargets(dt){
    const solids=blocks.filter(b=>!b.dead&&!b.decorative);
    for(const t of targets){
      if(t.dead)continue;
      let supportY=GROUND;
      const bottom=t.y+t.r;
      for(const b of solids){
        if(t.x+t.r*0.72<b.x||t.x-t.r*0.72>b.x+b.w)continue;
        if(b.y>=bottom-6&&b.y<supportY)supportY=b.y;
      }
      const gap=supportY-bottom;
      if(gap>2){t.landed=false;t.vy+=level.gravity*dt;t.x+=t.vx*dt;t.y+=t.vy*dt;t.vx*=Math.pow(.99,dt*60);}
      else{
        const impact=Math.max(0,t.vy);t.y=supportY-t.r;t.vy=0;t.landed=true;t.vx*=Math.pow(.76,dt*60);t.x+=t.vx*dt;
        if(shotIndex>0&&impact>390){killTarget(t);continue;}
      }
      for(const b of solids){
        if(b.vy>210&&circleRect(t.x,t.y,t.r*.82,b)){killTarget(t);break;}
      }
      if(t.y>H+80)killTarget(t);
    }
  }

  function updateParticles(dt){ for(const p of particles){p.life-=dt;p.vy+=520*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;} particles=particles.filter(p=>p.life>0); }

  function update(dt){
    if(!level||resultPending)return;
    projectiles.forEach(p=>updateProjectile(p,dt)); updateBlocks(dt); updateTargets(dt); updateParticles(dt);
    if(cameraShake>0) cameraShake=Math.max(0,cameraShake-40*dt);
    const alive=projectiles.some(p=>p.alive);
    if(shotActive&&!alive){ shotActive=false; abilityUsed=false; projectiles=[]; updateGameHud(); checkResult(); }
    if(shotActive) checkResult();
  }
  function checkResult(){
    const cleared=boss?boss.hp<=0:targets.every(t=>t.dead);
    if(cleared){ resultPending=true; setTimeout(()=>finishWin(),650); return; }
    if(!shotActive&&shotIndex>=level.birds){ resultPending=true; setTimeout(()=>finishLoss(),500); }
  }

  function applyAttemptInventory(){
    for(const [id,count] of Object.entries(usedCopies)){
      const ch=C.ROSTERS[level.side].find(c=>c.id===id); if(!ch||isInfinite(level.side,ch))continue;
      save.inventory[level.side][id]=Math.max(0,(save.inventory[level.side][id]||0)-count);
    }
  }
  function starCount(){
    let s=1; if(score>=level.stars[1])s=2; if(score>=level.stars[2])s=3; return s;
  }
  function awardUnlocks(side,n){
    const unlocks=C.ROSTERS[side].filter(ch=>ch.unlockLevel===n);
    const awarded=[];
    for(const ch of unlocks){
      const key=`unlock-${side}-${ch.id}`; if(save.awarded[key])continue;
      save.awarded[key]=true; const qty=ch.rarity==='Legendary'?3:ch.rarity==='Epic'?4:6;
      save.inventory[side][ch.id]=(save.inventory[side][ch.id]||0)+qty; awarded.push(`${ch.name} discovered with ${qty} copies`);
    }
    return awarded;
  }
  function finishWin(){
    if(!level)return; playSound('victory'); applyAttemptInventory();
    const remaining=Math.max(0,level.birds-shotIndex); score+=remaining*1200;
    const stars=starCount(); let coinAward=level.coins+stars*90; let capAward=0, unlockText=[];
    const daily=ensureDaily(); save.stats.clears++; save.stats.stars+=stars; save.stats.blocks+=attemptBlocksBroken; save.stats.abilities+=attemptAbilities; if(boss)save.stats.bosses++; daily.clears++; daily.stars+=stars; daily.blocks+=attemptBlocksBroken;
    if(modeState.mode==='campaign'){
      save.completed[level.side][level.number]=true; save.stars[level.side][level.number]=Math.max(stars,save.stars[level.side][level.number]||0);
      save.progress[level.side]=Math.max(save.progress[level.side],Math.min(201,level.number+1));
      coinAward=level.coins+stars*100;
      if(level.type==='boss') capAward=1; if(level.type==='major') capAward=2; if(level.type==='final') capAward=3;
      unlockText=awardUnlocks(level.side,level.number);
    } else if(modeState.mode==='endless'){
      modeState.stage=(modeState.stage||1); save.bestEndless[level.side]=Math.max(save.bestEndless[level.side]||0,modeState.stage); coinAward=220+modeState.stage*35; capAward=modeState.stage%5===0?1:0;
    } else if(modeState.mode==='daily'){ coinAward=1000; capAward=2; }
    else if(modeState.mode==='bossrush'){ coinAward=650; capAward=1; }
    save.coins+=coinAward; save.capsules+=capAward; persist();
    const extra=[...unlockText, capAward?`${capAward} capsule${capAward===1?'':'s'} earned`:null].filter(Boolean).map(x=>`<p><strong>${x}</strong></p>`).join('');
    const actions=[];
    if(modeState.mode==='campaign'&&level.number<200) actions.push({label:'NEXT LEVEL',onClick:()=>startGameLevel(L.generateLevel(level.side,level.number+1),{mode:'campaign'})});
    if(modeState.mode==='endless') actions.push({label:'NEXT ENDLESS STAGE',onClick:()=>startEndlessStage(level.side,(modeState.stage||1)+1)});
    if(modeState.mode==='bossrush') actions.push({label:'NEXT BOSS',onClick:()=>nextBossRush()});
    actions.push({label:'CAMPAIGN MAP',kind:'secondary',onClick:()=>openCampaign(level.side)});
    actions.push({label:'MAIN MENU',kind:'secondary',onClick:()=>showScreen('homeScreen')});
    running=false; cancelAnimationFrame(raf);
    showModal({kicker:`LEVEL CLEARED · ${stars} STAR${stars===1?'':'S'}`,title:`${coinAward.toLocaleString()} coins earned`,body:`<p>Score: <strong>${Math.round(score).toLocaleString()}</strong>. Remaining shots were converted into bonus score.</p>${extra}`,actions});
  }
  function finishLoss(){
    running=false; cancelAnimationFrame(raf);
    showModal({kicker:'ATTEMPT ENDED',title:'The target is still standing',body:'<p>No finite character copies were consumed. Restart immediately or change your lineup and try a different approach.</p>',actions:[{label:'RETRY',onClick:()=>startGameLevel(L.generateLevel(level.side,level.number),modeState)},{label:'CHARACTER ROSTER',kind:'secondary',onClick:()=>{running=true;showPicker();}},{label:'QUIT',kind:'secondary',onClick:()=>showScreen('homeScreen')}]});
  }

  function loop(now){
    if(!running)return; const dt=Math.min(.028,Math.max(.001,(now-lastTime)/1000)); lastTime=now;
    update(dt); draw(); raf=requestAnimationFrame(loop);
  }

  function drawSprite(side,index,x,y,size,alpha=1){
    const im=images[side==='bird'?'birds':'pigs']; if(!im.complete)return;
    const col=index%5,row=Math.floor(index/5),cell=204,sx=col*cell,sy=row*cell;
    ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,sx,sy,cell,cell,x-size/2,y-size/2,size,size);ctx.restore();
  }
  function drawBlock(b){
    if(b.dead)return; const im=images.materials,def=blockDef(b.mat),idx=def.index||0,cell=192,sx=(idx%5)*cell,sy=Math.floor(idx/5)*cell;
    ctx.save();
    if(b.rotation){ctx.translate(b.x+b.w/2,b.y+b.h/2);ctx.rotate(b.rotation);ctx.translate(-(b.x+b.w/2),-(b.y+b.h/2));}
    if(im.complete)ctx.drawImage(im,sx,sy,cell,cell,b.x,b.y,b.w,b.h);else{ctx.fillStyle='#747c86';ctx.fillRect(b.x,b.y,b.w,b.h);}
    if(def.fan){ctx.strokeStyle='#d9e3ee88';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(b.x+b.w+(i*18),b.y+8+i*9);ctx.lineTo(b.x+b.w+34+i*18,b.y+8+i*9);ctx.stroke();}}
    if(def.magnet){ctx.strokeStyle='#8dc6e788';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+b.h/2,Math.max(b.w,b.h)*.75,0,Math.PI*2);ctx.stroke();}
    const frac=Math.max(0,b.hp/blockHp(b.mat));if(frac<.55){ctx.strokeStyle='#111820aa';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x+b.w*.18,b.y+b.h*.05);ctx.lineTo(b.x+b.w*.5,b.y+b.h*.78);ctx.lineTo(b.x+b.w*.79,b.y+b.h*.18);ctx.stroke();}
    if(save.settings.physicsDebug){ctx.strokeStyle=b.landed?'#7bd58c':'#e5b95e';ctx.lineWidth=2;ctx.strokeRect(b.x,b.y,b.w,b.h);}
    ctx.restore();
  }

  function draw(){
    if(!level)return; ctx.save();
    if(cameraShake>0){ctx.translate((Math.random()-.5)*cameraShake,(Math.random()-.5)*cameraShake);}
    const bg=images[level.theme]; if(bg?.complete)ctx.drawImage(bg,0,0,W,H); else {ctx.fillStyle='#54687a';ctx.fillRect(0,0,W,H);}
    // atmosphere tint
    ctx.fillStyle=level.side==='pig'?'rgba(77,98,54,.08)':'rgba(51,65,89,.05)';ctx.fillRect(0,0,W,H);
    // ground
    ctx.fillStyle='#273129';ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle='#384436';ctx.fillRect(0,GROUND,W,9);
    // launch platform and sling
    if(images.launcher?.complete)ctx.drawImage(images.launcher,104,458,155,185);else{ctx.fillStyle='#4a3526';ctx.fillRect(143,525,18,105);ctx.fillRect(195,525,18,105);}
    ctx.strokeStyle='#2b1c17';ctx.lineWidth=10;ctx.lineCap='round';
    const loadedPos=dragging?dragPos:{x:L.ORIGIN.x,y:L.ORIGIN.y};
    if(!shotActive&&shotIndex<level.birds){ctx.beginPath();ctx.moveTo(152,535);ctx.lineTo(loadedPos.x,loadedPos.y);ctx.lineTo(204,535);ctx.stroke();}

    // trajectory preview
    if(dragging&&save.settings.aim){
      const ch=getSelectedChar(),vx=(L.ORIGIN.x-dragPos.x)*5.35*ch.power,vy=(L.ORIGIN.y-dragPos.y)*5.35*ch.power;
      let x=L.ORIGIN.x,y=L.ORIGIN.y,vxx=vx,vyy=vy; ctx.fillStyle='#ffffffaa';
      for(let i=0;i<28;i++){const dt=.06;vxx+=(level.wind||0)*dt;vyy+=level.gravity*dt;x+=vxx*dt;y+=vyy*dt;if(i%2===0){ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}if(y>GROUND)break;}
    }

    blocks.forEach(drawBlock);
    // cores
    for(const c of cores){if(c.dead)continue;ctx.save();ctx.strokeStyle='#6d5831aa';ctx.lineWidth=4;ctx.setLineDash([8,7]);ctx.beginPath();ctx.moveTo(c.x,c.y+c.r);ctx.lineTo(c.x,Math.min(GROUND-45,c.y+225));ctx.stroke();ctx.setLineDash([]);ctx.translate(c.x,c.y);ctx.fillStyle='#d7b955';ctx.strokeStyle='#42351b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,c.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff2';for(let a=0;a<6;a++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(c.r+4,0);ctx.lineTo(c.r+13,0);ctx.stroke();}ctx.restore();}
    // targets are the opposing faction
    const enemySide=level.side==='bird'?'pig':'bird';
    for(let i=0;i<targets.length;i++){const t=targets[i];if(t.dead)continue;drawSprite(enemySide,(level.number+i*3)%21,t.x,t.y,t.r*2.8);}
    if(save.settings.physicsDebug){ctx.save();ctx.font='700 11px ui-monospace,monospace';ctx.fillStyle='#f4cf6a';for(const t of targets){if(t.dead)continue;ctx.fillText(t.landed?'TARGET GROUNDED':'TARGET FALLING',t.x-42,t.y-t.r-12);}ctx.restore();}

    if(boss){
      // armored boss chassis
      ctx.save();ctx.translate(boss.x,boss.y);ctx.fillStyle='#1e2530cc';ctx.strokeStyle='#776d5a';ctx.lineWidth=8;ctx.beginPath();ctx.roundRect(-155,-135,310,270,38);ctx.fill();ctx.stroke();
      drawSprite(enemySide,(boss.story||level.story)*2%21,0,-5,175);
      ctx.fillStyle='#0f141b';ctx.fillRect(-142,95,284,24);ctx.fillStyle='#b78b45';ctx.fillRect(-142,95,284*(boss.hp/boss.maxHp),24);ctx.restore();
      for(const w of boss.weak){ if(!w.alive)continue; const pulse=1+Math.sin(performance.now()/180+w.x)*.06;ctx.fillStyle='#e2b64f';ctx.strokeStyle='#241b0d';ctx.lineWidth=4;ctx.beginPath();ctx.arc(w.x,w.y,w.r*pulse,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff6';ctx.beginPath();ctx.arc(w.x-6,w.y-7,6,0,Math.PI*2);ctx.fill(); }
      // phase indicator bars
      ctx.fillStyle='#ffffff22'; for(let i=0;i<boss.phase;i++)ctx.fillRect(boss.x-80+i*58,boss.y-170,44,8);
    }

    // loaded character
    if(!shotActive&&shotIndex<level.birds) drawSprite(level.side,getSelectedChar().index,loadedPos.x,loadedPos.y,64);
    // projectiles
    for(const p of projectiles){if(!p.alive)continue;drawSprite(level.side,p.charIndex,p.x,p.y,p.r*2.8,p.primary?1:.82);if(p.pierce>0){ctx.strokeStyle='#f2d070aa';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,p.r+7,0,Math.PI*2);ctx.stroke();}}
    // particles
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle='#f0c86d';ctx.fillRect(p.x-3,p.y-3,6,6);}ctx.globalAlpha=1;
    // wind indicator
    if(Math.abs(level.wind||0)>5){ctx.fillStyle='#111821b8';ctx.fillRect(18,18,145,38);ctx.fillStyle='#d8e1eb';ctx.font='700 15px system-ui';ctx.fillText(`WIND ${level.wind>0?'RIGHT':'LEFT'}`,30,43);}
    ctx.restore();
  }

  // Character picker
  function showPicker(){
    if(!level)return; const grid=$('#pickerGrid');grid.innerHTML='';
    C.ROSTERS[level.side].forEach(ch=>{
      const unlocked=isCharUnlocked(level.side,ch), inf=isInfinite(level.side,ch), copies=charCopies(level.side,ch)-(usedCopies[ch.id]||0), available=unlocked&&(inf||copies>0);
      const b=document.createElement('button');b.type='button';b.className='picker-item';b.disabled=!available;
      b.innerHTML=`<b>${ch.name}</b><span>${C.ABILITIES[ch.ability].label} · ${unlocked?(inf?'INFINITE':`${Math.max(0,copies)} COPIES`):`UNLOCK AT ${ch.unlockLevel}`}</span>`;
      b.addEventListener('click',()=>{selectedCharIndex=ch.index;$('#characterPicker').classList.add('hidden');updateGameHud();});grid.appendChild(b);
    });
    $('#characterPicker').classList.remove('hidden');
  }
  $('#rosterBtn').addEventListener('click',showPicker);$('#closePickerBtn').addEventListener('click',()=>$('#characterPicker').classList.add('hidden'));

  // Roster / Infinite shop
  function renderRoster(){
    $('#rosterSideBtn').textContent=`SHOW ${rosterSide==='bird'?'PIGS':'BIRDS'}`;
    const grid=$('#rosterGrid');grid.innerHTML='';
    C.ROSTERS[rosterSide].forEach(ch=>{
      const unlocked=isCharUnlocked(rosterSide,ch), inf=isInfinite(rosterSide,ch), copies=charCopies(rosterSide,ch);
      const card=document.createElement('article');card.className=`char-card ${unlocked?'':'locked'}`;
      const art=document.createElement('div');art.className='char-art';const cv=document.createElement('canvas');cv.width=cv.height=130;art.appendChild(cv);
      const body=document.createElement('div');body.className='char-body';
      body.innerHTML=`<h3>${ch.name}</h3><div class="char-meta"><span>${ch.rarity}</span><span>${C.ABILITIES[ch.ability].label}</span></div><p>${C.ABILITIES[ch.ability].desc}</p><div class="char-meta"><span>${unlocked?(inf?'INFINITE':`${copies} copies`):`Unlock after level ${ch.unlockLevel}`}</span><span>${ch.infiniteCost?`${ch.infiniteCost.toLocaleString()} coins`:''}</span></div>`;
      if(ch.infiniteCost){const b=document.createElement('button');b.type='button';b.className='primary';b.textContent=inf?'INFINITE OWNED':`BUY INFINITE · ${ch.infiniteCost.toLocaleString()}`;b.disabled=!unlocked||inf||save.coins<ch.infiniteCost;b.addEventListener('click',()=>buyInfinite(ch));body.appendChild(b);}
      card.append(art,body);grid.appendChild(card);
      requestAnimationFrame(()=>{const c=cv.getContext('2d'),im=images[rosterSide==='bird'?'birds':'pigs'];if(im.complete){const col=ch.index%5,row=Math.floor(ch.index/5);c.drawImage(im,col*204,row*204,204,204,0,0,130,130);}});
    });
  }
  function buyInfinite(ch){
    if(save.coins<ch.infiniteCost||isInfinite(ch.side,ch))return;
    save.coins-=ch.infiniteCost;save.infinite[ch.side][ch.id]=true;persist();renderRoster();
  }

  // Capsule lab
  function renderCapsules(){
    const log=$('#rewardLog');log.innerHTML='';
    const items=save.rewards.slice(-8).reverse();
    if(!items.length)log.innerHTML='<div class="reward-item"><b>No capsules opened yet</b><span>Earn capsules from bosses and extra modes.</span></div>';
    items.forEach(r=>{const d=document.createElement('div');d.className='reward-item';d.innerHTML=`<b>${r.title}</b><span>${r.detail}</span>`;log.appendChild(d);});
    $('#openCapsuleBtn').disabled=save.capsules<1;
  }
  function openCapsule(){
    if(save.capsules<1)return; save.capsules--; const orb=$('#capsuleOrb');orb.classList.remove('opening');void orb.offsetWidth;orb.classList.add('opening');
    const side=Math.random()<.5?'bird':'pig', unlocked=C.ROSTERS[side].filter(ch=>isCharUnlocked(side,ch)&&ch.index>0);
    let title,detail;
    if(Math.random()<.24||!unlocked.length){const coins=1200+Math.floor(Math.random()*3601);save.coins+=coins;title='Coin Cache';detail=`${coins.toLocaleString()} coins added to the wallet.`;}
    else {const ch=unlocked[Math.floor(Math.random()*unlocked.length)], qty=ch.rarity==='Legendary'?1:ch.rarity==='Epic'?2:3+Math.floor(Math.random()*4);save.inventory[side][ch.id]=(save.inventory[side][ch.id]||0)+qty;title=`${ch.name} Copies`;detail=`${qty} finite ${side} character copies added.`;}
    save.rewards.push({title,detail,at:Date.now()});save.rewards=save.rewards.slice(-30);persist();setTimeout(renderCapsules,480);
  }

  // Extra modes
  function chooseSideFor(title,onPick){showModal({kicker:'SELECT A SIDE',title,body:'<p>Both factions have their own roster, progress, finite copies, and infinite unlocks.</p>',actions:[{label:'BIRD SIDE',onClick:()=>onPick('bird')},{label:'PIG SIDE',onClick:()=>onPick('pig')},{label:'CANCEL',kind:'secondary'}]});}
  function endlessLevel(side,stage){
    let n=((stage*13+7)%200)+1; if(stage%5===0){const story=((Math.floor(stage/5)-1)%10)+1;n=(story-1)*20+(stage%10===0?10:5);} const l=L.generateLevel(side,n);l.title=`Endless Stage ${stage}: ${l.title}`;l.coins=200+stage*30;l.birds=Math.max(l.birds,3+Math.floor(stage/8));return l;
  }
  function startEndlessStage(side,stage=1){startGameLevel(endlessLevel(side,stage),{mode:'endless',stage});}
  let bossRushQueue=[];
  function startBossRush(side){
    const max=Math.min(200,save.progress[side]); bossRushQueue=[];
    for(let n=5;n<=max;n+=5){if([5,10,15,20].includes(((n-1)%20)+1))bossRushQueue.push(n);} if(!bossRushQueue.length)bossRushQueue=[5];
    const n=bossRushQueue.shift();startGameLevel(L.generateLevel(side,n),{mode:'bossrush',side});
  }
  function nextBossRush(){if(!bossRushQueue.length){showModal({kicker:'BOSS RUSH COMPLETE',title:'Run cleared',body:'<p>You cleared every boss currently available from campaign progress.</p>',actions:[{label:'MAIN MENU',onClick:()=>showScreen('homeScreen')}]});return;}const n=bossRushQueue.shift();startGameLevel(L.generateLevel(level.side,n),{mode:'bossrush',side:level.side});}
  function dailyLevel(){const d=new Date(),stamp=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000,side=stamp%2?'bird':'pig',n=(Math.abs(Math.floor(stamp*37))%200)+1,l=L.generateLevel(side,n);l.title=`Daily Challenge: ${l.title}`;l.birds=Math.max(3,l.birds-1);return l;}



  // Settings, daily contracts, achievements, and owner tools
  function renderSettings(){
    $('#musicToggle').checked=!!save.settings.music; $('#sfxToggle').checked=!!save.settings.sfx;
    $('#musicVolume').value=Math.round(save.settings.musicVolume*100); $('#sfxVolume').value=Math.round(save.settings.sfxVolume*100);
    $('#aimToggle').checked=!!save.settings.aim; $('#motionToggle').checked=!!save.settings.reducedMotion; $('#physicsToggle').checked=!!save.settings.physicsDebug;
  }
  function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function ensureDaily(){
    const key=todayKey(); if(!save.daily||save.daily.key!==key)save.daily={key,clears:0,stars:0,blocks:0,claimed:{},bonusClaimed:false}; return save.daily;
  }
  const achievements=[
    {id:'first-clear',name:'First Impact',desc:'Clear your first level.',goal:1,progress:()=>save.stats.clears,reward:750},
    {id:'clears-25',name:'Campaign Regular',desc:'Clear 25 levels across both sides.',goal:25,progress:()=>save.stats.clears,reward:3500},
    {id:'stars-100',name:'Star Hunter',desc:'Earn 100 total stars.',goal:100,progress:()=>save.stats.stars,reward:5000},
    {id:'bosses-10',name:'Boss Breaker',desc:'Defeat 10 bosses.',goal:10,progress:()=>save.stats.bosses,reward:5000},
    {id:'blocks-250',name:'Demolition Crew',desc:'Break 250 structure blocks.',goal:250,progress:()=>save.stats.blocks,reward:6000},
    {id:'dual-50',name:'Two-Sided War',desc:'Reach level 50 on both Bird and Pig sides.',goal:50,progress:()=>Math.min(save.progress.bird-1,save.progress.pig-1),reward:8500},
    {id:'infinite-5',name:'Permanent Roster',desc:'Own 5 infinite characters.',goal:5,progress:()=>Object.values(save.infinite.bird).filter(Boolean).length+Object.values(save.infinite.pig).filter(Boolean).length,reward:10000},
    {id:'endless-10',name:'No Finish Line',desc:'Reach Endless Stage 10.',goal:10,progress:()=>Math.max(save.bestEndless.bird||0,save.bestEndless.pig||0),reward:7000}
  ];
  function contractCard(name,desc,value,goal,reward,id){
    const done=value>=goal,claimed=!!ensureDaily().claimed[id],pct=Math.min(100,value/goal*100);
    return `<article class="challenge-card"><h3>${name}</h3><p>${desc}</p><div class="progress"><i style="width:${pct}%"></i></div><footer><span>${Math.min(value,goal)}/${goal}</span><span>${reward.toLocaleString()} coins</span></footer><button class="${done&&!claimed?'primary':'secondary'}" data-contract="${id}" ${done&&!claimed?'':'disabled'}>${claimed?'CLAIMED':done?'CLAIM REWARD':'IN PROGRESS'}</button></article>`;
  }
  function renderChallenges(){
    const d=ensureDaily(), daily=$('#dailyGrid');
    daily.innerHTML=contractCard('Three Clears','Clear any 3 levels today.',d.clears,3,1200,'clears')+contractCard('Six Stars','Earn 6 stars from clears today.',d.stars,6,1400,'stars')+contractCard('Demolition Shift','Break 25 blocks today.',d.blocks,25,1600,'blocks');
    daily.querySelectorAll('[data-contract]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.contract,vals={clears:[d.clears,3,1200],stars:[d.stars,6,1400],blocks:[d.blocks,25,1600]}[id];if(!vals||vals[0]<vals[1]||d.claimed[id])return;d.claimed[id]=true;save.coins+=vals[2];if(Object.keys(d.claimed).length>=3&&!d.bonusClaimed){d.bonusClaimed=true;save.capsules+=2;}persist();renderChallenges();}));
    const grid=$('#achievementGrid');grid.innerHTML='';
    for(const a of achievements){const value=a.progress(),done=value>=a.goal,claimed=!!save.achievements.claimed[a.id],pct=Math.min(100,value/a.goal*100),el=document.createElement('article');el.className='challenge-card';el.innerHTML=`<h3>${a.name}</h3><p>${a.desc}</p><div class="progress"><i style="width:${pct}%"></i></div><footer><span>${Math.min(value,a.goal)}/${a.goal}</span><span>${a.reward.toLocaleString()} coins</span></footer><button class="${done&&!claimed?'primary':'secondary'}" ${done&&!claimed?'':'disabled'}>${claimed?'CLAIMED':done?'CLAIM REWARD':'IN PROGRESS'}</button>`;el.querySelector('button').addEventListener('click',()=>{if(!done||claimed)return;save.achievements.claimed[a.id]=true;save.coins+=a.reward;persist();renderChallenges();});grid.appendChild(el);}
  }
  function renderOwner(){updateWallet();}
  function grantAllCharacters(){for(const side of ['bird','pig'])for(const ch of C.ROSTERS[side]){if(ch.index>0)save.inventory[side][ch.id]=Math.max(save.inventory[side][ch.id]||0,20);}}

  // QA
  function runQa(){
    $('#qaBig').textContent='TESTING 400';$('#qaDetail').textContent='Checking solvability, collision clearance, 3-star reachability, unique structures, and all twenty block systems.';$('#qaMeter').style.width='15%';$('#qaFailures').textContent='';
    setTimeout(()=>{const r=L.validateAll();$('#qaBig').textContent=`${r.pass}/${r.total} PASS`;$('#qaMeter').style.width=`${r.pass/r.total*100}%`;$('#qaDetail').textContent=r.failures.length?'Some levels failed certification and should not ship.':`${r.uniqueLayouts} unique level structures certified. ${r.blockTypesUsed}/20 block types appear across the campaign, using ${r.layoutFamilies} layout families.`;$('#qaFailures').textContent=r.failures.length?JSON.stringify(r.failures,null,2):`No certification failures.\n3-star thresholds verified reachable on all 400 levels.\nUnique structures: ${r.uniqueLayouts}/400\nBlock types used: ${r.blockTypesUsed}/20\nLayout families: ${r.layoutFamilies}`;},40);
  }

  // Navigation / buttons
  $('#homeBtn').addEventListener('click',()=>{running=false;cancelAnimationFrame(raf);showScreen('homeScreen');});
  $('#soundBtn').addEventListener('click',()=>{save.settings.sfx=!save.settings.sfx;persist();});
  $('#settingsBtn').addEventListener('click',()=>showScreen('settingsScreen'));
  $('#ownerTopBtn').addEventListener('click',()=>showScreen('ownerScreen'));
  $('#switchSideBtn').addEventListener('click',()=>{campaignSide=campaignSide==='bird'?'pig':'bird';$('#levelPanel').classList.add('hidden');renderCampaign();});
  $('#closeLevelsBtn').addEventListener('click',()=>$('#levelPanel').classList.add('hidden'));
  $('#restartBtn').addEventListener('click',()=>startGameLevel(L.generateLevel(level.side,level.number),modeState));
  $('#quitBtn').addEventListener('click',()=>{running=false;cancelAnimationFrame(raf); if(modeState?.mode==='campaign')openCampaign(level.side);else showScreen('homeScreen');});
  $('#rosterSideBtn').addEventListener('click',()=>{rosterSide=rosterSide==='bird'?'pig':'bird';renderRoster();});
  $('#openCapsuleBtn').addEventListener('click',openCapsule);
  $('#rerunQaBtn').addEventListener('click',runQa);
  $$('[data-action]').forEach(b=>b.addEventListener('click',()=>{
    const a=b.dataset.action;
    if(a==='campaign')openCampaign(b.dataset.side);
    if(a==='roster'){rosterSide='bird';showScreen('rosterScreen');}
    if(a==='capsules')showScreen('capsuleScreen');
    if(a==='qa'){showScreen('qaScreen');runQa();}
    if(a==='challenges')showScreen('challengesScreen');
    if(a==='endless')chooseSideFor('Endless Run',s=>startEndlessStage(s,1));
    if(a==='bossrush')chooseSideFor('Boss Rush',s=>startBossRush(s));
    if(a==='daily')startGameLevel(dailyLevel(),{mode:'daily'});
  }));


  $('#musicToggle').addEventListener('change',e=>{save.settings.music=e.target.checked;persist();syncMusic();});
  $('#sfxToggle').addEventListener('change',e=>{save.settings.sfx=e.target.checked;persist();});
  $('#musicVolume').addEventListener('input',e=>{save.settings.musicVolume=+e.target.value/100;persist();});
  $('#sfxVolume').addEventListener('input',e=>{save.settings.sfxVolume=+e.target.value/100;persist();});
  $('#aimToggle').addEventListener('change',e=>{save.settings.aim=e.target.checked;persist();});
  $('#motionToggle').addEventListener('change',e=>{save.settings.reducedMotion=e.target.checked;persist();});
  $('#physicsToggle').addEventListener('change',e=>{save.settings.physicsDebug=e.target.checked;persist();});
  $('#ownerAccessBtn').addEventListener('click',()=>{const code=prompt('Enter owner access code');if(code==='CRASHFLOCKDEV'){save.owner=true;persist();showScreen('ownerScreen');}else if(code!==null)alert('Incorrect owner code.');});
  $('#exportSaveBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='crashflock-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
  $('#resetSaveBtn').addEventListener('click',()=>{if(confirm('Reset all Crashflock progress and settings?')){localStorage.removeItem('crashflock-save');location.reload();}});
  $('#ownerUnlockBtn').addEventListener('click',()=>{save.progress.bird=201;save.progress.pig=201;persist();});
  $('#ownerCoinsBtn').addEventListener('click',()=>{save.coins+=100000;persist();});
  $('#ownerCapsBtn').addEventListener('click',()=>{save.capsules+=50;persist();});
  $('#ownerCharsBtn').addEventListener('click',()=>{grantAllCharacters();persist();});
  $('#ownerThreeStarBtn').addEventListener('click',()=>startGameLevel(L.generateLevel('bird',1),{mode:'campaign'}));
  $('#ownerQaBtn').addEventListener('click',()=>{showScreen('qaScreen');runQa();});

  // QA hooks used by the included build test and screenshot pass.
  window.__CRASH_QA = {
    validate:()=>L.validateAll(),
    openLevel:(side,n)=>{startGameLevel(L.generateLevel(side,n),{mode:'campaign'});return true;},
    openRoster:(side='bird')=>{rosterSide=side;showScreen('rosterScreen');return true;},
    openCampaign:(side='bird')=>{openCampaign(side);return true;},
    openCapsules:()=>{showScreen('capsuleScreen');return true;},
    fireCertified:(goalIndex=0)=>{if(!level||shotActive)return false;const goals=boss?boss.weak:targets;const target=goals[goalIndex];if(!target)return false;const s=L.correctedShot(level,target),ch=getSelectedChar(),scale=5.35*ch.power;dragPos={x:L.ORIGIN.x-s.vx/scale,y:L.ORIGIN.y-s.vy/scale};fireFromDrag();return true;},
    state:()=>({screen:currentScreen,level:level?{side:level.side,number:level.number,type:level.type,title:level.title,layout:level.layoutName,mechanic:level.mechanic}:null,score,shots:shotIndex,shotActive,bossHp:boss?boss.hp:null,remainingTargets:targets.filter(t=>!t.dead).length,remainingCores:cores.filter(c=>!c.dead).length})
  };

  // PWA registration is intentionally optional; the game also works as plain static GitHub Pages files.
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
  showScreen('homeScreen');
})();
