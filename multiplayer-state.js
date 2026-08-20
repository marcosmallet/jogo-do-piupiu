(() => {
  "use strict";
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function install(game) {
    if (!game || game.__multiplayerStateInstalled) return;
    game.__multiplayerStateInstalled = true;
    const seen = [new WeakSet(), new WeakSet()];
    const normalize = () => {
      if (game.playerMode !== 2) return;
      game.players.forEach((p) => {
        if (!Number.isFinite(p.combo)) p.combo = 0;
        if (!Number.isFinite(p.maxCombo)) p.maxCombo = 0;
        if (!Number.isFinite(p.nearMisses)) p.nearMisses = 0;
        if (!Number.isFinite(p.adrenaline)) p.adrenaline = 0;
        if (!Number.isFinite(p.rushTimer)) p.rushTimer = 0;
      });
    };
    document.addEventListener("click", (event) => {
      if (event.target.closest?.(".player-mode-option")) queueMicrotask(normalize);
    }, true);
    const originalUpdate = game.update.bind(game);
    game.update = (dt) => {
      normalize();
      originalUpdate(dt);
      if (game.playerMode !== 2 || game.state !== "playing") return;
      const speed = game.world.laneH * 3.15 * .12;
      game.players.forEach((p, index) => {
        p.rushTimer = Math.max(0, p.rushTimer - dt);
        if (p.rushTimer > 0) {
          const s = game.multiplayerInput[index];
          const x = clamp(((s.right ? 1 : 0) - (s.left ? 1 : 0)) || s.gamepadX, -1, 1);
          const y = clamp(((s.down ? 1 : 0) - (s.up ? 1 : 0)) || s.gamepadY, -1, 1);
          const margin = Math.max(p.width * .55, game.world.laneH * .2);
          p.x = clamp(p.x + x * speed * dt, margin, game.world.width - margin);
          p.y = clamp(p.y + y * speed * dt, game.world.topLimit, game.world.bottomLimit);
        }
        const box = p.hitbox;
        const pad = game.world.laneH * .18;
        const near = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
        for (const lane of game.lanes) for (const vehicle of lane.vehicles) {
          if (seen[index].has(vehicle)) continue;
          const r = lane.getRect(vehicle, game.world);
          const overlaps = box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y;
          const nearOverlap = near.x < r.x + r.w && near.x + near.w > r.x && near.y < r.y + r.h && near.y + near.h > r.y;
          if (!overlaps && nearOverlap) {
            seen[index].add(vehicle);
            p.nearMisses += 1;
            p.adrenaline = Math.min(100, p.adrenaline + 12);
            if (p.adrenaline >= 100) { p.adrenaline = 0; p.rushTimer = 3; }
          }
        }
      });
    };
    const originalReset = game.resetGame.bind(game);
    game.resetGame = (initial = false) => {
      originalReset(initial);
      seen[0] = new WeakSet(); seen[1] = new WeakSet();
      normalize();
    };
    const oldTest = window.__gameTest || {};
    const oldSnapshot = oldTest.multiplayerSnapshot;
    window.__gameTest = Object.freeze({ ...oldTest, multiplayerSnapshot: () => {
      const snap = oldSnapshot ? oldSnapshot() : {};
      if (snap.players) snap.players = snap.players.map((item, i) => ({ ...item, rushTimer: game.players[i]?.rushTimer || 0 }));
      return snap;
    }});
    normalize();
  }
  window.addEventListener("DOMContentLoaded", () => install(window.travessiaGame), { once: true });
})();
