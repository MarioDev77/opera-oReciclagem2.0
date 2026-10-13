/* ===== Motor do jogo — mecânica de arrastar e direcionar ===== */
/* Mundo lógico: altura fixa (720) e largura DINÂMICA (1280 .. MAX_W).
   O campo de jogo (lixeiras, queda dos resíduos, jogador) continua com os
   mesmos 1280 de largura, centralizado; a largura extra vira “laterais” do
   cenário onde ficam HUD e botões de toque. Assim a jogabilidade não muda. */
const BASE_W = 1280, H = 720, MAX_W = 1800;
let W = BASE_W;

class Game {
  constructor(canvas, onEnd) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onEnd = onEnd;
    this.keys = {};
    this.running = false;
    this.paused = false;
    this._timers = [];
    this._onKeyDown = null; this._onKeyUp = null;
    /* layout responsivo (preenchido por applyLayout) */
    this.cssScale = 1; this.pxScale = 1; this.hudK = 1; this.touchUI = false;
    this.safe = { l: 0, r: 0, t: 0, b: 0 };
  }

  get offX() { return (W - BASE_W) / 2; }

  /* tamanho CSS do jogo e largura lógica para uma janela vw x vh:
     - mais larga que 16:9 → o cenário se estende nas laterais (até MAX_W);
     - além de MAX_W → barras laterais mínimas; mais estreita que 16:9 → barras acima/abaixo */
  static computeLayout(vw, vh) {
    const minA = BASE_W / H, maxA = MAX_W / H, aspect = vw / vh;
    const a = Math.max(minA, Math.min(maxA, aspect));
    const cssH = aspect >= minA ? vh : vw / minA;
    return { logicalW: Math.round(H * a), cssW: Math.min(vw, Math.round(cssH * a)), cssH: Math.round(cssH) };
  }

  /* aplica um novo tamanho SEM reiniciar a partida: reposiciona o que já existe */
  applyLayout(lay, safeCss, touchUI, dpr) {
    const oldOff = this.offX;
    const widthChanged = lay.logicalW !== W;
    W = lay.logicalW;
    const d = this.offX - oldOff;
    this.cssScale = lay.cssH / H;
    this.pxScale = Math.max(0.75, Math.min(1.5, lay.cssH * Math.min(dpr || 1, 2) / H));
    const pw = Math.round(W * this.pxScale), ph = Math.round(H * this.pxScale);
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.touchUI = !!touchUI;
    this.hudK = Math.max(1, Math.min(2, 0.8 / this.cssScale));
    const cs = this.cssScale;
    this.safe = { l: safeCss.l / cs, r: safeCss.r / cs, t: safeCss.t / cs, b: safeCss.b / cs };
    if (widthChanged) Game._floors = {};
    if (d && this.items) {                       /* acompanha o deslocamento do campo central */
      this.items.forEach(it => { it.x += d; });
      this.particles.forEach(q => { q.x += d; });
      this.floats.forEach(f => { f.x += d; });
      BIN_ORDER.forEach(n => { this.binCur[n] += d; });
      this.controlX += d; this.pointer.x += d;
      if (this.seq) this.seq.x += d;
    }
  }

  /* ---------- ciclo de vida ---------- */
  start(levelIndex, difficulty) {
    this.stop();
    this._bindKeys();
    this.level = LEVELS[levelIndex];
    this.diff = DIFFICULTY[difficulty];
    this.levelIndex = levelIndex;
    this.score = 0;
    this.combo = 0; this.maxCombo = 0;
    this.hits = 0; this.errors = 0;
    this.timeLeft = this.level.time;
    this.spawnT = 0.6;
    this.items = [];
    this.particles = [];
    this.floats = [];
    this.binFx = {};
    this._lastWasWrong = false;
    this.msg = null; this.msgT = 0;
    /* controle único: jogador no chão (arrasta com o ponteiro ou usa o teclado) */
    this.controlX = W / 2;
    this.player = { animT: 0, pose: 'idle', hurtT: 0, face: 1, speed: 560 };
    this.held = null;     /* item levantado pelo jogador (teclado) */
    this.slots = BIN_ORDER.slice();           /* ordem atual das lixeiras (rodízio) */
    this.binCur = {}; BIN_ORDER.forEach((n, i) => { this.binCur[n] = BIN_X[i] + this.offX; });
    this.mt = 0; this.vx = 0;
    this.binV = {}; this.swapT = 0; this.learn = null; this.learnT = 0; this.turbA = 0;
    this.wind = { state: 'idle', t: 4.5, dir: 1 };
    this.tide = { state: 'idle', t: 5, bin: null };
    this.smog = 0; this.seq = null; this.chainType = null; this.chainN = 0;
    this.stats = { chains: 0 };
    this.dragged = null;  /* item arrastado pelo ponteiro */
    this.pointer = { x: 0, y: 0, active: false };
    this.state = 'play';
    this.running = true;
    this.paused = false;
    this.effects = { shield: false, magnet: 0, eco: 0 };
    if (this.level.mechTip) this._msg(this.level.mechName + ': ' + this.level.mechTip, '#ffd54f', 3.6);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(t => this._loop(t));
  }

  stop() {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this._timers.forEach(clearTimeout); this._timers = [];
    this._unbindKeys();
  }

  togglePause(force) {
    if (!this.running || this.state !== 'play') return;
    this.paused = (force !== undefined) ? force : !this.paused;
    if (!this.paused) this.lastTime = performance.now();
  }

  _bindKeys() {
    this._unbindKeys();
    this.keys = {};
    this._onKeyDown = e => {
      this.keys[e.code] = true;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = e => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _unbindKeys() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);
    this._onKeyDown = this._onKeyUp = null;
    this.keys = {};
    this._touchMove = 0;
  }

  /* ---------- loop ---------- */
  _loop(t) {
    if (!this.running) return;
    let dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    if (!this.paused && this.state === 'play') this._update(dt);
    this._render(dt);
    this.raf = requestAnimationFrame(tt => this._loop(tt));
  }

  _has(m) { return !!(this.level.mech && this.level.mech.includes(m)); }
  _binX(name) { return this.binCur[name]; }
  _isFlooded(name) { return this._has('tide') && this.tide.state === 'flood' && this.tide.bin === name; }

  _shuffleBins() {
    const cur = this.slots.join();
    let next = this.slots.slice();
    for (let k = 0; k < 30; k++) {
      next = this.slots.slice().sort(() => Math.random() - 0.5);
      if (next.join() !== cur) break;
    }
    this.slots = next; this.swapT = 1.2;
    this._msg('LIXEIRAS TROCARAM DE LUGAR!', '#ffd54f');
    AudioFX.special();
  }

  /* mecânicas exclusivas de cada fase */
  _updateMech(dt) {
    this.mt += dt;
    if (this.learnT > 0) this.learnT -= dt;
    if (this.swapT > 0) this.swapT -= dt;
    this.turbA += dt * (1.3 + (this.wind.state === 'blow' ? 6 : 0));
    const river = this._has('river'), ice = this._has('ice');
    const drift = river ? Math.sin(this.mt * 0.7) * 85 : (ice ? Math.sin(this.mt * 0.55) * 26 : 0);
    BIN_ORDER.forEach((n, bi) => {
      const tx = BIN_X[this.slots.indexOf(n)] + this.offX + drift + (ice ? Math.sin(this.mt * 0.8 + bi * 1.9) * 10 : 0);
      const old = this.binCur[n];
      this.binCur[n] += (tx - old) * Math.min(1, dt * (river ? 30 : (ice ? 2.6 : 7)));
      this.binV[n] = (this.binCur[n] - old) / Math.max(dt, 0.001);
      if (ice && Math.abs(this.binV[n]) > 18 && Math.random() < dt * 14)      /* poeirinha de gelo */
        this.particles.push({ x: this.binCur[n] - Math.sign(this.binV[n]) * 50, y: 706, vx: -this.binV[n] * 0.3, vy: -30, life: 0.5, color: '#eaf8ff', r: 2.5 });
    });

    if (this._has('wind')) {                       /* VENTO */
      const w = this.wind; w.t -= dt;
      if (w.state === 'idle' && w.t <= 0) {
        w.state = 'warn'; w.t = 1.3; w.dir = Math.random() < 0.5 ? -1 : 1;
        this._msg(w.dir > 0 ? 'VENTO PARA A DIREITA  >>' : '<<  VENTO PARA A ESQUERDA', '#bfe9ff', 1.3);
      } else if (w.state === 'warn' && w.t <= 0) { w.state = 'blow'; w.t = 2.6; }
      else if (w.state === 'blow') {
        for (const it of this.items) if (it.state === 'fall') it.x = Math.max(this.offX + 40, Math.min(this.offX + BASE_W - 40, it.x + w.dir * 95 * dt));
        if (w.t <= 0) { w.state = 'idle'; w.t = 6 + Math.random() * 3; }
      }
    }

    if (this._has('tide')) {                       /* MARÉ */
      const td = this.tide; td.t -= dt;
      if (td.state === 'idle' && td.t <= 0) {
        td.state = 'warn'; td.t = 1.5; td.bin = BIN_ORDER[Math.floor(Math.random() * 4)];
        this._msg('ONDA CHEGANDO!', '#9fe0ff', 1.5);
      } else if (td.state === 'warn' && td.t <= 0) { td.state = 'flood'; td.t = 3.2; }
      else if (td.state === 'flood' && td.t <= 0) { td.state = 'idle'; td.t = 7 + Math.random() * 3; td.bin = null; }
    }

    if (this._has('smog')) {                       /* POLUIÇÃO */
      this.smog = Math.min(1, this.smog + dt * 0.012);
      if (this.smog >= 1) this._finish(false, 'POLUIÇÃO TOTAL!');
    }
  }

  /* ---------- atualização ---------- */
  _update(dt) {
    const L = this.level;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; return this._finish(false, 'TEMPO ESGOTADO!'); }

    this._updateMech(dt);
    if (this.effects.magnet > 0) this.effects.magnet -= dt;
    if (this.effects.eco > 0) this.effects.eco -= dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.player.hurtT > 0) this.player.hurtT -= dt;

    /* controle horizontal (setas / A-D / botões) */
    let move = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) move -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) move += 1;
    if (this._touchMove) move += this._touchMove;
    move = Math.max(-1, Math.min(1, move));
    if (this._has('ice')) this.vx += (move * this.player.speed - this.vx) * Math.min(1, dt * 2.2);   /* GELO: inércia */
    else this.vx = move * this.player.speed;
    this.controlX += this.vx * dt;
    const cMin = this.offX + 60, cMax = this.offX + BASE_W - 60;
    if (this.controlX < cMin || this.controlX > cMax) { this.controlX = Math.max(cMin, Math.min(cMax, this.controlX)); this.vx = 0; }
    const p = this.player;
    if (move !== 0) { p.animT += dt; p.face = move > 0 ? 1 : -1; p.pose = (Math.floor(p.animT * 8) % 2 === 0) ? 'run1' : 'run2'; }
    else { p.pose = 'idle'; p.animT = 0; }

    /* spawn */
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.seq && this.seq.left > 0) {
        this._spawn(this.seq.type, Math.max(this.offX + 90, Math.min(this.offX + BASE_W - 90, this.seq.x + (Math.random() - 0.5) * 120)));
        this.seq.left--; this.spawnT = 0.5;
        if (this.seq.left <= 0) this.seq = null;
      } else {
        this._spawn();
        const [a, b] = L.spawn;
        this.spawnT = (a + Math.random() * (b - a)) * this.diff.spawn * this._ramp().spawn;
      }
    }

    /* itens */
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.rot += it.rotV * dt;

      if (it.state === 'fall') {
        if (it.kind === 'mat' && !it.mirage && this.effects.magnet > 0 && MATERIALS[it.type].bin) {
          const d = this.controlX - it.x;
          if (Math.abs(d) < 520) it.x += d * 3.2 * dt;
        }
        it.y += it.vy * dt;
        if (it.y > 700) {
          this.items.splice(i, 1);
          if (it.kind === 'mat' && !it.mirage && MATERIALS[it.type].bin) this._onMiss('RECICLÁVEL PERDIDO!', MATERIALS[it.type].label + ' é reciclável: vai na lixeira de ' + BIN_LABEL[MATERIALS[it.type].bin] + '.');
        }
      } else if (it.state === 'held') {
        /* preso na garra */
        it.x += (this.controlX - it.x) * Math.min(1, dt * 18);
        it.y = 520 + Math.sin(performance.now() / 200) * 5;
      } else if (it.state === 'dragged') {
        /* arrastado pelo ponteiro */
        it.x += (this.pointer.x - it.x) * Math.min(1, dt * 26);
        it.y += (this.pointer.y - it.y) * Math.min(1, dt * 26);
      } else if (it.state === 'deposit') {
        it.depT += dt;
        const bin = this.binCur[it.binTarget];
        it.x += (bin - it.x) * Math.min(1, dt * 14);
        it.y += (566 - it.y) * Math.min(1, dt * 10);
        if (it.depT > 0.34) { this.items.splice(i, 1); this._resolveDeposit(it); }
      }
    }

    /* partículas e textos */
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 320 * dt;
      if (q.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt; f.y -= 46 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (const k in this.binFx) { this.binFx[k] -= dt; if (this.binFx[k] <= 0) delete this.binFx[k]; }
  }

  /* progressão: quanto mais acertos, mais rápido (0 = começo da fase, 1 = meta) */
  _ramp() {
    const p = Math.min(1, this.hits / Math.max(1, this.level.goal));
    const st = this.level.id === 1 ? RAMP.startLevel1 : RAMP.start;
    return { speed: st + (RAMP.end - st) * p, spawn: RAMP.spawnStart + (1 - RAMP.spawnStart) * p };
  }

  _spawn(forceType, forceX) {
    const L = this.level;
    const roll = Math.random();
    const x = forceX != null ? forceX : this.offX + 90 + Math.random() * (BASE_W - 180);
    const [s0, s1] = L.speed;
    const vy = (s0 + Math.random() * (s1 - s0)) * this.diff.speed * this._ramp().speed;
    const base = { x, y: -50, vy, rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 4, state: 'fall', depT: 0 };
    if (forceType) { this.items.push({ ...base, kind: 'mat', type: forceType }); return; }
    if (roll < L.hazard) this.items.push({ ...base, kind: 'item', type: 'item_hazard' });
    else if (roll < L.hazard + L.special) {
      const type = SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
      this.items.push({ ...base, kind: 'item', type });
    } else {
      const pool = L.types.slice();
      if (L.organic > 0 && Math.random() < L.organic) pool.push(Math.random() < 0.5 ? 'mat_organic' : 'mat_trash');
      const type = pool[Math.floor(Math.random() * pool.length)];
      const item = { ...base, kind: 'mat', type };
      if (MATERIALS[type].bin) {
        if (this._has('ice') && Math.random() < 0.3) item.frozen = true;          /* GELO */
        if (this._has('mirage') && Math.random() < 0.2) item.mirage = true;       /* MIRAGEM */
        if (this._has('chain') && !item.mirage && Math.random() < 0.5) this.seq = { type, left: 2, x };  /* SEQUÊNCIA */
      }
      this.items.push(item);
    }
  }

  /* ---------- pegar / soltar (teclado/garra) ---------- */
  /* resíduo reciclável mais próximo do jogador (alvo do teclado) */
  _grabCandidate() {
    let best = null, bd = 115;
    for (const it of this.items) {
      if (it.state !== 'fall' || it.kind !== 'mat' || it.mirage || !MATERIALS[it.type].bin) continue;
      if (it.y < 110 || it.y > 640) continue;
      const d = Math.abs(it.x - this.controlX);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  grabOrDrop() {
    if (!this.running || this.paused || this.state !== 'play') return;
    if (this.held) { this._releaseHeld(); return; }
    const best = this._grabCandidate();
    if (!best) return;
    if (best.frozen) { this._thaw(best); return; }
    best.state = 'held'; this.held = best; AudioFX.catch();
  }

  _thaw(it) {
    it.frozen = false;
    this._burst(it.x, it.y, '#bfefff', 12);
    this._float(it.x, it.y - 30, 'QUEBROU O GELO!', '#bfefff');
    AudioFX.click();
  }

  _releaseHeld() {
    const it = this.held; this.held = null;
    if (!it) return;
    const bin = this._nearestBin(this.controlX, 100);
    if (bin) this._makeDeposit(it, bin);
    else { it.state = 'fall'; it.y = Math.min(it.y, 500); AudioFX.click(); }
  }

  drop() { this.grabOrDrop(); } /* alias */

  _nearestBin(x, maxDist) {
    let nearest = null, nd = maxDist || 95;
    BIN_ORDER.forEach(bin => {
      const d = Math.abs(this.binCur[bin] - x);
      if (d < nd) { nd = d; nearest = bin; }
    });
    return nearest;
  }

  _makeDeposit(it, binName) {
    it.state = 'deposit'; it.depT = 0; it.binTarget = binName;
    AudioFX.click();
  }

  /* ---------- ponteiro (mouse / toque): arrastar e soltar ---------- */
  pointerDown(x, y) {
    if (!this.running || this.paused || this.state !== 'play') return false;
    /* hit-test nos itens em queda */
    let best = null, bd = Math.max(52, 30 / this.cssScale);
    for (const it of this.items) {
      if (it.state !== 'fall') continue;
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return false;
    /* efeitos imediatos ao tocar */
    if (best.kind === 'item' && best.type !== 'item_hazard') {
      this.items.splice(this.items.indexOf(best), 1);
      this._applySpecial(best.type, best.x);
      return true;
    }
    if (best.kind === 'item' && best.type === 'item_hazard') {
      this.items.splice(this.items.indexOf(best), 1);
      this._penalty('BATERIA PERIGOSA!', 'Pilhas e baterias são perigosas: devem ir para pontos de coleta especiais.');
      this._burst(best.x, best.y, '#ff5544', 14);
      return true;
    }
    if (best.kind === 'mat' && !MATERIALS[best.type].bin) {
      this.items.splice(this.items.indexOf(best), 1);
      this._penalty(best.type === 'mat_organic' ? 'ORGÂNICO NÃO VAI NA LIXEIRA!' : 'LIXO COMUM NÃO É RECICLÁVEL!',
        best.type === 'mat_organic' ? 'Restos de comida são orgânicos: servem para compostagem, não para a reciclagem.' : 'Lixo comum (rejeito) não é reciclável: vai no lixo comum, não nas lixeiras coloridas.');
      this._burst(best.x, best.y, '#999999', 10);
      return true;
    }
    if (best.mirage) {                                   /* MIRAGEM: era falsa */
      this.items.splice(this.items.indexOf(best), 1);
      this._penalty('MIRAGEM! ISSO NÃO ERA REAL');
      this._burst(best.x, best.y, '#ffcf8a', 12);
      return true;
    }
    if (best.frozen) { this._thaw(best); return true; }   /* GELO: 1º toque quebra */
    /* reciclável: arrasta */
    best.state = 'dragged';
    this.dragged = best;
    this.pointer.x = x; this.pointer.y = y; this.pointer.active = true;
    AudioFX.catch();
    return true;
  }

  pointerMove(x, y) {
    this.pointer.x = x; this.pointer.y = y;
  }

  pointerUp(x, y) {
    if (!this.dragged) return;
    const it = this.dragged; this.dragged = null;
    this.pointer.active = false;
    const bin = (y > 470) ? this._nearestBin(x, 95) : null;
    if (bin) this._makeDeposit(it, bin);
    else { it.state = 'fall'; AudioFX.click(); }
  }

  /* ---------- resolução do depósito ---------- */
  _resolveDeposit(it) {
    const correctBin = MATERIALS[it.type].bin;
    this._lastWasWrong = false;
    if (this._isFlooded(it.binTarget)) {                  /* MARÉ: lixeira alagada */
      this._lastWasWrong = true;
      this._burst(this._binX(it.binTarget), 580, '#6cc6ff', 16);
      this._penalty('LIXEIRA ALAGADA!');
      return;
    }
    if (it.binTarget === correctBin) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      let pts = Math.round(100 * (1 + Math.min(this.combo - 1, 10) * 0.15));
      if (this.effects.eco > 0) pts *= 2;
      this.score += pts;
      this.hits++;
      AudioFX.correct();
      this.binFx[it.binTarget] = 0.5;
      const bx = this._binX(it.binTarget);
      this._burst(bx, 560, '#a5ffa5', 16);
      this._float(bx, 520, '+' + pts + (this.combo > 1 ? '  x' + this.combo : ''), '#d6ff8a');
      if (this.smog > 0) this.smog = Math.max(0, this.smog - 0.05);
      if (this._has('chain')) {                           /* SEQUÊNCIA: 3 iguais seguidos */
        if (this.chainType === it.type) this.chainN++; else { this.chainType = it.type; this.chainN = 1; }
        if (this.chainN >= 3) {
          this.score += 300; this.stats.chains++;
          this._float(bx, 470, 'SEQUÊNCIA! +300', '#ffe066'); this._msg('SEQUÊNCIA x3!  +300', '#ffe066');
          this.chainN = 0; this.chainType = null;
        }
      }
      if (this._has('rotate') && this.hits % 5 === 0 && this.hits < this.level.goal) this._shuffleBins();
      if (this.hits >= this.level.goal) {
        const bonus = Math.round(this.timeLeft) * 5;
        this.score += bonus;
        this._finish(true, null, bonus);
      }
    } else {
      this._lastWasWrong = true;
      this.binFx[it.binTarget] = 0.5;
      this._penalty('LIXEIRA ERRADA!', MATERIALS[it.type].label + ' vai na lixeira de ' + BIN_LABEL[correctBin] + '.');
      this._burst(this._binX(it.binTarget), 560, '#ff8877', 14);
    }
  }

  _onMiss(text, learn) { this._penalty(text, learn); }

  _teach(text) { this.learn = { text }; this.learnT = 4.2; }

  _penalty(text, learn) {
    if (learn) this._teach(learn);
    if (this.effects.shield) {
      this.effects.shield = false;
      this._msg('ESCUDO PROTEGEU!', '#9ecbff');
      AudioFX.shield();
      return;
    }
    this.score = Math.max(0, this.score - 50);
    this.combo = 0;
    this.chainN = 0; this.chainType = null;
    if (this._has('smog')) this.smog = Math.min(1, this.smog + 0.07);
    this.errors++;
    this.player.hurtT = 0.8;
    AudioFX.wrong();
    this._msg(text, '#ff9a8a');
    if (this.errors >= this.diff.maxErrors) this._finish(false, 'ERROS DEMAIS!');
  }

  _applySpecial(type, x) {
    if (type === 'item_clock') { this.timeLeft += 8; this._msg('+8 SEGUNDOS!', '#8fd3ff'); AudioFX.special(); }
    if (type === 'item_star') { this.score += 250; this._float(x, 540, '+250', '#ffe066'); AudioFX.special(); }
    if (type === 'item_shield') { this.effects.shield = true; this._msg('ESCUDO ATIVO!', '#9ecbff'); AudioFX.shield(); }
    if (type === 'item_magnet') { this.effects.magnet = 6; this._msg('ÍMÃ ATIVO (6s)!', '#ffb3c0'); AudioFX.special(); }
    if (type === 'item_eco') { this.effects.eco = 8; this._msg('BÔNUS ECOLÓGICO x2 (8s)!', '#a5ffa5'); AudioFX.special(); }
    this._burst(x, 580, '#ffe066', 12);
  }

  _finish(win, reason, bonus) {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.player.pose = win ? 'victory' : 'hurt';
    if (win) AudioFX.win(); else AudioFX.lose();
    const s2 = this.level.goal * 140, s3 = this.level.goal * 200;
    let stars = win ? 1 : 0;
    if (win && this.score >= s2) stars = 2;
    if (win && this.score >= s3 && this.errors === 0) stars = 3;
    const result = {
      win, reason, stars, bonus: bonus || 0,
      score: this.score, hits: this.hits, errors: this.errors,
      maxCombo: this.maxCombo, timeUsed: this.level.time - Math.max(this.timeLeft, 0),
      levelIndex: this.levelIndex, levelId: this.level.id,
      goal: this.level.goal, timeLeft: Math.max(this.timeLeft, 0), chains: this.stats.chains, smog: this.smog,
    };
    this._timers.push(setTimeout(() => { this.stop(); this.onEnd(result); }, win ? 1400 : 1100));
  }

  /* ---------- efeitos ---------- */
  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 80 + Math.random() * 220;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.5 + Math.random() * 0.4, color, r: 3 + Math.random() * 4 });
    }
  }
  _float(x, y, text, color) { this.floats.push({ x, y, text, color, life: 1.1 }); }
  _msg(text, color, dur) { this.msg = { text, color }; this.msgT = dur || 1.4; }

  /* piso neon (pré-renderizado uma vez) */
  _getFloor(id) {
    Game._floors = Game._floors || {};
    const th = Game.THEMES[id] || Game.THEMES[1];
    const key = (Game.THEMES[id] ? id : 1) + '_' + W;
    if (Game._floors[key]) return Game._floors[key];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const vg = c.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.45, H * 0.95);
    vg.addColorStop(0, 'rgba(0,20,10,0)'); vg.addColorStop(1, 'rgba(0,10,10,' + (th.vig == null ? 0.38 : th.vig) + ')');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    const top = 636;
    const sh = c.createLinearGradient(0, top - 50, 0, top);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, th.shadow || 'rgba(0,30,10,.45)');
    c.fillStyle = sh; c.fillRect(0, top - 50, W, 50);
    const fg = c.createLinearGradient(0, top, 0, H);
    fg.addColorStop(0, th.c0); fg.addColorStop(0.12, th.c1); fg.addColorStop(1, th.c2);
    c.fillStyle = fg; c.fillRect(0, top, W, H - top);
    c.save(); c.beginPath(); c.rect(0, top, W, H - top); c.clip();
    c.strokeStyle = th.line; c.lineWidth = 2;
    for (let i = -10; i <= 10; i++) {
      c.beginPath(); c.moveTo(W / 2 + i * 70, top); c.lineTo(W / 2 + i * 190, H); c.stroke();
    }
    for (let k = 1; k <= 3; k++) {
      const y = top + Math.pow(k / 3.2, 1.6) * (H - top);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.restore();
    if (th.decor) th.decor(c, top);
    c.save();
    c.shadowColor = th.glow; c.shadowBlur = 18;
    c.fillStyle = th.edge; c.fillRect(0, top - 2, W, 4);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(0, top - 1, W, 1);
    c.restore();
    Game._floors[key] = cv;
    return cv;
  }

  /* piso de cada fase: base em cache + animação própria */
  _drawFloor(c) {
    if (this._has('river')) { this._drawRiverFloor(c); return; }
    const id = this.level.id;
    c.drawImage(this._getFloor(id), 0, 0);
    const fx = this['_fx' + id];
    if (fx) fx.call(this, c, this.mt, 636);
    if (this._has('smog') && this.smog > 0) {            /* POLUIÇÃO: chão escurece e cai cinza */
      c.save();
      c.fillStyle = 'rgba(78,70,24,' + (this.smog * 0.55) + ')'; c.fillRect(0, 636, W, H - 636);
      c.fillStyle = 'rgba(60,54,30,.55)';
      const n = Math.floor(this.smog * 46);
      for (let i = 0; i < n; i++) {
        const x = (this._h(i + 91) * W + Math.sin(this.mt + i) * 18 + W) % W, y = (this.mt * (36 + (i % 5) * 12) + this._h(i + 5) * H) % H;
        c.beginPath(); c.arc(x, y, 1.5 + this._h(i + 17) * 2, 0, 6.29); c.fill();
      }
      c.restore();
    }
  }

  _h(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* 1 · FLORESTA: grama balançando e folhas no vento */
  _fx1(c, t, top) {
    const blow = this.wind && this.wind.state === 'blow' ? this.wind.dir : 0;
    c.save(); c.lineCap = 'round';
    for (let x = 4; x < W; x += 13) {
      const hh = 12 + this._h(x) * 16, sw = Math.sin(t * 2 + x * 0.05) * 3 + blow * 9;
      c.strokeStyle = this._h(x + 9) > 0.5 ? '#7dff4a' : '#3fa845'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(x, top + 4); c.quadraticCurveTo(x + sw * 0.4, top - hh * 0.5, x + sw, top - hh); c.stroke();
    }
    if (blow) for (let i = 0; i < 8; i++) {
      const x = (((t * (260 + i * 40) * blow + i * 191) % (W + 160)) + (W + 160)) % (W + 160) - 80;
      const y = top + 20 + this._h(i) * 55 + Math.sin(t * 6 + i) * 8;
      c.fillStyle = i % 2 ? '#8fd14f' : '#d9b84a';
      c.save(); c.translate(x, y); c.rotate(t * 5 + i); c.beginPath(); c.ellipse(0, 0, 9, 4, 0, 0, 6.29); c.fill(); c.restore();
    }
    c.restore();
  }

  /* 3 · CIDADE: pisca-pisca no meio-fio */
  _fx3(c, t, top) {
    c.save();
    for (let x = 40; x < W; x += 160) {
      const on = Math.sin(t * 3 + x) > 0;
      c.fillStyle = on ? 'rgba(255,90,70,.95)' : 'rgba(255,255,255,.55)';
      c.shadowColor = on ? '#ff5a46' : '#fff'; c.shadowBlur = on ? 12 : 4;
      c.beginPath(); c.arc(x, top + 9, 4, 0, 6.29); c.fill();
    }
    c.restore();
  }

  /* 4 · MONTANHA: brilhos no gelo e neve caindo */
  _fx4(c, t, top) {
    c.save();
    for (let i = 0; i < 16; i++) {
      const x = this._h(i) * W, y = top + 10 + this._h(i + 40) * 70, a = Math.max(0, Math.sin(t * 2.2 + i * 2));
      c.strokeStyle = 'rgba(255,255,255,' + a * 0.9 + ')'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - 8 * a, y); c.lineTo(x + 8 * a, y); c.moveTo(x, y - 8 * a); c.lineTo(x, y + 8 * a); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 46; i++) {
      const sp = 38 + (i % 5) * 14, x = this._h(i + 7) * W + Math.sin(t * 0.9 + i) * 22, y = (t * sp + this._h(i) * H) % (H + 20) - 10;
      c.globalAlpha = 0.45 + this._h(i + 3) * 0.5;
      c.beginPath(); c.arc(x, y, 1.6 + this._h(i + 5) * 2.2, 0, 6.29); c.fill();
    }
    c.restore();
  }

  /* 5 · PRAIA: ondas avançando sobre a areia molhada */
  _fx5(c, t, top) {
    const ph = 0.5 + 0.5 * Math.sin(t * 0.85);
    const fr = x => top + 4 + ph * 54 + Math.sin(x * 0.02 + t * 1.2) * 7 + Math.sin(x * 0.05 - t * 1.7) * 3;
    const wet = x => top + 4 + 60 + Math.sin(x * 0.02 + 1) * 6;
    c.save();
    c.beginPath(); c.moveTo(0, top);
    for (let x = 0; x <= W; x += 14) c.lineTo(x, wet(x));
    c.lineTo(W, top); c.closePath(); c.fillStyle = 'rgba(110,78,36,' + (0.22 + (1 - ph) * 0.14) + ')'; c.fill();
    const wg = c.createLinearGradient(0, top, 0, top + 64);
    wg.addColorStop(0, 'rgba(40,170,200,.80)'); wg.addColorStop(1, 'rgba(170,235,240,.62)');
    c.beginPath(); c.moveTo(0, top);
    for (let x = 0; x <= W; x += 14) c.lineTo(x, fr(x));
    c.lineTo(W, top); c.closePath(); c.fillStyle = wg; c.fill();
    c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 4;
    c.beginPath();
    for (let x = 0; x <= W; x += 10) x ? c.lineTo(x, fr(x)) : c.moveTo(x, fr(x));
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = fr(x) - 12 - ph * 6; x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 26; i++) { const x = this._h(i) * W; c.beginPath(); c.arc(x, fr(x) + 3 + Math.sin(t * 3 + i) * 2, 2 + this._h(i + 2) * 2, 0, 6.29); c.fill(); }
    c.restore();
  }

  /* 6 · DESERTO: miragem de calor e bolas de arbusto rolando */
  _fx6(c, t, top) {
    c.save();
    c.strokeStyle = 'rgba(255,240,200,.14)'; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      for (let x = 0; x <= W; x += 16) { const y = top - 14 - k * 14 + Math.sin(x * 0.03 + t * 2.4 + k) * 4; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    if (!Game._weed) {                              /* bola de arbusto seca (feita 1x) */
      const w = document.createElement('canvas'); w.width = w.height = 96;
      const g = w.getContext('2d'); g.translate(48, 48); g.lineCap = 'round';
      const pt = (i, k) => { const a = this._h(i * 11 + k) * 6.29, r = 44 * Math.sqrt(0.35 + this._h(i * 13 + k) * 0.65); return [Math.cos(a) * r, Math.sin(a) * r]; };
      for (let i = 0; i < 110; i++) {
        const p0 = pt(i, 1), p1 = pt(i, 2), cp = [(this._h(i * 17) - 0.5) * 70, (this._h(i * 19) - 0.5) * 70];
        const dark = this._h(i * 5) > 0.55;
        g.strokeStyle = dark ? 'rgba(96,70,36,.85)' : 'rgba(176,142,84,.8)';
        g.lineWidth = 0.9 + this._h(i * 7) * 1.1;
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(cp[0], cp[1], p1[0], p1[1]); g.stroke();
      }
      Game._weed = w;
    }
    for (let i = 0; i < 3; i++) {
      const sz = 64 + i * 14, sp = 90 + i * 35;
      const x = (((t * sp + i * 470) % (W + 240)) + (W + 240)) % (W + 240) - 120;
      const bounce = Math.abs(Math.sin(t * (2.6 + i * 0.4) + i)) * (14 + i * 5);
      const y = 676 + i * 8 - bounce;
      c.globalAlpha = 0.28; c.fillStyle = '#3a2410';
      c.beginPath(); c.ellipse(x, 690 + i * 8, sz * 0.42, 6, 0, 0, 6.29); c.fill();
      c.globalAlpha = 1;
      c.save(); c.translate(x, y - sz * 0.25); c.rotate(x / (sz * 0.4)); c.drawImage(Game._weed, -sz / 2, -sz / 2, sz, sz); c.restore();
    }
    c.restore();
  }

  /* 7 · METRÓPOLE: energia verde correndo pela plataforma (mais forte com a sequência) */
  _fx7(c, t, top) {
    const boost = 1 + Math.min(this.chainN || 0, 3) * 0.6;
    c.save(); c.lineCap = 'round';
    /* anel de energia que expande a partir do centro */
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.35 * boost + k * 0.5) % 1;
      c.globalAlpha = (1 - ph) * 0.7; c.strokeStyle = '#9dff6a'; c.lineWidth = 3 * (1 - ph) + 1;
      c.shadowColor = '#7dff4a'; c.shadowBlur = 14;
      c.beginPath(); c.ellipse(W / 2, top + 118, 120 + ph * 560, 22 + ph * 90, 0, 0, 6.29); c.stroke();
    }
    c.globalAlpha = 1;
    /* pulsos descendo pelas linhas da plataforma */
    for (let i = -9; i <= 9; i += 2) {
      const p = (t * 0.28 * boost + this._h(i + 30)) % 1;
      const pt = q => [W / 2 + i * (70 + 120 * q), top + (H - top) * q];
      const a = pt(Math.max(0, p - 0.16)), e = pt(p);
      const g = c.createLinearGradient(a[0], a[1], e[0], e[1]);
      g.addColorStop(0, 'rgba(125,255,74,0)'); g.addColorStop(1, 'rgba(210,255,150,.95)');
      c.strokeStyle = g; c.lineWidth = 3; c.shadowColor = '#7dff4a'; c.shadowBlur = 10;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]); c.stroke();
    }
    /* vaga-lumes de energia subindo */
    c.shadowBlur = 10;
    for (let i = 0; i < 20; i++) {
      const ph = (t * (0.10 + this._h(i) * 0.08) + this._h(i + 3)) % 1;
      const x = this._h(i + 8) * W + Math.sin(t * 1.4 + i) * 14, y = H - ph * (H - top + 90);
      c.globalAlpha = Math.sin(ph * Math.PI) * 0.9; c.fillStyle = '#d9ff8a'; c.shadowColor = '#b6ff5a';
      c.beginPath(); c.arc(x, y, 1.8 + this._h(i + 5) * 1.8, 0, 6.29); c.fill();
    }
    c.restore();
  }

  /* 9 · CRISÓPOLIS: pedras da praça brilhando, eólicas girando e pétalas ao vento */
  _fx9(c, t, top) {
    const blow = this.wind && this.wind.state === 'blow' ? this.wind.dir : 0;
    c.save();
    for (let i = 0; i < 18; i++) {
      const x = this._h(i + 200) * W, y = top + 10 + this._h(i + 230) * 70, a = Math.max(0, Math.sin(t * 2 + i * 2.3));
      c.fillStyle = 'rgba(255,255,230,' + a * 0.8 + ')';
      c.beginPath(); c.arc(x, y, 1.4 + a * 1.8, 0, 6.29); c.fill();
    }
    [[58, 76], [1224, 64]].forEach(m => {                 /* mini eólicas */
      const x = m[0], y = top - 4, h = m[1];
      c.strokeStyle = '#f2f6fa'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke();
      c.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        const a = this.turbA + k * 2.094;
        c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + Math.cos(a) * 34, y - h + Math.sin(a) * 34); c.stroke();
      }
      c.fillStyle = '#9dff6a'; c.beginPath(); c.arc(x, y - h, 5, 0, 6.29); c.fill();
    });
    if (blow) for (let i = 0; i < 9; i++) {
      const x = (((t * (250 + i * 38) * blow + i * 173) % (W + 160)) + (W + 160)) % (W + 160) - 80;
      const y = top + 14 + this._h(i + 3) * 60 + Math.sin(t * 6 + i) * 8;
      c.fillStyle = ['#ff7eb6', '#ffd54f', '#8fd14f'][i % 3];
      c.save(); c.translate(x, y); c.rotate(t * 5 + i); c.beginPath(); c.ellipse(0, 0, 7, 3.5, 0, 0, 6.29); c.fill(); c.restore();
    }
    c.restore();
  }

  /* 8 · PLANETA: estrelas e aurora no horizonte */
  _fx8(c, t, top) {
    c.save();
    for (let i = 0; i < 40; i++) {
      const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.8 + i * 1.7));
      c.fillStyle = 'rgba(255,255,255,' + a + ')';
      c.beginPath(); c.arc(this._h(i) * W, top + 8 + this._h(i + 60) * 74, 1 + this._h(i + 9) * 1.6, 0, 6.29); c.fill();
    }
    const ag = c.createLinearGradient(0, top - 70, 0, top);
    ag.addColorStop(0, 'rgba(110,255,170,0)'); ag.addColorStop(1, 'rgba(110,255,170,' + (0.16 + Math.sin(t * 1.4) * 0.07) + ')');
    c.fillStyle = ag; c.fillRect(0, top - 70, W, 70);
    c.restore();
  }

  /* ---------- render ---------- */
  _render() {
    const c = this.ctx;
    const ps = this.pxScale;
    c.setTransform(ps, 0, 0, ps, 0, 0);       /* coordenadas lógicas (W x 720) → pixels reais */
    const bg = Sprites.bg(this.level.bg);
    if (bg && bg.complete && bg.width) {
      /* fundo proporcional (cover): sem esticar; recorta só o excesso decorativo, mais por baixo (o piso cobre a base) */
      const sc = Math.max(W / bg.width, H / bg.height), dw = bg.width * sc, dh = bg.height * sc;
      c.drawImage(bg, (W - dw) / 2, -(dh - H) * 0.3, dw, dh);
    } else { c.fillStyle = '#123'; c.fillRect(0, 0, W, H); }
    this._drawFloor(c);
    if (this._has('smog') && this.smog > 0) {            /* POLUIÇÃO: névoa descendo do topo */
      const sg = c.createLinearGradient(0, 0, 0, H * (0.45 + this.smog * 0.5));
      sg.addColorStop(0, 'rgba(70,75,35,' + (0.15 + this.smog * 0.6) + ')'); sg.addColorStop(1, 'rgba(70,75,35,0)');
      c.fillStyle = sg; c.fillRect(0, 0, W, H);
    }

    for (const it of this.items) this._drawItem(c, it);

    this._drawWind(c);

    /* lixeiras */
    BIN_ORDER.forEach(bin => {
      const img = Sprites.get('bin_' + bin);
      const fx = this.binFx[bin];
      const bx = this.binCur[bin];
      let scale = 1;
      if (fx) scale = 1 + Math.sin(fx * 20) * 0.06;
      const bw = 152 * scale, bh = 170 * scale;
      const bv = this.binV[bin] || 0;
      if (this._has('ice')) {                           /* GELO: marcas de derrapagem */
        const len = Math.min(110, Math.abs(bv) * 1.1), sg = -Math.sign(bv);
        c.save(); c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.55)';
        for (let k = -1; k <= 1; k++) { c.lineWidth = 2 + (k === 0 ? 1 : 0); c.beginPath(); c.moveTo(bx + k * 26, 706 + k * 5); c.lineTo(bx + k * 26 + sg * len, 706 + k * 5); c.stroke(); }
        c.globalAlpha = 0.28; c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(bx, 710, 82, 12, 0, 0, 6.29); c.fill();
        c.restore();
      }
      if (this.swapT > 0 && Math.abs(bv) > 30) {        /* RODÍZIO: rastro de movimento */
        c.save();
        for (let k = 1; k <= 3; k++) {
          c.globalAlpha = 0.2 / k * Math.min(1, this.swapT * 2);
          c.drawImage(img, bx - bw / 2 - Math.max(-130, Math.min(130, bv * 0.035)) * k, 712 - bh, bw, bh);
        }
        c.restore();
      }
      if (this._has('river')) this._drawBinInWater(c, img, bin, bx, bw, bh);
      else c.drawImage(img, bx - bw / 2, 712 - bh, bw, bh);
      if (fx) {
        c.save();
        c.globalAlpha = Math.min(fx * 1.6, 0.55);
        c.fillStyle = this._lastWasWrong ? '#ff5544' : '#a5ffa5';
        c.beginPath(); c.ellipse(bx, 620, 62, 72, 0, 0, 6.29); c.fill();
        c.restore();
      }
      this._drawTide(c, bin, bx);
      if (this.swapT > 0) {                              /* RODÍZIO: setas girando acima da lixeira */
        c.save(); c.globalAlpha = Math.min(1, this.swapT * 1.5);
        c.translate(bx, 520 - Math.sin(this.swapT * 6) * 6); c.rotate(this.swapT * 5);
        c.strokeStyle = '#ffe066'; c.lineWidth = 5; c.lineCap = 'round'; c.shadowColor = '#ffd54f'; c.shadowBlur = 10;
        c.beginPath(); c.arc(0, 0, 20, 0.3, 4.2); c.stroke();
        c.beginPath(); c.moveTo(14, -16); c.lineTo(22, -2); c.lineTo(6, -4); c.closePath(); c.fillStyle = '#ffe066'; c.fill();
        c.restore();
      }
      /* alvo quando carregando/arrastando */
      if ((this.held || this.dragged) && Math.abs(this.controlX - bx) < 100) {
        c.save();
        c.globalAlpha = 0.35 + Math.sin(performance.now() / 120) * 0.15;
        c.strokeStyle = this._isFlooded(bin) ? '#ff6b5e' : '#eaffea'; c.lineWidth = 4; c.setLineDash([10, 8]);
        c.beginPath(); c.ellipse(bx, 612, 78, 88, 0, 0, 6.29); c.stroke();
        c.restore();
      }
    });

    /* destaque do resíduo que o teclado vai pegar */
    if (!this.held && !this.dragged && this.state === 'play') {
      const cand = this._grabCandidate();
      if (cand) {
        c.save();
        c.globalAlpha = 0.55 + Math.sin(performance.now() / 140) * 0.25;
        c.strokeStyle = '#d6ff8a'; c.lineWidth = 3; c.setLineDash([7, 6]);
        c.beginPath(); c.arc(cand.x, cand.y, 46, 0, 6.29); c.stroke();
        c.restore();
      }
    }

    /* jogador */
    this._drawClawAndPlayer(c);

    for (const q of this.particles) {
      c.globalAlpha = Math.max(q.life * 1.6, 0);
      c.fillStyle = q.color;
      c.beginPath(); c.arc(q.x, q.y, q.r, 0, 6.29); c.fill();
    }
    c.globalAlpha = 1;

    c.textAlign = 'center';
    for (const f of this.floats) {
      c.globalAlpha = Math.min(f.life * 1.4, 1);
      c.font = '800 22px Segoe UI, Arial';
      c.fillStyle = '#0a2412'; c.fillText(f.text, f.x + 2, f.y + 2);
      c.fillStyle = f.color; c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;

    this._drawHUD(c);
    const my = Math.max(100, this.safe.t + 8 + 90 * this.hudK);   /* y das mensagens centrais */

    if (this.msgT > 0 && this.msg) {
      c.globalAlpha = Math.min(this.msgT, 1);
      let fs = 32;
      c.font = '900 ' + fs + 'px Segoe UI, Arial';
      while (c.measureText(this.msg.text).width > W - 140 && fs > 16) { fs -= 2; c.font = '900 ' + fs + 'px Segoe UI, Arial'; }
      const tw = c.measureText(this.msg.text).width;
      c.fillStyle = 'rgba(4,24,13,.8)';
      c.beginPath(); c.roundRect(W / 2 - tw / 2 - 22, my, tw + 44, 50, 12); c.fill();
      c.strokeStyle = 'rgba(150,255,110,.5)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = this.msg.color;
      c.fillText(this.msg.text, W / 2, my + 34);
      c.globalAlpha = 1;
    }

    if (this.learnT > 0 && this.learn) {                /* DICA EDUCATIVA */
      c.globalAlpha = Math.min(this.learnT, 1);
      const txt = '💡 ' + this.learn.text;
      let fs = 22; c.font = '800 ' + fs + 'px Segoe UI, Arial';
      while (c.measureText(txt).width > W - 180 && fs > 14) { fs -= 1; c.font = '800 ' + fs + 'px Segoe UI, Arial'; }
      const tw = c.measureText(txt).width;
      c.fillStyle = 'rgba(8,40,62,.9)';
      c.beginPath(); c.roundRect(W / 2 - tw / 2 - 20, my + 60, tw + 40, 44, 12); c.fill();
      c.strokeStyle = 'rgba(127,208,255,.7)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#e4f7ff'; c.textAlign = 'center'; c.fillText(txt, W / 2, my + 60 + 29);
      c.globalAlpha = 1;
    }

    if (this.player.hurtT > 0) {
      c.fillStyle = 'rgba(255,40,20,' + (this.player.hurtT * 0.28) + ')';
      c.fillRect(0, 0, W, H);
    }
  }

  /* ---------- RIO: piso de água animada ---------- */
  _waveY(x, t, amp) { return Math.sin(x * 0.012 + t * 1.6) * amp + Math.sin(x * 0.027 - t * 2.3) * amp * 0.5; }

  _drawRiverFloor(c) {
    const t = this.mt, top = 636;
    c.save();
    /* sombra de transição com a margem */
    const sh = c.createLinearGradient(0, top - 50, 0, top);
    sh.addColorStop(0, 'rgba(0,30,40,0)'); sh.addColorStop(1, 'rgba(0,40,55,.4)');
    c.fillStyle = sh; c.fillRect(0, top - 50, W, 50);
    /* corpo d'água */
    const g = c.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, '#2f9fc4'); g.addColorStop(0.35, '#17789f'); g.addColorStop(1, '#0a3b5c');
    c.beginPath(); c.moveTo(0, H); c.lineTo(0, top + this._waveY(0, t, 4));
    for (let x = 0; x <= W; x += 16) c.lineTo(x, top + this._waveY(x, t, 4));
    c.lineTo(W, H); c.closePath(); c.fillStyle = g; c.fill();
    c.clip();
    /* faixas de luz que escorrem com a correnteza */
    c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const sp = 60 + (i % 5) * 28, row = (i * 53) % (H - top - 14);
      const y = top + 14 + row, k = (y - top) / (H - top);
      const x = (((i * 211 + t * sp) % (W + 240)) + (W + 240)) % (W + 240) - 120;
      const len = 50 + (i % 4) * 28 + k * 40;
      c.strokeStyle = 'rgba(190,240,255,' + (0.10 + k * 0.14) + ')'; c.lineWidth = 2 + k * 2;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + len / 2, y + Math.sin(t * 2 + i) * 4, x + len, y); c.stroke();
    }
    /* reflexos brilhando */
    for (let i = 0; i < 22; i++) {
      const x = (i * 97 + 40) % W, y = top + 12 + ((i * 61) % (H - top - 20));
      const a = Math.max(0, Math.sin(t * 2.4 + i * 1.9));
      c.fillStyle = 'rgba(255,255,255,' + (a * 0.55) + ')';
      c.beginPath(); c.arc(x, y, 1.5 + a * 2, 0, 6.29); c.fill();
    }
    /* bolhas subindo */
    for (let i = 0; i < 14; i++) {
      const ph = ((t * (0.18 + (i % 3) * 0.06) + i * 0.37) % 1);
      const x = (i * 131 + 70) % W + Math.sin(t * 2 + i) * 8, y = H - ph * (H - top);
      c.strokeStyle = 'rgba(220,250,255,' + (0.5 * (1 - ph)) + ')'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 3 + (i % 3) * 1.5, 0, 6.29); c.stroke();
    }
    c.restore();
    /* espuma na superfície */
    c.save();
    c.strokeStyle = 'rgba(235,252,255,.85)'; c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath();
    for (let x = 0; x <= W; x += 12) { const y = top + this._waveY(x, t, 4); x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.strokeStyle = 'rgba(160,225,245,.45)'; c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x <= W; x += 12) { const y = top + 16 + this._waveY(x + 90, t * 0.9, 3); x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    /* folhas flutuando */
    for (let i = 0; i < 4; i++) {
      const x = (((i * 337 + t * (38 + i * 9)) % (W + 120)) + (W + 120)) % (W + 120) - 60;
      const y = top + 8 + this._waveY(x, t, 4) + i * 3;
      c.fillStyle = i % 2 ? '#5aa844' : '#7cc24f';
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.5 + i) * 0.35);
      c.beginPath(); c.ellipse(0, 0, 11, 4.5, 0, 0, 6.29); c.fill(); c.restore();
    }
    c.restore();
  }

  /* lixeira meio afundada, balançando, com ondulações ao redor */
  _drawBinInWater(c, img, bin, bx, bw, bh) {
    const t = this.mt, i = BIN_ORDER.indexOf(bin);
    const bob = Math.sin(t * 2.1 + i * 1.7) * 5;
    const tilt = Math.sin(t * 1.6 + i * 2.3) * 0.045 + (this.binCur[bin] - this.offX - BIN_X[this.slots.indexOf(bin)]) * 0.0006;
    const sink = 30;                                   /* quanto desce na água */
    const waterY = 660 + this._waveY(bx, t, 4);
    /* sombra na água */
    c.save(); c.globalAlpha = 0.25; c.fillStyle = '#021c2e';
    c.beginPath(); c.ellipse(bx, waterY + 24, bw * 0.46, 10, 0, 0, 6.29); c.fill(); c.restore();
    /* parte de cima (fora da água) */
    c.save();
    c.beginPath(); c.rect(bx - 150, 0, 300, waterY + 1); c.clip();
    c.translate(bx, 712 + sink + bob); c.rotate(tilt);
    c.drawImage(img, -bw / 2, -bh, bw, bh);
    c.restore();
    /* parte submersa: aparece azulada e distorcida */
    c.save();
    c.beginPath(); c.rect(bx - 150, waterY, 300, H - waterY); c.clip();
    c.translate(bx + Math.sin(t * 3 + i) * 2, 712 + sink + bob); c.rotate(tilt);
    c.globalAlpha = 0.85; c.drawImage(img, -bw / 2, -bh, bw, bh);
    c.setTransform(this.pxScale, 0, 0, this.pxScale, 0, 0);
    const wg = c.createLinearGradient(0, waterY, 0, H);
    wg.addColorStop(0, 'rgba(47,159,196,.55)'); wg.addColorStop(1, 'rgba(8,60,92,.8)');
    c.globalAlpha = 1; c.fillStyle = wg; c.fillRect(bx - 150, waterY, 300, H - waterY);
    c.restore();
    /* ondulações e espuma ao redor da lixeira */
    c.save();
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.55 + k / 3 + i * 0.21) % 1;
      c.globalAlpha = (1 - ph) * 0.7; c.strokeStyle = '#e6fbff'; c.lineWidth = 2.5 * (1 - ph) + 0.6;
      c.beginPath(); c.ellipse(bx, waterY + 2, bw * 0.46 + ph * 46, 5 + ph * 11, 0, 0, 6.29); c.stroke();
    }
    c.globalAlpha = 1; c.strokeStyle = 'rgba(240,253,255,.95)'; c.lineWidth = 3.5; c.lineCap = 'round';
    c.beginPath();
    for (let x = -bw * 0.5; x <= bw * 0.5; x += 8) {
      const y = waterY + Math.sin(x * 0.18 + t * 5 + i) * 2.5;
      x === -bw * 0.5 ? c.moveTo(bx + x, y) : c.lineTo(bx + x, y);
    }
    c.stroke();
    /* gotas respingando */
    for (let k = 0; k < 4; k++) {
      const ph = (t * 1.3 + k * 0.25 + i * 0.13) % 1;
      c.globalAlpha = (1 - ph) * 0.85; c.fillStyle = '#d8f6ff';
      c.beginPath(); c.arc(bx + (k - 1.5) * bw * 0.26 + Math.sin(k * 5 + i) * 6, waterY - Math.sin(ph * Math.PI) * 18, 2.4 * (1 - ph) + 0.8, 0, 6.29); c.fill();
    }
    c.restore();
  }

  /* faixas de vento e aviso */
  _drawWind(c) {
    if (!this._has('wind') || this.wind.state === 'idle') return;
    const w = this.wind, t = performance.now() / 1000;
    c.save();
    if (w.state === 'warn') {
      c.globalAlpha = 0.5 + Math.sin(t * 14) * 0.3;
      c.fillStyle = '#d8f2ff'; c.font = '900 64px Segoe UI, Arial'; c.textAlign = 'center';
      c.fillText(w.dir > 0 ? '>>' : '<<', w.dir > 0 ? this.offX + BASE_W - 90 : this.offX + 90, 330);
    } else {
      c.strokeStyle = 'rgba(235,250,255,.55)'; c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const sp = 500 + (i % 4) * 140;
        let x = ((t * sp * w.dir + i * 173) % (W + 300) + (W + 300)) % (W + 300) - 150;
        const y = 150 + ((i * 97) % 440);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + w.dir * 70, y); c.stroke();
      }
    }
    c.restore();
  }

  /* onda sobre uma lixeira (maré) */
  _drawTide(c, bin, bx) {
    if (!this._has('tide') || this.tide.bin !== bin || this.tide.state === 'idle') return;
    const t = performance.now() / 1000;
    c.save();
    if (this.tide.state === 'warn') {
      c.globalAlpha = 0.55 + Math.sin(t * 14) * 0.35;
      c.strokeStyle = '#7fd0ff'; c.lineWidth = 5; c.setLineDash([12, 8]);
      c.beginPath(); c.ellipse(bx, 620, 84, 96, 0, 0, 6.29); c.stroke();
      c.setLineDash([]); c.fillStyle = '#bfe9ff'; c.font = '900 40px Segoe UI, Arial'; c.textAlign = 'center';
      c.fillText('~', bx, 500);
    } else {
      c.beginPath(); c.rect(bx - 90, 520, 180, 200); c.clip();
      const top = 585 + Math.sin(t * 3) * 5;
      c.fillStyle = 'rgba(40,150,235,.7)';
      c.beginPath(); c.moveTo(bx - 90, 720); c.lineTo(bx - 90, top);
      for (let x = -90; x <= 90; x += 10) c.lineTo(bx + x, top + Math.sin(t * 5 + x * 0.09) * 7);
      c.lineTo(bx + 90, 720); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(220,245,255,.9)'; c.lineWidth = 3; c.stroke();
    }
    c.restore();
  }

  _drawItem(c, it) {
    const img = Sprites.get(it.type);
    if (!img || !img.complete) return;
    c.save();
    c.translate(it.x, it.y);
    if (it.mirage) {                                  /* MIRAGEM: tremula e fica translúcida */
      const t = performance.now() / 1000;
      c.translate(Math.sin(t * 9 + it.y * 0.05) * 4, 0);
      c.globalAlpha = 0.38 + Math.sin(t * 5 + it.x) * 0.1;
      c.shadowColor = '#ffd9a0'; c.shadowBlur = 14;
    }
    c.rotate(it.rot);
    if (it.kind === 'item') {
      const pulse = 1 + Math.sin(performance.now() / 150) * 0.08;
      c.shadowColor = '#ffe066'; c.shadowBlur = 14;
      c.drawImage(img, -30 * pulse, -30 * pulse, 60 * pulse, 60 * pulse);
    } else {
      c.drawImage(img, -32, -32, 64, 64);
    }
    if (it.frozen) {                                  /* GELO: bloco que precisa quebrar */
      c.rotate(-it.rot);
      c.fillStyle = 'rgba(170,230,255,.55)'; c.strokeStyle = 'rgba(235,250,255,.95)'; c.lineWidth = 3;
      c.shadowColor = '#bfefff'; c.shadowBlur = 12;
      c.beginPath(); c.roundRect(-40, -40, 80, 80, 14); c.fill(); c.stroke();
      c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-22, -26); c.lineTo(-8, -10); c.moveTo(14, 24); c.lineTo(26, 8); c.stroke();
    }
    c.restore();
    /* indicador de arrasto */
    if (it.state === 'dragged') {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.setLineDash([6,6]);
      c.beginPath(); c.arc(it.x, it.y, 42, 0, 6.29); c.stroke();
      c.restore();
    }
  }

  _drawClawAndPlayer(c) {
    const x = this.controlX;
    const p = this.player;
    let pose = (this.state === 'over') ? p.pose : p.pose;
    if (p.hurtT > 0.3) pose = 'hurt';
    const img = Sprites.get((this.levelIndex % 2 === 0 ? 'crisoman_' : 'crisogril_') + pose);
    const dw = 128, dh = 150;
    c.save();
    if (this.effects.shield) {
      c.save();
      c.shadowColor = '#7fc4ff'; c.shadowBlur = 16;
      c.strokeStyle = 'rgba(140,200,255,.9)'; c.lineWidth = 4;
      c.fillStyle = 'rgba(120,180,255,.12)';
      c.beginPath(); c.arc(x, 625, 88, 0, 6.29); c.fill(); c.stroke();
      c.restore();
    }
    if (p.face < 0) { c.translate(x, 0); c.scale(-1, 1); c.translate(-x, 0); }
    c.drawImage(img, x - dw / 2, 706 - dh, dw, dh);
    c.restore();
  }

  _drawHUD(c) {
    const L = this.level, k = this.hudK, sf = this.safe;
    const top = sf.t + 8, left = sf.l + 10, right = W - sf.r - 10;
    const pauseW = 56 / this.cssScale;                 /* espaço do botão de pausa (DOM) */
    const LW = 370, RW = 260;                          /* larguras (unidades do HUD) dos blocos laterais */

    /* ---- bloco esquerdo: pontos, tempo, vidas, combo ---- */
    c.save(); c.translate(left, top); c.scale(k, k);
    c.textAlign = 'left';
    this._panel(c, 0, 0, LW, 46);
    c.font = '800 20px Segoe UI, Arial';
    c.fillStyle = '#ffd54f'; c.fillText('PONTOS', 16, 30);
    c.fillStyle = '#eaffea'; c.fillText(String(this.score).padStart(5, '0'), 106, 30);
    c.fillStyle = '#8fd3ff'; c.fillText('TEMPO ' + this._fmt(this.timeLeft), 220, 30);
    for (let i = 0; i < this.diff.maxErrors; i++) {
      c.font = '20px Arial';
      c.fillStyle = i < this.diff.maxErrors - this.errors ? '#ff6b81' : '#3a3a3a';
      c.fillText('♥', 20 + i * 26, 74);
    }
    c.font = '800 18px Segoe UI, Arial';
    if (this.combo > 1) { c.fillStyle = '#a5ffa5'; c.fillText('COMBO x' + this.combo, 20 + this.diff.maxErrors * 26 + 14, 74); }
    let ey = 98;
    c.font = '700 14px Segoe UI, Arial';
    if (this._has('chain') && this.chainN > 0) { c.fillStyle = '#ffe066'; c.fillText('SEQUÊNCIA ' + this.chainN + '/3', 16, ey); ey += 20; }
    if (this.effects.magnet > 0) { c.fillStyle = '#ffb3c0'; c.fillText('ÍMÃ ' + this.effects.magnet.toFixed(1) + 's', 16, ey); ey += 20; }
    if (this.effects.eco > 0) { c.fillStyle = '#a5ffa5'; c.fillText('x2 ECOLÓGICO ' + this.effects.eco.toFixed(1) + 's', 16, ey); }
    c.restore();

    /* ---- bloco direito: fase, meta, mecânica, poluição (à esquerda do botão de pausa) ---- */
    c.save(); c.translate(right - pauseW, top); c.scale(k, k);
    c.textAlign = 'right';
    this._panel(c, -RW, 0, RW, 46);
    c.fillStyle = '#ffd54f';
    const ttl = 'FASE ' + L.id + ' — ' + L.name;
    let tf = 17; c.font = '800 ' + tf + 'px Segoe UI, Arial';
    while (c.measureText(ttl).width > RW - 24 && tf > 11) { tf -= 1; c.font = '800 ' + tf + 'px Segoe UI, Arial'; }
    c.fillText(ttl, -12, 20);
    c.fillStyle = '#bfe6bf'; c.font = '700 14px Segoe UI, Arial';
    c.fillText('META: ' + this.hits + '/' + L.goal, -12, 40);
    const mtx = 'MECÂNICA: ' + (L.mechName || '');
    let mf = 13; c.font = '800 ' + mf + 'px Segoe UI, Arial';
    while (c.measureText(mtx).width > RW - 12 && mf > 9) { mf -= 1; c.font = '800 ' + mf + 'px Segoe UI, Arial'; }
    c.fillStyle = '#9fe6ff'; c.fillText(mtx, -12, 66);
    if (this._has('smog')) {
      this._panel(c, -RW, 74, RW, 18, 9);
      c.fillStyle = this.smog > 0.7 ? '#d65a3a' : this.smog > 0.4 ? '#d6b13a' : '#7acb5a';
      c.beginPath(); c.roundRect(-RW + 4, 78, Math.max(2, 252 * this.smog), 10, 5); c.fill();
      c.textAlign = 'left'; c.font = '800 11px Segoe UI, Arial'; c.fillStyle = '#eaffea';
      c.fillText('POLUIÇÃO ' + Math.round(this.smog * 100) + '%', -RW + 8, 103);
    }
    c.restore();

    /* ---- centro: barra de progresso + dica (largura se adapta ao espaço livre) ---- */
    const leftEnd = left + LW * k + 12, rightStart = right - pauseW - RW * k - 12;
    const half = Math.min(W / 2 - leftEnd, rightStart - W / 2);
    const cw = Math.max(110, Math.min(360, (2 * half) / k));
    c.save(); c.translate(W / 2, top); c.scale(k, k);
    this._panel(c, -cw / 2, 0, cw, 24, 12);
    const pct = Math.min(this.hits / L.goal, 1);
    if (pct > 0) { c.fillStyle = '#6fd356'; c.beginPath(); c.roundRect(-cw / 2 + 4, 4, (cw - 8) * pct, 16, 8); c.fill(); }
    c.textAlign = 'center'; c.font = '700 14px Segoe UI, Arial';
    let hint;
    if (this.held) hint = 'ESPAÇO solta na lixeira';
    else if (this.dragged) hint = 'Solte sobre a lixeira!';
    else hint = this.touchUI ? 'ARRASTE o resíduo até a lixeira' : 'ARRASTE o resíduo até a lixeira  •  ou ← → + ESPAÇO';
    const hw = c.measureText(hint).width;
    c.fillStyle = 'rgba(6,26,13,.75)';
    c.beginPath(); c.roundRect(-hw / 2 - 14, 54, hw + 28, 26, 10); c.fill();
    c.fillStyle = '#d6ff8a';
    c.fillText(hint, 0, 72);
    c.restore();
  }

  _panel(c, x, y, w, h, r = 12) {
    c.save();
    c.fillStyle = 'rgba(4,24,13,.82)';
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(150,255,110,.6)'; c.lineWidth = 2;
    c.shadowColor = 'rgba(110,255,70,.55)'; c.shadowBlur = 8;
    c.stroke();
    c.restore();
  }

  _fmt(t) {
    t = Math.max(0, Math.ceil(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
}


/* ===== Temas de piso por fase (cores + decoração estática) ===== */
Game.THEMES = {
  1: { c0:'#16553a', c1:'#0d3b27', c2:'#04180e', line:'rgba(120,255,110,.16)', edge:'#b6ff7a', glow:'#7dff4a' },
  3: { c0:'#4a4f58', c1:'#363a42', c2:'#17191e', line:'rgba(255,255,255,.10)', edge:'#ffd54f', glow:'#ffb300', shadow:'rgba(10,10,20,.5)',
       decor(c, top) {                              /* faixa tracejada de rua + faixa de pedestre */
         c.fillStyle = 'rgba(255,255,255,.55)';
         for (let x = 10; x < W; x += 110) c.fillRect(x, 700, 60, 5);
         c.fillStyle = 'rgba(255,255,255,.13)';
         for (let x = 330; x < 950; x += 46) c.fillRect(x, top + 6, 26, 24);
         c.fillStyle = 'rgba(0,0,0,.35)';
         [[120, 676], [1150, 684]].forEach(m => { c.beginPath(); c.ellipse(m[0], m[1], 26, 8, 0, 0, 6.29); c.fill(); });
       } },
  4: { c0:'#d5eefa', c1:'#a9d6ec', c2:'#5f9cc2', line:'rgba(255,255,255,.35)', edge:'#ffffff', glow:'#9fe6ff', vig:0.22, shadow:'rgba(20,50,80,.4)',
       decor(c, top) {                              /* rachaduras no gelo */
         c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.6; c.lineCap = 'round';
         for (let i = 0; i < 9; i++) {
           let x = 80 + i * 140, y = top + 12 + (i % 3) * 22;
           c.beginPath(); c.moveTo(x, y);
           for (let k = 0; k < 5; k++) { x += 14 + (k * 7 + i * 3) % 18; y += ((k * 11 + i * 5) % 17) - 8; c.lineTo(x, y); }
           c.stroke();
         }
         c.fillStyle = 'rgba(255,255,255,.4)';
         [[200, 650], [520, 690], [900, 660], [1120, 700]].forEach(m => { c.beginPath(); c.ellipse(m[0], m[1], 38, 7, 0, 0, 6.29); c.fill(); });
       } },
  5: { c0:'#e6cf9c', c1:'#d3b878', c2:'#a98c55', line:'rgba(120,85,40,.12)', edge:'#f4e2b0', glow:'#fff1c2', vig:0.2, shadow:'rgba(90,60,20,.35)',
       decor(c, top) {                              /* conchas e estrelas-do-mar */
         c.fillStyle = 'rgba(255,255,255,.35)';
         for (let i = 0; i < 40; i++) { c.beginPath(); c.arc((i * 83) % W, top + 8 + (i * 37) % 76, 1.5, 0, 6.29); c.fill(); }
         [[330, 692], [640, 676], [960, 700], [1200, 668]].forEach((m, i) => {
           c.fillStyle = i % 2 ? '#f5d9c6' : '#f1b9a4';
           c.beginPath(); c.ellipse(m[0], m[1], 14, 10, 0.3, 0, 6.29); c.fill();
           c.strokeStyle = 'rgba(150,90,70,.5)'; c.lineWidth = 1.5;
           for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(m[0] + k * 4, m[1] + 8); c.lineTo(m[0] + k * 2, m[1] - 8); c.stroke(); }
         });
         c.fillStyle = '#ee8a3a'; c.save(); c.translate(105, 690); c.beginPath();
         for (let k = 0; k < 10; k++) { const r = k % 2 ? 6 : 17, a = k * Math.PI / 5 - Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
         c.closePath(); c.fill(); c.restore();
       } },
  6: { c0:'#dcb56b', c1:'#c4994d', c2:'#8d6633', line:'rgba(120,80,30,.14)', edge:'#ffd98a', glow:'#ffc04a', vig:0.25, shadow:'rgba(90,50,10,.4)',
       decor(c, top) {                              /* cactos, pedras e capim seco */
         const cactus = (x, y, h) => {
           const w = h * 0.17;
           c.fillStyle = 'rgba(60,35,10,.3)'; c.beginPath(); c.ellipse(x + 8, y + 2, w * 1.9, 7, 0, 0, 6.29); c.fill();
           c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#3b8a45'; c.lineWidth = w * 0.72;
           c.beginPath(); c.moveTo(x, y - h * 0.4); c.lineTo(x - w * 1.8, y - h * 0.4); c.lineTo(x - w * 1.8, y - h * 0.72); c.stroke();
           c.beginPath(); c.moveTo(x, y - h * 0.55); c.lineTo(x + w * 1.8, y - h * 0.55); c.lineTo(x + w * 1.8, y - h * 0.84); c.stroke();
           const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
           g.addColorStop(0, '#2d7438'); g.addColorStop(0.45, '#58b25c'); g.addColorStop(1, '#2a6a35');
           c.fillStyle = g; c.beginPath(); c.roundRect(x - w / 2, y - h, w, h, w / 2); c.fill();
           c.strokeStyle = 'rgba(15,60,25,.45)'; c.lineWidth = 1.5;
           [-0.18, 0.18].forEach(o => { c.beginPath(); c.moveTo(x + w * o, y - h + 8); c.lineTo(x + w * o, y - 4); c.stroke(); });
           c.fillStyle = 'rgba(255,245,200,.85)';
           for (let k = 0; k < 14; k++) c.fillRect(x - w / 2 + 2 + (k * 7) % (w - 4), y - h + 12 + (k * 23) % (h - 20), 1.6, 1.6);
           c.fillStyle = '#f2679a'; c.beginPath(); c.arc(x, y - h - 2, 5, 0, 6.29); c.fill();
         };
         [[62, 662, 120], [352, 650, 92], [642, 660, 104], [926, 648, 88], [1214, 664, 116]].forEach(m => cactus(m[0], m[1], m[2]));
         c.fillStyle = '#9a7a4a';
         [[260, 700], [560, 688], [790, 704], [1110, 692]].forEach(m => { c.beginPath(); c.ellipse(m[0], m[1], 14, 8, 0, 0, 6.29); c.fill(); });
         c.strokeStyle = '#a8883f'; c.lineWidth = 2; c.lineCap = 'round';
         [180, 450, 720, 1000, 1160].forEach((x, i) => { for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x, 690 + i % 2 * 8); c.lineTo(x + k * 6, 674 + i % 2 * 8 - Math.abs(k) * 2); c.stroke(); } });
       } },
  7: { c0:'#13553f', c1:'#0b3a2c', c2:'#03130e', line:'rgba(125,255,110,.20)', edge:'#7dff4a', glow:'#7dff4a', shadow:'rgba(0,25,15,.5)',
       decor(c, top) {                              /* plataforma tech: anéis neon como na arte da fase */
         c.save(); c.beginPath(); c.rect(0, top, W, H - top); c.clip();
         c.lineCap = 'round'; c.shadowColor = '#7dff4a'; c.shadowBlur = 14;
         [[600, 118, 'rgba(125,255,74,.55)', 4], [455, 82, 'rgba(125,255,74,.32)', 3]].forEach(r => {
           c.strokeStyle = r[2]; c.lineWidth = r[3];
           c.beginPath(); c.ellipse(W / 2, top + 118, r[0], r[1], 0, 0, 6.29); c.stroke();
         });
         c.shadowBlur = 0; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 6;
         c.beginPath(); c.ellipse(W / 2, top + 118, 520, 100, 0, 0, 6.29); c.stroke();
         /* marcas de circuito */
         c.strokeStyle = 'rgba(160,255,140,.35)'; c.lineWidth = 2;
         for (let i = 0; i < 24; i++) {
           const x = 30 + i * 52, y = top + 14 + (i * 29) % 60;
           c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18, y); c.lineTo(x + 26, y + 8); c.stroke();
           c.fillStyle = 'rgba(160,255,140,.5)'; c.beginPath(); c.arc(x + 26, y + 8, 2, 0, 6.29); c.fill();
         }
         c.restore();
       } },
  9: { c0:'#8591c4', c1:'#626f9f', c2:'#232c52', line:'rgba(255,255,255,.12)', edge:'#9dff6a', glow:'#7dff4a', vig:0.22, shadow:'rgba(20,30,70,.45)',
       decor(c, top) {                              /* calçamento de pedras da praça */
         c.save(); c.beginPath(); c.rect(0, top, W, H - top); c.clip();
         const h = i => { const x = Math.sin(i * 91.7 + 13.3) * 43758.5; return x - Math.floor(x); };
         let n = 0;
         for (let row = 0; row < 7; row++) {
           const y = top + 4 + row * 13 + row * row * 0.6, rh = 11 + row * 0.8;
           for (let x = -((row % 2) * 24); x < W; x += 46) {
             c.fillStyle = h(++n) > 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(10,15,50,.16)';
             c.beginPath(); c.roundRect(x + 2, y, 42, rh, 3); c.fill();
           }
         }
         c.strokeStyle = 'rgba(255,255,255,.30)'; c.lineWidth = 5; c.lineCap = 'round';
         [[44, 5], [66, 7]].forEach(m => { c.beginPath(); for (let x = 0; x <= W; x += 14) { const y = top + m[0] + Math.sin(x * 0.03 + m[1]) * 6; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); });
         c.restore();
       } },
  8: { c0:'#2d1b52', c1:'#1b1038', c2:'#07041a', line:'rgba(150,255,190,.22)', edge:'#9dffb8', glow:'#6dff9a', shadow:'rgba(10,0,40,.5)' }
};
