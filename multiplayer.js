(() => {
  "use strict";

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const ACTIVE = new Set(["playing", "hit", "celebrating"]);

  function makePlayer(world, index) {
    const player = {
      index,
      x: 0, y: 0, width: 0, height: 0,
      state: "idle", animTime: 0, invulnerable: 0,
      hitTimer: 0, celebrationTimer: 0,
      combo: 0, maxCombo: 0, nearMisses: 0, adrenaline: 0,
      configure(nextWorld, preserveProgress = null) {
        this.width = nextWorld.laneH * .78;
        this.height = nextWorld.laneH * 1.05;
        const spread = nextWorld.laneH * 1.1;
        this.x = nextWorld.width / 2 + (index === 0 ? -spread : spread);
        this.y = preserveProgress == null ? nextWorld.bottomSafeCenter : nextWorld.topLimit + (nextWorld.bottomLimit - nextWorld.topLimit) * clamp(preserveProgress, 0, 1);
      },
      progress(nextWorld) { return (this.y - nextWorld.topLimit) / (nextWorld.bottomLimit - nextWorld.topLimit); },
      get hitbox() { return { x: this.x - this.width * .4, y: this.y - this.height * .4, w: this.width * .8, h: this.height * .8 }; },
      reset(nextWorld) {
        this.configure(nextWorld); this.state = "idle"; this.animTime = 0; this.invulnerable = 0;
        this.hitTimer = 0; this.celebrationTimer = 0; this.combo = 0; this.maxCombo = 0; this.nearMisses = 0; this.adrenaline = 0;
      }
    };
    player.configure(world);
    return player;
  }

  function install(game) {
    if (!game || game.__multiplayerInstalled) return;
    game.__multiplayerInstalled = true;
    game.playerMode = 1;
    game.players = [game.player];
    game.playerScores = [game.score, 0];
    game.multiplayerResult = null;

    const input = [
      { up: false, down: false, left: false, right: false, gamepadX: 0, gamepadY: 0, pointers: new Map() },
      { up: false, down: false, left: false, right: false, gamepadX: 0, gamepadY: 0, pointers: new Map() }
    ];
    game.multiplayerInput = input;
    const clearMpInput = () => input.forEach((s) => { s.up=s.down=s.left=s.right=false; s.gamepadX=s.gamepadY=0; s.pointers.clear(); });

    function ensurePlayers(reset = false) {
      if (game.playerMode === 1) { game.players = [game.player]; game.playerScores[0] = game.score; return; }
      if (!game.players[1]) game.players[1] = makePlayer(game.world, 1);
      game.players[0] = game.player;
      if (reset) {
        const spread = game.world.laneH * 1.1;
        game.players[0].reset(game.world);
        game.players[0].x = game.world.width / 2 - spread;
        game.players[1].reset(game.world);
      }
    }

    const style = document.createElement("style");
    style.textContent = `#player-mode-picker{max-width:560px;margin:10px auto 0;border:0;padding:0}#player-mode-picker legend{width:100%;margin-bottom:7px;color:#b7d9c4;font-size:clamp(10px,1.2vw,14px);font-weight:900;letter-spacing:.12em;text-transform:uppercase}.player-mode-options{display:grid;grid-template-columns:1fr 1fr;gap:7px}.player-mode-option{min-height:43px;padding:8px;border:1px solid #ffffff32;border-radius:12px;color:#d8e9de;background:#071b12bd;cursor:pointer;font-weight:900}.player-mode-option[aria-pressed="true"]{color:#092014;border-color:#fff;background:linear-gradient(#ffe45c,#ffc400);box-shadow:0 0 0 3px #159653,0 5px 14px #0006}#multiplayer-result{margin:10px auto 18px;padding:10px 14px;max-width:520px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff09;font-weight:900}#multiplayer-touch{position:absolute;z-index:9;inset:auto 0 max(2%,env(safe-area-inset-bottom));display:none;grid-template-columns:1fr 1fr;gap:clamp(12px,5vw,64px);padding:0 max(3%,env(safe-area-inset-left));pointer-events:none}.multiplayer-touch-pad{display:grid;grid-template-columns:repeat(3,minmax(40px,72px));grid-template-rows:repeat(2,minmax(40px,72px));gap:5px;align-items:center;justify-content:center}.multiplayer-touch-pad[data-player="1"]{justify-self:end}.multiplayer-touch-pad[data-player="2"]{justify-self:start}.mp-touch{pointer-events:auto;border:2px solid #ffffffa3;border-radius:24%;background:#071b12d9;color:#fff;font-size:clamp(21px,5vw,34px);font-weight:900;touch-action:none}.mp-touch.pressed{background:#ffe45ce8;color:#092015}.mp-up{grid-column:2;grid-row:1}.mp-left{grid-column:1;grid-row:2}.mp-down{grid-column:2;grid-row:2}.mp-right{grid-column:3;grid-row:2}#game-shell.multiplayer-2p.touch #touch-controls{display:none!important}#game-shell.multiplayer-2p.touch #multiplayer-touch{display:grid}#game-shell.tv #multiplayer-touch{display:none!important}@media(max-width:620px){.multiplayer-touch-pad{grid-template-columns:repeat(3,minmax(34px,54px));grid-template-rows:repeat(2,minmax(34px,54px));gap:3px}#multiplayer-touch{gap:8px}}`;
    document.head.appendChild(style);

    const readyPanel=document.querySelector("#ready-overlay .panel"), difficultyPicker=document.querySelector(".difficulty-picker");
    const picker=document.createElement("fieldset"); picker.id="player-mode-picker";
    picker.innerHTML='<legend>Jogadores</legend><div class="player-mode-options"><button type="button" class="player-mode-option" data-mode="1" aria-pressed="true">1 Jogador</button><button type="button" class="player-mode-option" data-mode="2" aria-pressed="false">2 Jogadores</button></div>';
    if(readyPanel&&difficultyPicker) readyPanel.insertBefore(picker,difficultyPicker);
    const gameoverPanel=document.querySelector("#gameover-overlay .panel"), restartButton=document.querySelector("#restart-button"), result=document.createElement("div");
    result.id="multiplayer-result"; result.hidden=true; if(gameoverPanel&&restartButton) gameoverPanel.insertBefore(result,restartButton);
    const touch=document.createElement("div"); touch.id="multiplayer-touch";
    const tb=(p,d,g,c)=>`<button type="button" class="mp-touch ${c}" data-player="${p}" data-direction="${d}" aria-label="Jogador ${p}: ${d}">${g}</button>`;
    touch.innerHTML=`<div class="multiplayer-touch-pad" data-player="1" aria-label="Controles do Jogador 1">${tb(1,"up","▲","mp-up")}${tb(1,"left","◀","mp-left")}${tb(1,"down","▼","mp-down")}${tb(1,"right","▶","mp-right")}</div><div class="multiplayer-touch-pad" data-player="2" aria-label="Controles do Jogador 2">${tb(2,"up","▲","mp-up")}${tb(2,"left","◀","mp-left")}${tb(2,"down","▼","mp-down")}${tb(2,"right","▶","mp-right")}</div>`;
    game.shell.appendChild(touch);

    function setMode(mode){ if(game.state!=="ready")return; game.playerMode=mode===2?2:1; game.shell.classList.toggle("multiplayer-2p",game.playerMode===2); picker.querySelectorAll(".player-mode-option").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.mode)===game.playerMode))); clearMpInput(); if(game.playerMode===2){game.playerScores=[0,0];ensurePlayers(true);}else{game.players=[game.player];game.player.configure(game.world);game.score=0;} game.updateDeviceHint(game.input.touch?"touch":game.tvMode?"tv":"computer");game.updateHud();game.markDirty?.();}
    picker.addEventListener("click",e=>{const b=e.target.closest(".player-mode-option");if(b)setMode(Number(b.dataset.mode));});
    touch.querySelectorAll(".mp-touch").forEach(button=>{const pi=Number(button.dataset.player)-1,d=button.dataset.direction,s=input[pi];const sync=()=>{const v=[...s.pointers.values()];s.up=v.includes("up");s.down=v.includes("down");s.left=v.includes("left");s.right=v.includes("right");};const release=e=>{s.pointers.delete(e.pointerId);button.classList.remove("pressed");sync();};button.addEventListener("pointerdown",e=>{if(game.playerMode!==2)return;e.preventDefault();s.pointers.set(e.pointerId,d);button.classList.add("pressed");sync();try{button.setPointerCapture(e.pointerId);}catch(_){}});["pointerup","pointercancel","pointerleave","lostpointercapture"].forEach(t=>button.addEventListener(t,release,{passive:false}));});

    function keyboardBinding(e){const key=String(e.key||"").toLowerCase(),code=e.code||"";if(game.playerMode!==2||game.state==="ready")return null;const wasd={w:"up",s:"down",a:"left",d:"right"}[key]||({KeyW:"up",KeyS:"down",KeyA:"left",KeyD:"right"})[code];const arrows=({ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"})[code]||({arrowup:"up",arrowdown:"down",arrowleft:"left",arrowright:"right"})[key];return wasd?[0,wasd]:arrows?[1,arrows]:null;}
    ["keydown","keyup"].forEach(type=>window.addEventListener(type,e=>{const b=keyboardBinding(e);if(!b)return;e.preventDefault();e.stopImmediatePropagation();input[b[0]][b[1]]=type==="keydown";if(type==="keydown")game.audio?.unlock?.();game.wakeLoop?.();},{capture:true,passive:false}));

    const originalClear=game.input.clear.bind(game.input); game.input.clear=()=>{originalClear();clearMpInput();};
    const originalUpdateGamepad=game.input.updateGamepad.bind(game.input); let previousPads=[[],[]];
    game.input.updateGamepad=()=>{if(game.playerMode!==2)return originalUpdateGamepad();const pads=navigator.getGamepads?[...navigator.getGamepads()].filter(p=>p?.connected).slice(0,2):[];for(let i=0;i<2;i++){const pad=pads[i],s=input[i];if(!pad){s.gamepadX=s.gamepadY=0;previousPads[i]=[];continue;}const x=Math.abs(pad.axes?.[0]||0)>=.35?pad.axes[0]:0,y=Math.abs(pad.axes?.[1]||0)>=.35?pad.axes[1]:0;s.gamepadX=pad.buttons?.[14]?.pressed?-1:pad.buttons?.[15]?.pressed?1:x;s.gamepadY=pad.buttons?.[12]?.pressed?-1:pad.buttons?.[13]?.pressed?1:y;const cur=pad.buttons?.map(b=>!!b.pressed)||[];if(i===0){const just=n=>cur[n]&&!previousPads[i][n];if(just(0))game.handleConfirm();if(just(9))ACTIVE.has(game.state)?game.pauseGame("gamepad"):game.handleConfirm();if(just(1)||just(8))game.handleBack();}previousPads[i]=cur;}game.input.gamepadName=pads.map(p=>p.id||"Gamepad").join(" + ")||"Nenhum";};

    const originalUpdatePlayer=game.updatePlayer.bind(game),originalCheckCollisions=game.checkCollisions.bind(game),originalUpdateHud=game.updateHud.bind(game),originalFinishGame=game.finishGame.bind(game),originalResetGame=game.resetGame.bind(game),originalResizeCanvas=game.resizeCanvas.bind(game),originalUpdateDeviceHint=game.updateDeviceHint.bind(game),originalStartFairnessWindow=game.startFairnessWindow.bind(game);
    function movementFor(i){const s=input[i],kx=(s.right?1:0)-(s.left?1:0),ky=(s.down?1:0)-(s.up?1:0);return{x:clamp(kx||s.gamepadX,-1,1),y:clamp(ky||s.gamepadY,-1,1)};}
    function scoreFor(i){if(game.state!=="playing")return;const p=game.players[i];game.playerScores[i]+=1;if(i===0)game.score=game.playerScores[0];p.combo+=1;p.maxCombo=Math.max(p.maxCombo,p.combo);p.adrenaline=Math.min(100,p.adrenaline+18);p.state="celebrate";p.celebrationTimer=.72;game.particles.emit(p.x,p.y,20,i===0?["#ffe239","#fff","#19a85b"]:["#68c7ff","#fff","#315bd8"],"confetti",game.performance.low);game.audio.play("score");game.showToast(`P${i+1} +1 PONTO!`);game.updateHud();}
    function resolveOverlap(p){for(let a=0;a<6;a++){const overlap=game.lanes.some(l=>l.vehicles.some(v=>{const r=l.getRect(v,game.world),b=p.hitbox;return b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y;}));if(!overlap)return;p.y=Math.min(game.world.bottomSafeCenter,p.y+game.world.laneH*.1);}p.y=game.world.bottomSafeCenter;}
    function collide(i){const p=game.players[i];if(game.state!=="playing"||p.invulnerable>0)return;const desired=p.y+game.world.laneH*2;p.y=desired<=game.world.bottomLimit?desired:game.world.bottomSafeCenter;resolveOverlap(p);p.invulnerable=1.05;p.hitTimer=.34;p.state="hit";p.combo=0;game.cameraShake=1;game.hitFlash=1;game.particles.emit(p.x,p.y,18,["#ff253d","#ffcf2e","#fff"],"spark",game.performance.low);game.audio.play("hit");game.showToast(`P${i+1}: cuidado!`);}

    game.updatePlayer=dt=>{if(game.playerMode!==2)return originalUpdatePlayer(dt);ensurePlayers();const speed=game.world.laneH*3.15;let walking=false;game.players.forEach((p,i)=>{p.animTime+=i===0?0:dt;if(i>0)p.invulnerable=Math.max(0,p.invulnerable-dt);if(p.hitTimer>0){p.hitTimer-=dt;if(p.hitTimer<=0)p.state="idle";}if(p.celebrationTimer>0){p.celebrationTimer-=dt;if(p.celebrationTimer<=0){p.y=game.world.bottomSafeCenter;p.state="idle";}return;}const m=movementFor(i),margin=Math.max(p.width*.55,game.world.laneH*.2);p.x=clamp(p.x+m.x*speed*dt,margin,game.world.width-margin);p.y=clamp(p.y+m.y*speed*dt,game.world.topLimit,game.world.bottomLimit);walking||=!!(m.x||m.y);if(p.hitTimer<=0)p.state=m.x||m.y?"walking":"idle";if(p.y<=game.world.topGoal)scoreFor(i);});game.audio.updateWalking(walking,dt);game.markDirty?.();};
    game.checkCollisions=()=>{if(game.playerMode!==2)return originalCheckCollisions();game.players.forEach((p,i)=>{if(p.invulnerable>0||p.celebrationTimer>0)return;const b=p.hitbox;for(const l of game.lanes)for(const v of l.vehicles){const r=l.getRect(v,game.world);if(b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y){collide(i);return;}}});};
    game.updateHud=()=>{if(game.playerMode!==2)return originalUpdateHud();document.querySelector("#score-value").textContent=`P1 ${game.playerScores[0]} · P2 ${game.playerScores[1]}`;const safe=Math.max(0,Math.ceil(game.timeLeft));document.querySelector("#time-value").textContent=`${String(Math.floor(safe/60)).padStart(2,"0")}:${String(safe%60).padStart(2,"0")}`;document.querySelector("#best-value").textContent=game.best;};
    game.finishGame=()=>{if(game.playerMode!==2)return originalFinishGame();if(game.state==="gameOver")return;game.timeLeft=0;game.input.clear();game.audio.stopWalking();game.players.forEach(p=>p.state="idle");const[p1,p2]=game.playerScores,winner=p1===p2?"Empate":p1>p2?"Jogador 1 venceu":"Jogador 2 venceu";game.multiplayerResult=winner;document.querySelector("#final-score").textContent=`${p1} · ${p2}`;document.querySelector("#final-best").textContent=game.best;result.hidden=false;result.textContent=`P1 ${p1} × ${p2} P2 — ${winner}`;game.audio.play("over");game.transition("gameOver");requestAnimationFrame(()=>document.querySelector("#restart-button")?.focus());};
    game.resetGame=(initial=false)=>{originalResetGame(initial);clearMpInput();result.hidden=true;game.multiplayerResult=null;if(game.playerMode===2){game.playerScores=[0,0];game.score=0;ensurePlayers(true);game.updateHud();}};
    game.resizeCanvas=(force=false)=>{const p2Progress=game.playerMode===2&&game.players[1]?game.players[1].progress(game.world):null;originalResizeCanvas(force);if(game.playerMode===2){ensurePlayers();game.players[1].configure(game.world,p2Progress);}};
    game.updateDeviceHint=type=>{originalUpdateDeviceHint(type);if(game.playerMode!==2)return;const el=document.querySelector("#device-instruction");if(!el)return;if(type==="computer")el.textContent="P1: W A S D · P2: setas";else if(type==="gamepad"||type==="tv")el.textContent="Gamepad 1: P1 · Gamepad 2: P2 (quando disponível)";else if(type==="touch")el.textContent="Use os dois direcionais na tela";};
    game.startFairnessWindow=()=>{if(game.playerMode!==2)return originalStartFairnessWindow();const left=Math.min(...game.players.map(p=>p.x-p.width*.42)),right=Math.max(...game.players.map(p=>p.x+p.width*.42));game.fairnessActive=true;game.fairnessElapsed=0;game.fairnessAnnounced=false;let clearDelay=.2;for(const l of game.lanes)for(const v of l.vehicles){const half=v.width*.46,approaching=l.direction>0?v.x+half<left:v.x-half>right;v.fairnessHold=approaching;if(!approaching){const distance=l.direction>0?right+half-v.x:v.x+half-left;clearDelay=Math.max(clearDelay,Math.max(0,distance)/v.speed);}}game.fairnessClearDelay=clearDelay+.18;game.fairnessDuration=game.fairnessClearDelay+4.15;game.showToast("O trânsito vai abrir para os dois...");};

    const originalDrawPlayer=game.renderer.drawPlayer.bind(game.renderer);game.renderer.drawPlayer=(ctx,p,w,e,low)=>{originalDrawPlayer(ctx,p,w,e,low);if(game.playerMode!==2||p!==game.player||!game.players[1])return;originalDrawPlayer(ctx,game.players[1],w,e+.12,low);ctx.save();ctx.textAlign="center";ctx.font=`900 ${Math.max(12,w.laneH*.18)}px system-ui`;[[game.players[0],"P1","#ffe45c"],[game.players[1],"P2","#7dd3fc"]].forEach(([pl,label,color])=>{ctx.fillStyle="#04150ddd";ctx.fillRect(pl.x-w.laneH*.22,pl.y-pl.height*.72,w.laneH*.44,w.laneH*.23);ctx.fillStyle=color;ctx.fillText(label,pl.x,pl.y-pl.height*.53);});ctx.restore();};

    const originalSnapshot=game.snapshot?.bind(game);const mpSnapshot=()=>({mode:game.playerMode===2?"2P":"1P",scores:[...game.playerScores],winner:game.multiplayerResult,players:game.players.map((p,i)=>({index:i+1,x:p.x,y:p.y,state:p.state,invulnerable:p.invulnerable,score:game.playerScores[i]||0,combo:p.combo||0,nearMisses:p.nearMisses||0,adrenaline:p.adrenaline||0,input:{...movementFor(i)}}))});
    const existing=window.__gameTest||{};window.__gameTest=Object.freeze({...existing,snapshot:()=>({...originalSnapshot?.(),multiplayer:mpSnapshot()}),setPlayerMode:mode=>setMode(Number(mode)),multiplayerSnapshot:mpSnapshot,forceCollisionForPlayer:index=>collide(clamp(Number(index)-1,0,1)),forceScoreForPlayer:index=>scoreFor(clamp(Number(index)-1,0,1)),setPlayerPosition:(index,x,y)=>{const p=game.players[clamp(Number(index)-1,0,game.players.length-1)];if(!p)return;p.x=clamp(Number(x),0,game.world.width);p.y=clamp(Number(y),game.world.topLimit,game.world.bottomLimit);game.markDirty?.();}});
    game.setPlayerMode=setMode;game.getMultiplayerSnapshot=mpSnapshot;ensurePlayers();
  }
  window.addEventListener("DOMContentLoaded",()=>install(window.travessiaGame),{once:true});
})();
