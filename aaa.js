(() => {
  "use strict";

  const originalInitialize = window.initializeGame;
  if (typeof originalInitialize !== "function") return;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const activeStates = new Set(["playing", "hit", "celebrating"]);

  function installPremiumLayer(game) {
    if (!game || game.__premiumInstalled) return game;
    game.__premiumInstalled = true;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const state = {
      combo: 0,
      maxCombo: 0,
      nearMisses: 0,
      hype: 0,
      maxHype: 0,
      rushTimer: 0,
      rushCount: 0,
      lastActionAt: 0,
      intensity: 0,
      phase: "AQUECIMENTO",
      seenVehicles: new WeakSet(),
      cueTimer: 0,
      timeBonus: 0,
      collisions: 0
    };

    const style = document.createElement("style");
    style.id = "premium-game-feel-style";
    style.textContent = `
      #aaa-ambient, #aaa-speedlines, #aaa-flash {
        position: absolute; inset: 0; pointer-events: none;
      }
      #aaa-ambient {
        z-index: 3;
        background:
          radial-gradient(circle at 50% 8%, rgba(255,235,112,.16), transparent 28%),
          linear-gradient(180deg, rgba(11,91,55,.04), transparent 30%, rgba(0,0,0,.12));
        mix-blend-mode: screen;
        opacity: calc(.22 + var(--aaa-hype, 0) * .004);
        transition: opacity .35s ease;
      }
      #aaa-speedlines {
        z-index: 4; opacity: 0; transition: opacity .2s ease;
        background: repeating-linear-gradient(90deg, transparent 0 7%, rgba(255,255,255,.09) 7.15% 7.35%, transparent 7.5% 14%);
        transform: skewY(-7deg) scale(1.2);
      }
      #game-shell.aaa-rush #aaa-speedlines { opacity: .28; animation: aaaRushLines .32s linear infinite; }
      #aaa-flash { z-index: 10; opacity: 0; background: radial-gradient(circle, rgba(255,230,70,.38), transparent 60%); }
      #aaa-flash.show { animation: aaaFlash .32s ease-out; }
      #aaa-hud {
        position: absolute; z-index: 8; left: 50%; top: clamp(82px, 15.5%, 126px);
        translate: -50% 0; width: min(58%, 560px); pointer-events: none;
        text-align: center; filter: drop-shadow(0 5px 12px #0009);
      }
      #aaa-hud-top { display: flex; justify-content: center; align-items: center; gap: 9px; margin-bottom: 5px; }
      #aaa-combo, #aaa-phase {
        padding: 4px 9px; border-radius: 999px; border: 1px solid #ffffff2b;
        background: #04150dcc; color: #e9f8ef; font-weight: 950;
        font-size: clamp(9px, 1vw, 12px); letter-spacing: .09em; text-transform: uppercase;
      }
      #aaa-combo strong { color: #ffe34c; font-size: 1.18em; }
      #aaa-phase { color: #a9d9bb; }
      #aaa-hype-track {
        position: relative; height: clamp(7px, .7vw, 10px); overflow: hidden;
        border: 1px solid #ffffff2f; border-radius: 999px; background: #020b0799;
        box-shadow: inset 0 1px 3px #0009;
      }
      #aaa-hype-fill {
        width: 0%; height: 100%; border-radius: inherit;
        background: linear-gradient(90deg, #18a75b, #ffe234 68%, #ff713a);
        box-shadow: 0 0 14px #ffe23477; transition: width .18s ease;
      }
      #aaa-hype-label {
        margin-top: 3px; color: #d5ecdd; font-size: clamp(8px, .8vw, 10px);
        font-weight: 900; letter-spacing: .12em; text-transform: uppercase;
      }
      #aaa-cue {
        position: absolute; z-index: 12; left: 50%; top: 48%; translate: -50% -50%;
        max-width: 80%; padding: 10px 18px; opacity: 0; transform: scale(.74) translateY(12px);
        color: #fff; text-align: center; font-weight: 1000; font-style: italic;
        font-size: clamp(24px, 5vw, 62px); line-height: .9; letter-spacing: -.03em;
        text-shadow: 0 4px 0 #714b00, 0 10px 28px #000d; pointer-events: none;
      }
      #aaa-cue.show { animation: aaaCue .68s cubic-bezier(.2,.8,.2,1); }
      #game-shell.aaa-rush #aaa-hype-track { border-color: #ffe766; box-shadow: 0 0 18px #ffd52d88, inset 0 1px 3px #0009; }
      #game-shell.aaa-rush #aaa-hype-fill { animation: aaaHypePulse .5s ease-in-out infinite alternate; }
      #aaa-gameover-stats {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: -13px auto 22px;
        max-width: 520px;
      }
      .aaa-stat {
        padding: 9px 7px; border: 1px solid #ffffff1d; border-radius: 12px; background: #ffffff09;
      }
      .aaa-stat span { display: block; color: #9fc9ae; font-size: 9px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      .aaa-stat strong { display: block; margin-top: 2px; color: #fff; font-size: clamp(17px, 2.4vw, 27px); }
      #aaa-grade { color: #ffe34c; }
      @keyframes aaaCue {
        0% { opacity: 0; transform: scale(.68) translateY(16px); }
        18% { opacity: 1; transform: scale(1.08) translateY(0); }
        62% { opacity: 1; transform: scale(1) translateY(0); }
        100% { opacity: 0; transform: scale(.96) translateY(-14px); }
      }
      @keyframes aaaFlash { from { opacity: 1; } to { opacity: 0; } }
      @keyframes aaaRushLines { to { translate: 8% 0; } }
      @keyframes aaaHypePulse { to { filter: brightness(1.35); } }
      @media (orientation: portrait) {
        #aaa-hud { top: 10.8%; width: 68%; }
        #aaa-phase { display: none; }
        #aaa-cue { top: 42%; max-width: 92%; }
      }
      @media (max-height: 620px) and (orientation: landscape) {
        #aaa-hud { top: 14%; width: 48%; }
        #aaa-hype-label { display: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        #aaa-speedlines { display: none !important; }
        #aaa-cue.show { animation-duration: .01ms !important; opacity: 1; }
        #aaa-flash { display: none !important; }
      }
      #game-shell.aaa-lowfx #aaa-speedlines,
      #game-shell.aaa-lowfx #aaa-flash { display: none !important; }
      #game-shell.aaa-lowfx #aaa-ambient { opacity: .12; }
    `;
    document.head.appendChild(style);

    const ambient = document.createElement("div");
    ambient.id = "aaa-ambient";
    const speedlines = document.createElement("div");
    speedlines.id = "aaa-speedlines";
    const flash = document.createElement("div");
    flash.id = "aaa-flash";
    const cue = document.createElement("div");
    cue.id = "aaa-cue";
    cue.setAttribute("aria-live", "polite");

    const hud = document.createElement("section");
    hud.id = "aaa-hud";
    hud.setAttribute("aria-label", "Adrenalina e sequência");
    hud.innerHTML = `
      <div id="aaa-hud-top">
        <span id="aaa-combo">Sequência <strong>x0</strong></span>
        <span id="aaa-phase">Aquecimento</span>
      </div>
      <div id="aaa-hype-track" role="progressbar" aria-label="Adrenalina" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div id="aaa-hype-fill"></div>
      </div>
      <div id="aaa-hype-label">Adrenalina</div>`;

    game.shell.prepend(ambient, speedlines, flash);
    game.shell.append(hud, cue);

    const gameoverPanel = document.querySelector("#gameover-overlay .panel");
    const restartButton = document.querySelector("#restart-button");
    const gameoverStats = document.createElement("div");
    gameoverStats.id = "aaa-gameover-stats";
    gameoverStats.innerHTML = `
      <div class="aaa-stat"><span>Quase</span><strong id="aaa-final-near">0</strong></div>
      <div class="aaa-stat"><span>Combo máx.</span><strong id="aaa-final-combo">x0</strong></div>
      <div class="aaa-stat"><span>Classe</span><strong id="aaa-grade">C</strong></div>`;
    if (gameoverPanel && restartButton) gameoverPanel.insertBefore(gameoverStats, restartButton);

    const comboEl = document.querySelector("#aaa-combo strong");
    const phaseEl = document.querySelector("#aaa-phase");
    const hypeTrack = document.querySelector("#aaa-hype-track");
    const hypeFill = document.querySelector("#aaa-hype-fill");

    function vibrate(pattern) {
      if (game.tvMode || typeof navigator.vibrate !== "function") return;
      try { navigator.vibrate(pattern); } catch (_) {}
    }

    function accent(kind = "near") {
      if (!game.audio?.enabled) return;
      if (window.AndroidTvHost && typeof window.AndroidTvHost.playSound === "function") {
        game.audio.play(kind === "rush" ? "score" : "confirm");
        return;
      }
      const play = () => {
        const ctx = game.audio?.context;
        if (!ctx || ctx.state !== "running") return;
        const notes = kind === "rush" ? [523.25, 659.25, 783.99] : kind === "combo" ? [660, 880] : [740];
        notes.forEach((frequency, index) => {
          try {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = "triangle";
            oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + index * .035);
            gain.gain.setValueAtTime(.0001, ctx.currentTime + index * .035);
            gain.gain.exponentialRampToValueAtTime(.08, ctx.currentTime + .012 + index * .035);
            gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .13 + index * .035);
            oscillator.connect(gain).connect(ctx.destination);
            oscillator.start(ctx.currentTime + index * .035);
            oscillator.stop(ctx.currentTime + .16 + index * .035);
          } catch (_) {}
        });
      };
      Promise.resolve(game.audio.unlock?.()).then(play, () => {});
    }

    function showCue(text, kind = "normal") {
      cue.textContent = text;
      cue.classList.remove("show");
      void cue.offsetWidth;
      cue.classList.add("show");
      flash.classList.remove("show");
      if (kind === "rush" || kind === "score") {
        void flash.offsetWidth;
        flash.classList.add("show");
      }
      clearTimeout(state.cueTimer);
      state.cueTimer = setTimeout(() => cue.classList.remove("show"), 720);
    }

    function phaseFor(progress) {
      if (progress >= .72) return "RETA FINAL";
      if (progress >= .36) return "PRESSÃO SUBINDO";
      return "AQUECIMENTO";
    }

    function updatePresentation() {
      const hype = clamp(state.hype, 0, 100);
      state.maxHype = Math.max(state.maxHype, hype);
      game.shell.style.setProperty("--aaa-hype", hype.toFixed(1));
      comboEl.textContent = `x${state.combo}`;
      phaseEl.textContent = state.phase;
      hypeFill.style.width = `${hype}%`;
      hypeTrack.setAttribute("aria-valuenow", String(Math.round(hype)));
      document.querySelector("#aaa-hype-label").textContent = state.rushTimer > 0 ? "MODO PISTOLA" : "Adrenalina";
      game.shell.classList.toggle("aaa-rush", state.rushTimer > 0);
      game.shell.classList.toggle("aaa-lowfx", !!game.performance?.low || reducedMotion.matches);
    }

    function activateRush() {
      if (state.rushTimer > 0) return;
      state.rushTimer = 6;
      state.rushCount += 1;
      state.hype = 100;
      state.lastActionAt = game.elapsed;
      showCue("MODO PISTOLA!", "rush");
      accent("rush");
      vibrate([35, 25, 55]);
      game.particles?.emit(game.player.x, game.player.y, 34, ["#ffe239", "#fff", "#19a85b"], "confetti", game.performance?.low);
      updatePresentation();
    }

    function addHype(amount) {
      if (state.rushTimer > 0) return;
      state.hype = clamp(state.hype + amount, 0, 100);
      state.lastActionAt = game.elapsed;
      if (state.hype >= 100) activateRush();
      updatePresentation();
    }

    function triggerNearMiss() {
      if (game.state !== "playing" || game.player.invulnerable > 0) return false;
      state.nearMisses += 1;
      addHype(18);
      showCue("QUASE!", "normal");
      accent("near");
      vibrate(18);
      game.particles?.emit(game.player.x, game.player.y, 8, ["#ffe239", "#fff"], "spark", game.performance?.low);
      return true;
    }

    function detectNearMisses() {
      if (game.state !== "playing" || game.player.invulnerable > 0) return;
      const p = game.player;
      const laneH = game.world.laneH;
      for (const lane of game.lanes) {
        if (Math.abs(p.y - lane.y(game.world)) > laneH * .5) continue;
        for (const vehicle of lane.vehicles) {
          if (state.seenVehicles.has(vehicle)) continue;
          const collisionDistance = vehicle.width * .46 + p.width * .4;
          const distance = Math.abs(vehicle.x - p.x);
          if (distance > collisionDistance && distance < collisionDistance + laneH * .34) {
            state.seenVehicles.add(vehicle);
            triggerNearMiss();
          }
        }
      }
    }

    function tuneTraffic() {
      if (!activeStates.has(game.state) || !game.world) return;
      const progress = clamp(game.elapsed / Math.max(1, game.duration), 0, 1);
      const difficultyRamp = { easy: .055, normal: .11, hard: .17 }[game.difficulty] ?? .1;
      const eased = progress * progress * (3 - 2 * progress);
      const rushRelief = state.rushTimer > 0 ? .9 : 1;
      const factor = (1 + difficultyRamp * eased) * rushRelief;
      state.intensity = factor;
      state.phase = phaseFor(progress);
      for (const lane of game.lanes) {
        for (const vehicle of lane.vehicles) {
          if (!vehicle.__premiumBaseSpeed) vehicle.__premiumBaseSpeed = vehicle.speed;
          vehicle.speed = vehicle.__premiumBaseSpeed * factor;
        }
      }
    }

    function grade() {
      const performanceScore = game.score * 2 + state.nearMisses * .45 + state.maxCombo * .7 + state.rushCount * 1.5;
      if (performanceScore >= 18) return "S";
      if (performanceScore >= 11) return "A";
      if (performanceScore >= 6) return "B";
      return "C";
    }

    function updateGameoverStats() {
      const near = document.querySelector("#aaa-final-near");
      const combo = document.querySelector("#aaa-final-combo");
      const gradeEl = document.querySelector("#aaa-grade");
      if (near) near.textContent = String(state.nearMisses);
      if (combo) combo.textContent = `x${state.maxCombo}`;
      if (gradeEl) gradeEl.textContent = grade();
    }

    function resetPremiumState() {
      state.combo = 0;
      state.maxCombo = 0;
      state.nearMisses = 0;
      state.hype = 0;
      state.maxHype = 0;
      state.rushTimer = 0;
      state.rushCount = 0;
      state.lastActionAt = 0;
      state.intensity = 0;
      state.phase = "AQUECIMENTO";
      state.seenVehicles = new WeakSet();
      state.timeBonus = 0;
      state.collisions = 0;
      updatePresentation();
      updateGameoverStats();
    }

    const originalUpdate = game.update.bind(game);
    game.update = (dt) => {
      tuneTraffic();
      originalUpdate(dt);
      if (!activeStates.has(game.state)) return;

      if (state.rushTimer > 0) {
        state.rushTimer = Math.max(0, state.rushTimer - dt);
        if (state.rushTimer === 0) {
          state.hype = 55;
          showCue("MODO PISTOLA FINALIZADO");
        }
      } else if (game.elapsed - state.lastActionAt > 1.2) {
        state.hype = Math.max(0, state.hype - dt * 3.6);
      }

      detectNearMisses();
      const nextPhase = phaseFor(clamp(game.elapsed / Math.max(1, game.duration), 0, 1));
      if (nextPhase !== state.phase) {
        state.phase = nextPhase;
        showCue(nextPhase);
      }
      updatePresentation();
    };

    const originalScorePoint = game.scorePoint.bind(game);
    game.scorePoint = () => {
      const before = game.score;
      originalScorePoint();
      if (game.score <= before) return;

      state.combo = Math.min(8, state.combo + 1);
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      const bonus = Math.min(2, .35 + state.combo * .18);
      const maxTime = game.duration + 12;
      const previousTime = game.timeLeft;
      game.timeLeft = Math.min(maxTime, game.timeLeft + bonus);
      state.timeBonus += Math.max(0, game.timeLeft - previousTime);
      addHype(10 + state.combo * 2);
      showCue(state.combo > 1 ? `TRAVESSIA x${state.combo}  +${bonus.toFixed(1)}s` : `TRAVESSIA!  +${bonus.toFixed(1)}s`, "score");
      if (state.combo > 1) accent("combo");
      vibrate(24);
      game.updateHud();
    };

    const originalCollision = game.handleCollision.bind(game);
    game.handleCollision = () => {
      const before = game.state;
      originalCollision();
      if (before === "playing" && game.state === "hit") {
        const hadCombo = state.combo > 1;
        state.combo = 0;
        state.collisions += 1;
        state.hype = Math.max(0, state.hype - 32);
        state.rushTimer = 0;
        state.lastActionAt = game.elapsed;
        if (hadCombo) showCue("SEQUÊNCIA QUEBRADA");
        vibrate([55, 35, 30]);
        updatePresentation();
      }
    };

    const originalResize = game.resizeCanvas.bind(game);
    game.resizeCanvas = (force = false) => {
      originalResize(force);
      for (const lane of game.lanes) for (const vehicle of lane.vehicles) delete vehicle.__premiumBaseSpeed;
      updatePresentation();
    };

    const originalFinish = game.finishGame.bind(game);
    game.finishGame = () => {
      originalFinish();
      updateGameoverStats();
    };

    const originalReset = game.resetGame.bind(game);
    game.resetGame = (initial = false) => {
      originalReset(initial);
      resetPremiumState();
    };

    game.__premiumSnapshot = () => ({
      combo: state.combo,
      maxCombo: state.maxCombo,
      nearMisses: state.nearMisses,
      hype: state.hype,
      maxHype: state.maxHype,
      rushTimer: state.rushTimer,
      rushCount: state.rushCount,
      phase: state.phase,
      timeBonus: state.timeBonus,
      collisions: state.collisions,
      grade: grade()
    });

    if (game.debug) {
      window.__aaaTest = Object.freeze({
        snapshot: () => game.__premiumSnapshot(),
        forceNearMiss: () => triggerNearMiss(),
        forceHype: (value = 100) => {
          state.hype = clamp(Number(value) || 0, 0, 100);
          if (state.hype >= 100) activateRush();
          updatePresentation();
          return state.hype;
        },
        clearCombo: () => { state.combo = 0; updatePresentation(); },
        grade: () => grade()
      });
    }

    reducedMotion.addEventListener?.("change", updatePresentation);
    resetPremiumState();
    return game;
  }

  window.initializeGame = () => installPremiumLayer(originalInitialize());
})();
