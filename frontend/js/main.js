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
  if ('ontouchstart' in window) document.body.classList.add('touch');

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
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

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
    show('game');
    game.start(levelIndex, difficulty);
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

  /* ---------- controles móveis ---------- */
  function bindHold(id, fn) {
    const el = $(id);
    const start = e => { e.preventDefault(); fn(1); };
    const end = e => { e.preventDefault(); fn(0); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end); el.addEventListener('mouseleave', end);
  }
  bindHold('#mc-left', v => { if (game) game._touchMove = v ? -1 : (game._touchMove === -1 ? 0 : game._touchMove); });
  bindHold('#mc-right', v => { if (game) game._touchMove = v ? 1 : (game._touchMove === 1 ? 0 : game._touchMove); });
  bindHold('#mc-drop', v => { if (v && game) game.drop(); });


  /* ---------- arrastar e soltar no canvas (mouse / toque) ---------- */
  const cv = $('#game-canvas');
  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    const src = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return { x: (src.clientX - r.left) * (1280 / r.width), y: (src.clientY - r.top) * (720 / r.height) };
  }
  function onDown(e) {
    if (!game || currentScreen !== 'game') return;
    const p = canvasPos(e);
    if (game.pointerDown(p.x, p.y)) e.preventDefault();
  }
  function onMove(e) {
    if (!game || currentScreen !== 'game') return;
    const p = canvasPos(e);
    game.pointerMove(p.x, p.y);
    if (game.dragged) e.preventDefault();
  }
  function onUp(e) {
    if (!game || currentScreen !== 'game') return;
    const p = canvasPos(e);
    game.pointerUp(p.x, p.y);
  }
  cv.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  cv.addEventListener('touchstart', onDown, { passive: false });
  cv.addEventListener('touchmove', onMove, { passive: false });
  cv.addEventListener('touchend', onUp);
  cv.addEventListener('touchcancel', onUp);
  cv.style.touchAction = 'none';

  /* ---------- carregamento ---------- */
  Sprites.onProgress = (loaded, total) => {
    if (loaded >= total) { /* tudo pronto */ }
  };
  Sprites.loadAll();
  show('menu');
})();
