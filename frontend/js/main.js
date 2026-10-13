/* ===== Controle de telas e fluxo ===== */
(function () {
  /* polyfill CanvasRenderingContext2D.roundRect */
  if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = [r, r, r, r];
      this.moveTo(x + r[0], y);
      this.arcTo(x + w, y, x + w, y + h, r[1]);
      this.arcTo(x + w, y + h, x, y + h, r[2]);
      this.arcTo(x, y + h, x, y, r[3]);
      this.arcTo(x, y, x + w, y, r[0]);
      this.closePath();
    };
  }
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  Storage.load();
  AudioFX.enabled = Storage.settings.sound;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia('(pointer:coarse)').matches)) document.body.classList.add('touch');
  const IS_TOUCH = document.body.classList.contains('touch');

  let currentScreen = 'menu';
  let difficulty = 'medium';
  let game = null;
  let lastResult = null;
  let scoreSaved = false;

  /* ---------- navegação ---------- */
  function show(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + name).classList.add('active');
    currentScreen = name;
    if (name !== 'game') $('#overlay-pause').classList.remove('active');
    applyLayout();
  }

  /* ---------- layout responsivo: ocupa toda a área visível ---------- */
  const rootStyle = document.documentElement.style;
  const wrapEl = $('#game-wrap');
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  let curLayout = null, curSafe = { l: 0, r: 0, t: 0, b: 0 };
  let autoPaused = false, layoutRaf = 0;

  function applyLayout() {
    const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
    const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
    rootStyle.setProperty('--app-w', vw + 'px');
    rootStyle.setProperty('--app-h', vh + 'px');
    const lay = Game.computeLayout(vw, vh);
    wrapEl.style.setProperty('--gw', lay.cssW + 'px');
    wrapEl.style.setProperty('--gh', lay.cssH + 'px');
    /* áreas seguras (notch / barra home), descontando as barras pretas do próprio jogo */
    const cs = getComputedStyle(probe), mx = (vw - lay.cssW) / 2, my = (vh - lay.cssH) / 2;
    curSafe = {
      t: Math.max(0, (parseFloat(cs.paddingTop) || 0) - my), r: Math.max(0, (parseFloat(cs.paddingRight) || 0) - mx),
      b: Math.max(0, (parseFloat(cs.paddingBottom) || 0) - my), l: Math.max(0, (parseFloat(cs.paddingLeft) || 0) - mx),
    };
    /* tamanhos dos botões proporcionais à altura (mín. 44 px de toque) */
    rootStyle.setProperty('--mc', Math.max(48, Math.min(80, Math.round(lay.cssH * 0.17))) + 'px');
    rootStyle.setProperty('--pause', Math.max(44, Math.min(56, Math.round(lay.cssH * 0.12))) + 'px');
    curLayout = lay;
    if (game) game.applyLayout(lay, curSafe, IS_TOUCH, window.devicePixelRatio);
    updateOrientation(vw, vh);
  }

  /* celular/tablet na vertical durante a partida → pede para girar e pausa sem perder o progresso */
  function updateOrientation(vw, vh) {
    const need = IS_TOUCH && currentScreen === 'game' && vh > vw;
    document.body.classList.toggle('need-rotate', need);
    if (need) {
      releaseTouchControls();
      if (game && game.running && !game.paused && game.state === 'play') { game.togglePause(true); autoPaused = true; }
    } else if (autoPaused) {
      autoPaused = false;
      if (game && game.running && game.paused && !$('#overlay-pause').classList.contains('active')) game.togglePause(false);
    }
  }

  function scheduleLayout() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; applyLayout(); });
  }
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', () => { scheduleLayout(); setTimeout(applyLayout, 150); setTimeout(applyLayout, 450); });
  window.addEventListener('pageshow', scheduleLayout);
  document.addEventListener('fullscreenchange', scheduleLayout);
  document.addEventListener('webkitfullscreenchange', scheduleLayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout);

  /* evita zoom/rolagem acidentais durante a partida (sem bloquear os painéis) */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
  document.addEventListener('touchmove', e => {
    if (currentScreen === 'game' && !e.target.closest('.panel, #rotate-overlay')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('contextmenu', e => { if (currentScreen === 'game') e.preventDefault(); });

  const fsRoot = document.documentElement;
  const fsReq = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
  function toggleFullscreen() {
    if (!fsReq) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const r = fsReq.call(fsRoot);
    const lock = () => { if (IS_TOUCH && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); };
    if (r && r.then) r.then(lock).catch(() => {}); else lock();
  }
  /* iPhone/Safari não oferece tela cheia para páginas: esconde o botão em vez de deixá-lo morto */
  if (!fsReq) $('#btn-fullscreen').style.display = 'none';

  /* selo de modo teste */
  if (TEST_MODE.unlockAll) {
    const tag = document.createElement('div');
    tag.textContent = '🧪 MODO TESTE — ' + TEST_MODE.user + ' (todas as fases liberadas)';
    tag.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(255,213,79,.92);color:#2a2000;font:800 12px Segoe UI,Arial;padding:5px 10px;border-radius:8px;pointer-events:none;';
    document.body.appendChild(tag);
  }

  /* ---------- seleção de fases ---------- */
  function renderLevels() {
    const grid = $('#levels-grid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const unlocked = TEST_MODE.unlockAll || lv.id <= Storage.progress.unlocked;
      const stars = Storage.progress.stars[lv.id] || 0;
      const card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      card.innerHTML =
        '<img src="assets/backgrounds/bg' + lv.bg + '.jpg" alt="">' +
        '<div class="lvl-stars">' + '★'.repeat(stars) + '<span style="opacity:.35">' + '★'.repeat(3 - stars) + '</span></div>' +
        '<div class="lvl-num">' + lv.id + '</div>' +
        '<div class="lvl-name">' + lv.id + '. ' + lv.name + '<small>' + lv.mechName + '</small></div>';
      if (unlocked) card.addEventListener('click', () => { AudioFX.click(); startGame(i); });
      grid.appendChild(card);
    });
  }

  /* ---------- jogo ---------- */
  function startGame(levelIndex) {
    if (game) game.stop();
    game = new Game($('#game-canvas'), onGameEnd);
    touchDir.l = touchDir.r = false; autoPaused = false;
    document.querySelectorAll('.mc-btn.active').forEach(b => b.classList.remove('active'));
    game.applyLayout(curLayout || Game.computeLayout(window.innerWidth, window.innerHeight), curSafe, IS_TOUCH, window.devicePixelRatio);
    show('game');
    game.start(levelIndex, difficulty);
    applyLayout();
  }

  function onGameEnd(result) {
    lastResult = result;
    scoreSaved = false;
    if (result.win) {
      Storage.unlockLevel(Math.min(result.levelId + 1, LEVELS.length));
      Storage.setStars(result.levelId, result.stars);
    }
    Storage.addTotals(result.hits, result.win);
    const earned = awardRewards(result);
    Storage.save();
    fillResults(result);
    renderRewards(earned);
    show('results');
  }

  /* missão da fase + conquistas: cada recompensa é concedida uma única vez */
  function awardRewards(r) {
    const out = [];
    const lv = LEVELS[r.levelIndex];
    if (r.win && lv.mission && lv.mission.test(r) && Storage.grant('mission_' + lv.id, lv.mission.reward)) {
      out.push({ title: 'Missão: ' + lv.mission.text, reward: lv.mission.reward });
    }
    ACHIEVEMENTS.forEach(a => {
      if (!Storage.isClaimed('ach_' + a.id) && a.test(r, Storage.totals, Storage) && Storage.grant('ach_' + a.id, a.reward)) {
        out.push({ title: 'Conquista: ' + a.name, reward: a.reward });
      }
    });
    return out;
  }

  function renderRewards(list) {
    const box = $('#res-rewards');
    box.innerHTML = '';
    list.forEach(e => {
      const d = document.createElement('div');
      d.className = 'reward';
      d.textContent = '\u2605 ' + e.title + '  +' + e.reward + ' eco-pontos';
      box.appendChild(d);
    });
  }

  function renderAchievements() {
    $('#eco-total').textContent = Storage.rewards.eco;
    const mk = (ok, title, sub, reward) => {
      const d = document.createElement('div');
      d.className = 'achv' + (ok ? ' done' : '');
      const t = document.createElement('b'); t.textContent = (ok ? '\u2714 ' : '\u25CB ') + title;
      const s = document.createElement('span'); s.textContent = sub + '  (+' + reward + ')';
      d.appendChild(t); d.appendChild(s);
      return d;
    };
    const ml = $('#mission-list'); ml.innerHTML = '';
    LEVELS.forEach(lv => ml.appendChild(mk(Storage.isClaimed('mission_' + lv.id), 'Fase ' + lv.id + ' — ' + lv.name, lv.mission.text, lv.mission.reward)));
    const al = $('#achv-list'); al.innerHTML = '';
    ACHIEVEMENTS.forEach(a => al.appendChild(mk(Storage.isClaimed('ach_' + a.id), a.name, a.desc, a.reward)));
  }

  function fillResults(r) {
    const t = $('#res-title');
    t.textContent = r.win ? 'FASE CONCLUÍDA!' : ('FALHA — ' + (r.reason || 'TENTE NOVAMENTE'));
    t.classList.toggle('lose', !r.win);
    $('#res-stars').innerHTML = [1, 2, 3].map(i => '<span class="' + (i <= r.stars ? 'on' : '') + '">★</span>').join('');
    $('#res-score').textContent = r.score.toLocaleString('pt-BR');
    $('#res-hits').textContent = r.hits;
    $('#res-miss').textContent = r.errors;
    $('#res-combo').textContent = 'x' + r.maxCombo;
    const m = Math.floor(r.timeUsed / 60), s = Math.floor(r.timeUsed % 60);
    $('#res-time').textContent = m + ':' + String(s).padStart(2, '0');
    $('#res-level').textContent = r.levelId + '/' + LEVELS.length;
    const fl = (FACTS[r.levelId] || []);
    $('#res-fact').textContent = fl.length ? '💡 Você sabia? ' + fl[Math.floor(Math.random() * fl.length)] : '';
    $('#btn-next').style.display = (r.win && r.levelId < LEVELS.length) ? '' : 'none';
    /* ranking */
    $('#rank-name').value = Storage.settings.name || (TEST_MODE.unlockAll ? TEST_MODE.user : '');
    $('#rank-save').style.display = r.score > 0 ? '' : 'none';
    renderRanking(-1);
  }

  function renderRanking(highlight) {
    const tb = $('#rank-table tbody');
    tb.innerHTML = '';
    Storage.ranking.forEach((e, i) => {
      const tr = document.createElement('tr');
      if (i === highlight) tr.className = 'me';
      [i + 1, e.name, e.score.toLocaleString('pt-BR'), e.level].forEach(v => {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    if (Storage.ranking.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" style="color:#7aa87a">Sem pontuações ainda — seja o primeiro!</td>';
      tb.appendChild(tr);
    }
  }

  $('#btn-save-score').addEventListener('click', () => {
    if (scoreSaved || !lastResult) return;
    const name = Storage.cleanName($('#rank-name').value);
    Storage.setName(name);
    const pos = Storage.addScore(name, lastResult.score, lastResult.levelId);
    scoreSaved = true;
    $('#rank-save').style.display = 'none';
    renderRanking(pos);
    AudioFX.click();
  });

  /* ---------- botões ---------- */
  $('#btn-play').addEventListener('click', () => { AudioFX.click(); renderLevels(); show('levels'); });
  $('#btn-achv').addEventListener('click', () => { AudioFX.click(); renderAchievements(); show('achv'); });
  $('#btn-howto').addEventListener('click', () => { AudioFX.click(); show('howto'); });
  $('#btn-fullscreen').addEventListener('click', () => { AudioFX.click(); toggleFullscreen(); });
  $('#btn-sound').addEventListener('click', function () {
    AudioFX.enabled = !AudioFX.enabled;
    Storage.setSound(AudioFX.enabled);
    this.innerHTML = AudioFX.enabled ? '&#128266;' : '&#128263;';
    if (AudioFX.enabled) AudioFX.click();
  });
  $('#btn-sound').innerHTML = AudioFX.enabled ? '&#128266;' : '&#128263;';

  $$('.btn-back').forEach(b => b.addEventListener('click', () => { AudioFX.click(); show(b.dataset.goto); }));

  $$('.btn-diff').forEach(b => b.addEventListener('click', () => {
    AudioFX.click();
    difficulty = b.dataset.diff;
    $$('.btn-diff').forEach(x => x.classList.toggle('selected', x === b));
  }));

  $('#btn-pause-dom').addEventListener('click', () => pauseGame(true));
  $('#btn-resume').addEventListener('click', () => pauseGame(false));
  $('#btn-restart').addEventListener('click', () => {
    $('#overlay-pause').classList.remove('active');
    if (game) startGame(game.levelIndex);
  });
  $('#btn-rotate-quit').addEventListener('click', () => {
    if (game) game.stop();
    autoPaused = false; renderLevels(); show('levels');
  });
  $('#btn-quit').addEventListener('click', () => {
    if (game) game.stop();
    $('#overlay-pause').classList.remove('active');
    renderLevels(); show('levels');
  });

  $('#btn-next').addEventListener('click', () => { AudioFX.click(); startGame(Math.min(lastResult.levelIndex + 1, 7)); });
  $('#btn-replay').addEventListener('click', () => { AudioFX.click(); startGame(lastResult.levelIndex); });
  $('#btn-menu2').addEventListener('click', () => { AudioFX.click(); renderLevels(); show('levels'); });

  function pauseGame(v) {
    if (!game || !game.running) return;
    game.togglePause(v);
    $('#overlay-pause').classList.toggle('active', game.paused);
    AudioFX.click();
  }

  /* ---------- teclado ---------- */
  window.addEventListener('keydown', e => {
    if (currentScreen === 'menu' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault(); renderLevels(); show('levels'); return;
    }
    if (currentScreen !== 'game' || !game) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { pauseGame(!game.paused); }
    if (e.code === 'KeyR') {
      if (game.paused || confirm('Reiniciar a fase?')) {
        $('#overlay-pause').classList.remove('active');
        startGame(game.levelIndex);
      }
    }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!game.paused && !e.repeat) game.drop(); }
  });

  /* ---------- controles móveis (pointer events: toque, caneta e mouse) ---------- */
  const touchDir = { l: false, r: false };
  const releasers = [];
  function syncMove() { if (game) game._touchMove = (touchDir.r ? 1 : 0) - (touchDir.l ? 1 : 0); }
  function bindHold(id, onChange) {
    const el = $(id);
    let pid = null;
    const press = e => {
      if (pid !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (_) {}
      el.classList.add('active');
      onChange(true);
      e.preventDefault();
    };
    const release = e => {
      if (e && e.pointerId !== pid) return;
      if (pid === null) return;
      pid = null;
      el.classList.remove('active');
      onChange(false);
    };
    el.addEventListener('pointerdown', press);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => el.addEventListener(n, release));
    releasers.push(() => release(null));
  }
  function releaseTouchControls() { releasers.forEach(r => r()); touchDir.l = touchDir.r = false; syncMove(); }
  bindHold('#mc-left', v => { touchDir.l = v; syncMove(); });
  bindHold('#mc-right', v => { touchDir.r = v; syncMove(); });
  bindHold('#mc-drop', v => { if (v && game && !game.paused) game.drop(); });

  /* perda de foco / app em segundo plano: solta botões e pausa a partida */
  window.addEventListener('blur', () => { releaseTouchControls(); if (game) game.keys = {}; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseTouchControls(); if (game) game.keys = {};
      if (currentScreen === 'game' && game && game.running && !game.paused && game.state === 'play') pauseGame(true);
    }
  });

  /* ---------- arrastar e soltar no canvas (mouse / dedo) ---------- */
  const cv = $('#game-canvas');
  let dragPid = null;
  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  cv.addEventListener('pointerdown', e => {
    if (!game || currentScreen !== 'game' || dragPid !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = canvasPos(e);
    if (game.pointerDown(p.x, p.y)) {
      dragPid = e.pointerId;
      try { cv.setPointerCapture(dragPid); } catch (_) {}
      e.preventDefault();
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!game || e.pointerId !== dragPid) return;
    const p = canvasPos(e);
    game.pointerMove(p.x, p.y);
    e.preventDefault();
  });
  const endDrag = cancel => e => {
    if (e.pointerId !== dragPid) return;
    dragPid = null;
    if (!game || currentScreen !== 'game') return;
    const p = canvasPos(e);
    game.pointerUp(p.x, cancel ? -9999 : p.y);       /* cancelado: o resíduo volta a cair */
  };
  cv.addEventListener('pointerup', endDrag(false));
  cv.addEventListener('pointercancel', endDrag(true));
  cv.addEventListener('lostpointercapture', e => { if (e.pointerId === dragPid) endDrag(true)(e); });
  cv.style.touchAction = 'none';

  /* ---------- carregamento ---------- */
  Sprites.onProgress = (loaded, total) => {
    if (loaded >= total) { /* tudo pronto */ }
  };
  Sprites.loadAll();
  show('menu');
  applyLayout();
})();
