/* ===== Persistência (LocalStorage) ===== */
const Storage = {
  KEY: 'crisoverde_save_v1',

  data: null,

  load() {
    try {
      this.data = JSON.parse(localStorage.getItem(this.KEY)) || {};
    } catch (e) { this.data = {}; }
    this.data.settings = this.data.settings || { sound:true, name:'' };
    this.data.progress = this.data.progress || { unlocked:1, stars:{} };
    this.data.rewards  = this.data.rewards || { eco:0, claimed:{} };
    this.data.rewards.claimed = this.data.rewards.claimed || {};
    this.data.rewards.eco = Math.max(0, Number(this.data.rewards.eco) || 0);
    this.data.totals   = this.data.totals || { hits:0, wins:0, plays:0 };
    this.data.ranking  = Array.isArray(this.data.ranking) ? this.data.ranking : [];
    /* descarta entradas corrompidas / inválidas vindas do localStorage */
    this.data.ranking = this.data.ranking
      .filter(e => e && typeof e.score === 'number' && isFinite(e.score) && e.score >= 0)
      .map(e => ({ name: this.cleanName(e.name), score: Math.floor(e.score), level: Math.min(9, Math.max(1, e.level | 0 || 1)), date: e.date || 0 }))
      .sort((a, b) => b.score - a.score).slice(0, 10);
    /* quem já venceu a fase 8 ganha a fase 9 (Crisópolis) liberada */
    if (this.data.progress.stars && this.data.progress.stars[8] && this.data.progress.unlocked < 9) this.data.progress.unlocked = 9;
    return this.data;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
  },

  get settings() { return this.data.settings; },
  get progress() { return this.data.progress; },
  get ranking()  { return this.data.ranking; },
  get rewards()  { return this.data.rewards; },
  get totals()   { return this.data.totals; },

  addTotals(hits, win) {
    this.totals.hits += Math.max(0, hits | 0); this.totals.plays++; if (win) this.totals.wins++;
    this.save();
  },

  /* recompensa única por chave: devolve true só na primeira vez */
  grant(key, amount) {
    if (this.rewards.claimed[key]) return false;
    this.rewards.claimed[key] = true;
    this.rewards.eco += amount;
    this.save();
    return true;
  },
  isClaimed(key) { return !!this.rewards.claimed[key]; },

  setSound(v) { this.settings.sound = v; this.save(); },
  setName(n)  { this.settings.name = n; this.save(); },

  unlockLevel(n) {
    if (n > this.progress.unlocked) { this.progress.unlocked = n; this.save(); }
  },

  setStars(levelId, stars) {
    const cur = this.progress.stars[levelId] || 0;
    if (stars > cur) { this.progress.stars[levelId] = stars; this.save(); }
  },

  /* nome seguro: sem marcação HTML / caracteres de controle, máx. 14, nunca vazio */
  cleanName(n) {
    n = String(n == null ? '' : n).replace(/[<>&"'`\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 14);
    return n || 'JOGADOR';
  },

  /* ranking: top 10 por pontuação; ignora duplicata exata (mesmo nome, pontos e fase) */
  addScore(name, score, level) {
    score = Math.floor(Number(score));
    level = Math.min(9, Math.max(1, level | 0 || 1));
    if (!isFinite(score) || score <= 0) return -1;
    const clean = this.cleanName(name);
    const dup = this.data.ranking.findIndex(e => e.name === clean && e.score === score && e.level === level);
    if (dup >= 0) return dup;
    const entry = { name: clean, score, level, date: Date.now() };
    const list = this.data.ranking.concat(entry).sort((a, b) => b.score - a.score).slice(0, 10);
    this.data.ranking = list;
    this.save();
    return list.indexOf(entry);
  },
};
