/* ===== Áudio sintetizado via WebAudio (sem arquivos externos) ===== */
const AudioFX = {
  ctx: null,
  enabled: true,

  _ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.enabled) return;
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },

  click()   { this._tone(700, 0.07, 'square', 0.08); },
  catch()   { this._tone(520, 0.1, 'triangle', 0.14, 780); },
  correct() { this._tone(660, 0.09, 'sine', 0.16); setTimeout(()=>this._tone(990, 0.14, 'sine', 0.16), 70); },
  wrong()   { this._tone(220, 0.25, 'sawtooth', 0.16, 110); },
  special() { this._tone(880, 0.08, 'sine', 0.15); setTimeout(()=>this._tone(1320, 0.12, 'sine', 0.15), 60); },
  shield()  { this._tone(440, 0.2, 'triangle', 0.15, 880); },
  win()     { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._tone(f,0.22,'sine',0.18), i*120)); },
  lose()    { [400,300,200,140].forEach((f,i)=>setTimeout(()=>this._tone(f,0.25,'sawtooth',0.14), i*150)); },
};
