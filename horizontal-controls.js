(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const ACTIVE = new Set(["playing"]);

  function install(game) {
    if (!game?.input || game.__horizontalMovementInstalled) return;
    game.__horizontalMovementInstalled = true;
    const input = game.input;
    input.left = false;
    input.right = false;
    input.gamepadHorizontal = 0;

    const classifyHorizontal = (event) => {
      const key = String(event.key || "").toLowerCase();
      const code = event.code || "";
      const legacy = event.keyCode;
      if (key === "arrowleft" || key === "a" || code === "ArrowLeft" || code === "KeyA" || legacy === 37) return "left";
      if (key === "arrowright" || key === "d" || code === "ArrowRight" || code === "KeyD" || legacy === 39) return "right";
      return null;
    };

    window.addEventListener("keydown", (event) => {
      const action = classifyHorizontal(event);
      if (!action) return;
      event.preventDefault();
      if (input.touch && game.shouldPreferTVRemote?.()) input.activateTVMode();
      if (game.audio?.enabled) game.audio.unlock();
      input.lastKey = `${event.key || "?"} / ${event.code || "?"} / ${event.keyCode || 0}`;
      if (game.state === "ready") return;
      input[action] = true;
      game.wakeLoop?.();
    }, { passive: false });

    window.addEventListener("keyup", (event) => {
      const action = classifyHorizontal(event);
      if (!action) return;
      event.preventDefault();
      input[action] = false;
    }, { passive: false });

    const originalClear = input.clear.bind(input);
    input.clear = () => {
      originalClear();
      input.left = input.right = false;
      input.gamepadHorizontal = 0;
    };

    const originalGamepad = input.updateGamepad.bind(input);
    input.updateGamepad = () => {
      originalGamepad();
      if (!navigator.getGamepads) return;
      const pad = [...navigator.getGamepads()].find((candidate) => candidate?.connected);
      if (!pad) { input.gamepadHorizontal = 0; return; }
      const axis = Math.abs(pad.axes?.[0] || 0) >= .35 ? pad.axes[0] : 0;
      const left = !!pad.buttons?.[14]?.pressed;
      const right = !!pad.buttons?.[15]?.pressed;
      input.gamepadHorizontal = left ? -1 : right ? 1 : axis;
    };

    const originalNative = input.handleNative.bind(input);
    input.handleNative = (action, pressed, repeat = false) => {
      if (action === "left" || action === "right") {
        if (pressed && game.audio?.enabled) game.audio.unlock();
        input.lastKey = `Android TV: ${action} / ${pressed ? "pressionado" : "liberado"}`;
        if (game.state !== "ready") input[action] = !!pressed;
        return true;
      }
      return originalNative(action, pressed, repeat);
    };

    input.horizontalMovement = () => {
      const keyboard = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      return clamp(keyboard || input.gamepadHorizontal, -1, 1);
    };

    const originalUpdatePlayer = game.updatePlayer.bind(game);
    game.updatePlayer = (dt) => {
      const vertical = input.movement();
      originalUpdatePlayer(dt);
      if (!ACTIVE.has(game.state)) return;
      const horizontal = input.horizontalMovement();
      if (!horizontal) return;
      const speed = game.world.laneH * 3.15;
      const margin = Math.max(game.player.width * .55, game.world.laneH * .2);
      game.player.x = clamp(game.player.x + horizontal * speed * dt, margin, game.world.width - margin);
      if (!vertical) game.audio?.updateWalking(true, dt);
      game.player.state = "walking";
      game.markDirty?.();
    };

    const controls = document.querySelector("#touch-controls");
    if (controls && !document.querySelector("#touch-left")) {
      const style = document.createElement("style");
      style.textContent = `
        .touch #touch-controls { display:grid; grid-template-columns:repeat(3,auto); grid-template-rows:repeat(2,auto); justify-content:space-between; align-items:end; gap:8px; }
        #touch-left{grid-column:1;grid-row:2} #touch-up{grid-column:2;grid-row:1} #touch-down{grid-column:2;grid-row:2} #touch-right{grid-column:3;grid-row:2}
      `;
      document.head.appendChild(style);
      const makeButton = (id, label, glyph, direction) => {
        const button = document.createElement("button");
        button.className = "touch-button";
        button.id = id;
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.textContent = glyph;
        const release = (event) => {
          input.pointerDirections.delete(event.pointerId);
          button.classList.remove("pressed");
          input.syncPointers();
          input.left = [...input.pointerDirections.values()].includes("left");
          input.right = [...input.pointerDirections.values()].includes("right");
        };
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          input.pointerDirections.set(event.pointerId, direction);
          input[direction] = true;
          button.classList.add("pressed");
          try { button.setPointerCapture(event.pointerId); } catch (_) {}
        });
        ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach((type) => button.addEventListener(type, release, { passive:false }));
        return button;
      };
      controls.append(makeButton("touch-left", "Mover para esquerda", "◀", "left"));
      controls.append(makeButton("touch-right", "Mover para direita", "▶", "right"));
    }

    const originalHint = game.updateDeviceHint.bind(game);
    game.updateDeviceHint = (type) => {
      originalHint(type);
      const instruction = document.querySelector("#device-instruction");
      if (!instruction) return;
      if (type === "computer") instruction.textContent = "Use as setas ou W, A, S e D";
      if (type === "tv" || type === "gamepad") instruction.textContent = "Use o direcional ou analógico";
      if (type === "touch") instruction.textContent = "Use os quatro botões na tela";
    };
    game.updateDeviceHint(input.tv ? "tv" : input.touch ? "touch" : "computer");

    window.__horizontalControlsTest = {
      get playerX() { return game.player.x; },
      get minX() { return Math.max(game.player.width * .55, game.world.laneH * .2); },
      get maxX() { return game.world.width - this.minX; },
      move(direction, dt = .25) {
        input.left = direction < 0;
        input.right = direction > 0;
        game.updatePlayer(dt);
        input.left = input.right = false;
        return game.player.x;
      }
    };
  }

  window.addEventListener("DOMContentLoaded", () => install(window.travessiaGame), { once: true });
})();
