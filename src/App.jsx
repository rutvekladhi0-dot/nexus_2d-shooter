import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

// ─────────────────────────────────────────────
//  WEB AUDIO ENGINE
// ─────────────────────────────────────────────

// AudioContext is created lazily on first user interaction.
// Creating it at module load time throws NotAllowedError in all
// modern browsers and breaks the entire app on deployment.
let actx = null;

const getAudioContext = () => {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
};

// ── Utility: simple note player ──────────────
const playNote = (freq, type, vol, start, dur) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(vol, start);
  gain.gain.linearRampToValueAtTime(0, start + dur);
  osc.start(start); osc.stop(start + dur + 0.02);
};

// ── SFX ──────────────────────────────────────
const playSound = (type) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (type === 'shoot') {
    // Freeze-ray crystalline burst
    playNote(1400, 'triangle', 0.22, now, 0.08);
    playNote(700,  'sine',     0.12, now + 0.04, 0.08);
  } else if (type === 'hit') {
    // Ice-shatter
    playNote(1100, 'sine', 0.18, now,        0.06);
    playNote(1600, 'sine', 0.14, now + 0.05, 0.06);
    playNote(600,  'sine', 0.10, now + 0.10, 0.10);
  } else if (type === 'miss') {
    // Arctic wind moan
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.45);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.45);
    osc.start(now); osc.stop(now + 0.47);
  } else if (type === 'round_start') {
    // Magic chime arpeggio
    [523, 659, 784, 1047].forEach((f, i) => playNote(f, 'sine', 0.13, now + i * 0.1, 0.18));
  } else if (type === 'laugh') {
    // Olaf tuba
    [400, 320, 380, 280].forEach((f, i) => playNote(f, 'triangle', 0.18, now + i * 0.16, 0.14));
  } else if (type === 'bomb') {
    // Deep ice-quake rumble + high ring
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.start(now); osc.stop(now + 0.62);
    // High crystalline ring
    [1200, 900, 600].forEach((f, i) => playNote(f, 'triangle', 0.2, now + i * 0.08, 0.25));
  } else if (type === 'combo_blast') {
    // Cascading ice-chimes
    [784, 988, 1175, 1568].forEach((f, i) => playNote(f, 'triangle', 0.15, now + i * 0.06, 0.2));
  }
};

// ── Background Music (procedural "Let It Go" motif) ──
let musicNodes = [];
let musicPlaying = false;
let musicScheduleTimer = null;

// Simplified "Let It Go" opening motif notes: pitch (Hz), duration (s)
// Ab4-Ab4-Eb5-Eb5-F5-Eb5-Db5-Bb4-Bb4-F5-F5-Eb5-Db5-Bb4
const LET_IT_GO_MOTIF = [
  [415, 0.30], [415, 0.15], [622, 0.30], [622, 0.15],
  [698, 0.20], [622, 0.15], [554, 0.35], [466, 0.30],
  [466, 0.15], [698, 0.30], [698, 0.15], [622, 0.25],
  [554, 0.25], [466, 0.45], [415, 0.55]
];

// Harmony bass notes
const BASS_MOTIF = [
  [104, 0.9], [117, 0.9], [130, 0.9], [117, 0.9],
  [104, 0.9], [117, 0.9], [130, 0.9], [98,  0.9]
];

const startMusic = () => {
  if (musicPlaying) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  musicPlaying = true;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
  masterGain.connect(ctx.destination);

  // Reverb via convolver (simple impulse)
  const convolver = ctx.createConvolver();
  const irLength = ctx.sampleRate * 1.5;
  const ir = ctx.createBuffer(2, irLength, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLength; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2);
  }
  convolver.buffer = ir;
  const dryGain = ctx.createGain(); dryGain.gain.value = 0.6;
  const wetGain = ctx.createGain(); wetGain.gain.value = 0.35;
  masterGain.connect(dryGain);   dryGain.connect(ctx.destination);
  masterGain.connect(convolver); convolver.connect(wetGain); wetGain.connect(ctx.destination);

  const scheduleLoop = () => {
    if (!musicPlaying) return;
    const now = ctx.currentTime;
    let t = now + 0.05;

    // Melody (soft triangle + sine layered)
    LET_IT_GO_MOTIF.forEach(([freq, dur]) => {
      ['triangle', 'sine'].forEach((type, li) => {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(masterGain);
        osc.type = type;
        osc.frequency.setValueAtTime(freq * (li === 1 ? 2 : 1), t);
        g.gain.setValueAtTime(li === 0 ? 0.45 : 0.15, t);
        g.gain.linearRampToValueAtTime(0.38, t + dur * 0.1);
        g.gain.linearRampToValueAtTime(0, t + dur * 0.92);
        osc.start(t); osc.stop(t + dur + 0.04);
        musicNodes.push(osc, g);
      });
      t += dur;
    });

    // Bass pad
    let bt = now + 0.05;
    BASS_MOTIF.forEach(([freq, dur]) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(masterGain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, bt);
      g.gain.setValueAtTime(0.3, bt);
      g.gain.linearRampToValueAtTime(0, bt + dur * 0.9);
      osc.start(bt); osc.stop(bt + dur + 0.04);
      musicNodes.push(osc, g);
      bt += dur;
    });

    // Sparkle arpeggios
    const sparkNotes = [1047, 1319, 1568, 1319, 1047, 1319, 1568, 2093];
    let st = now + 0.05;
    for (let rep = 0; rep < 2; rep++) {
      sparkNotes.forEach((freq) => {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(masterGain);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.08, st);
        g.gain.linearRampToValueAtTime(0, st + 0.12);
        osc.start(st); osc.stop(st + 0.14);
        musicNodes.push(osc, g);
        st += 0.13;
      });
      st += 0.4;
    }

    const loopLen = LET_IT_GO_MOTIF.reduce((s, [, d]) => s + d, 0) + 0.6;
    musicScheduleTimer = setTimeout(scheduleLoop, (loopLen - 0.5) * 1000);
  };

  scheduleLoop();
};

const stopMusic = () => {
  musicPlaying = false;
  clearTimeout(musicScheduleTimer);
  musicNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect && n.disconnect(); } catch (_) {} });
  musicNodes = [];
};

const toggleMusic = () => {
  if (musicPlaying) stopMusic();
  else startMusic();
  return musicPlaying;
};

// ─────────────────────────────────────────────
//  PIXEL SPRITES
// ─────────────────────────────────────────────
const CELL = 3;

const MARSHMALLOW_SPRITE = [
  "....WWWWW....",
  "...WWBWBWW...",
  "..WWWWWWWWW..",
  "..WCWWWWWCW..",
  "...WWWWWWW...",
  "....BWWWB....",
  "...WWWWWWW...",
  "..W.WWWWW.W..",
  "...WWWWWWW...",
  "....WW.WW...."
];

const ICESHARD_SPRITE = [
  "..C....C..",
  ".CCC..CCC.",
  "CCCWWWCCC.",
  ".CWWWWWC..",
  "..WWWWW...",
  "..CWWWC...",
  ".CC...CC.."
];

const ELSA_STAND = [
  "....SSSS.....",
  "...SSSSSS....",
  "...SBSSBS....",
  "...SSSSSS....",
  ".BBBBSSBBBB..",
  "BBBSWWSSWBBB.",
  "BBBSSWWWSBBB.",
  "..BBBSWWBBB..",
  "....BBB.BBB..",
  "....BB...BB.."
];

const OLAF_STAND = [
  "....WWWW.....",
  "...WWBBWW....",
  "..WWWWWWWW...",
  "..WOWOOWOW...",
  "...WWWWWWW...",
  "....WWWWW....",
  "...WWWWWWW...",
  "..W.WWWWW.W..",
  "...W.....W...",
  "....W...W...."
];

// ── Snowflake bomb icon (pixel) ──
const BOMB_ICON = [
  "..CCC..",
  ".CWWWC.",
  "CWWWWWC",
  "CWWBWWC",
  "CWWWWWC",
  ".CWWWC.",
  "..CCC.."
];

const PALETTES = {
  marshmallow: { W: '#e8f4fd', B: '#1a1a2e', C: '#a8d8f0' },
  iceshard:    { C: '#7ecef4', W: '#ffffff', B: '#b3e5fc' },
  elsa:        { S: '#a8d8f0', B: '#2c3e7a', W: '#ffffff' },
  olaf:        { W: '#f5f5f5', B: '#1a1a2e', O: '#ff8c42' },
  bomb:        { C: '#7ecef4', W: '#cce8ff', B: '#003366' }
};

const drawGrid = (ctx, x, y, grid, palette, flip = false, scale = 1) => {
  const H = grid.length, W = grid[0].length;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.translate(-(W * CELL * scale) / 2, -(H * CELL * scale) / 2);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = grid[r][c];
      if (ch !== '.') {
        ctx.fillStyle = palette[ch] || '#fff';
        ctx.fillRect(c * CELL * scale, r * CELL * scale, CELL * scale, CELL * scale);
      }
    }
  }
  ctx.restore();
};

// ─────────────────────────────────────────────
//  TAUNTS
// ─────────────────────────────────────────────
const MISS_TAUNTS = [
  "THE COLD NEVER BOTHERED YOUR AIM?",
  "LET IT GO... AND MAYBE HIT SOMETHING!",
  "EVEN HANS SHOOTS BETTER!",
  "OLAF COULD DO BETTER!",
  "DO YOU WANNA BUILD A SNOWMAN? NOT HIT ONE?",
  "THE ICE IS NOT YOUR FRIEND TODAY!",
  "MARSHMALLOW SAYS THANKS FOR MISSING!",
  "SVEN HAS BETTER AIM THAN YOU!",
  "WERE YOU AIMING AT ARENDELLE?",
  "ELSA IS DISAPPOINTED IN YOU.",
  "SOME PEOPLE ARE WORTH MELTING FOR... YOUR SHOTS ARE NOT.",
  "INTO THE UNKNOWN... YOUR BULLET WENT.",
  "THAT WAS NOT VERY MAGICAL.",
  "KRISTOFF COULD DO BETTER BLINDFOLDED!"
];

const GAME_OVER_TAUNTS = [
  "ARENDELLE HAS FALLEN. THE ETERNAL WINTER WINS.",
  "ELSA'S MAGIC OVERPOWERED YOUR COURAGE.",
  "THE SNOW MONSTERS HAVE CLAIMED THE KINGDOM.",
  "YOU COULDN'T BREAK THE SPELL. THE COLD WINS.",
  "EVEN ANNA'S LOVE COULDN'T SAVE THIS RUN.",
  "OLAF IS CRYING. ACTUAL SNOWMAN TEARS.",
  "MARSHMALLOW: 1 — ARENDELLE: 0.",
  "THE KINGDOM IS BURIED IN YOUR FAILURE.",
  "AN ACT OF TRUE AIM COULD HAVE SAVED US ALL.",
  "HANS IS PLEASED WITH YOUR PERFORMANCE."
];

// ─────────────────────────────────────────────
//  DRAW HELPERS
// ─────────────────────────────────────────────
const drawSnowflake = (ctx, x, y, size, alpha) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#cce8ff';
  ctx.lineWidth = 1;
  ctx.translate(x, y);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath(); ctx.moveTo(0, 0);      ctx.lineTo(0, size);            ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, size*0.4); ctx.lineTo( size*0.25, size*0.65); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, size*0.4); ctx.lineTo(-size*0.25, size*0.65); ctx.stroke();
  }
  ctx.restore();
};

// Freeze-ray beam trail segments drawn per shot
const drawFreezeBeam = (ctx, ox, oy, tx, ty, life) => {
  ctx.save();
  ctx.globalAlpha = life * 0.7;
  const grad = ctx.createLinearGradient(ox, oy, tx, ty);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, '#a8edfc');
  grad.addColorStop(1, 'rgba(100,200,255,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3 * life;
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#7ecef4';
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.restore();
};

// ─────────────────────────────────────────────
//  GAME ENGINE
// ─────────────────────────────────────────────
class GameEngine {
  constructor(canvas, updateReactState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.updateReactState = updateReactState;

    this.W = 800; this.H = 450;
    this.canvas.width = this.W; this.canvas.height = this.H;

    this.state    = 'MENU';
    this.mode     = 1;
    this.score    = 0;
    this.hiScore  = parseInt(localStorage.getItem('arendelle_hi')) || 0;
    this.round    = 1;
    this.ammo     = 5;
    this.maxAmmo  = 5;

    // Bomb system
    this.bombs    = 1;   // 1 bomb per wave
    this.bombActive = false;  // is bomb animation playing?
    this.bombTimer  = 0;
    this.bombWave   = 0;      // expanding ring radius

    // Freeze-ray beam trails  { ox,oy,tx,ty,life }
    this.beams = [];

    // Nova rings  { x,y,r,maxR,life,color }
    this.novaRings = [];

    // Snowstorm cloud effect  { x,y,life,vx,vy }
    this.stormClouds = [];

    this.targets       = [];
    this.particles     = [];
    this.floatingTexts = [];
    this.history       = new Array(10).fill('empty');
    this.targetsSpawned  = 0;
    this.shotsFired      = 0;
    this.currentCombo    = 0;
    this.gameOverTaunt   = '';

    this.snowflakes = Array.from({ length: 80 }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 450,
      r: 2 + Math.random() * 4,
      speed: 20 + Math.random() * 40,
      drift: (Math.random() - 0.5) * 15,
      alpha: 0.3 + Math.random() * 0.5
    }));

    this.mascot = { active: false, y: this.H, type: 'stand', timer: 0 };

    this.lastTime = performance.now();
    this.reqId = requestAnimationFrame((t) => this.loop(t));
  }

  // ── start / round ──────────────────────────
  startGame(mode) {
    this.mode  = mode;
    this.score = 0;
    this.round = 1;
    this.currentCombo  = 0;
    this.gameOverTaunt = '';
    if (this.mode === 1) this.maxAmmo = 5;
    else if (this.mode === 2) this.maxAmmo = 4;
    else this.maxAmmo = 3;
    this.startRound();
  }

  startRound() {
    this.history        = new Array(10).fill('empty');
    this.targetsSpawned = 0;
    this.targets        = [];
    this.particles      = [];
    this.floatingTexts  = [];
    this.beams          = [];
    this.novaRings      = [];
    this.stormClouds    = [];
    this.bombActive     = false;
    this.state = 'ROUND_START';
    this.syncState();
    playSound('round_start');
    setTimeout(() => {
      if (this.state === 'ROUND_START') { this.state = 'PLAYING'; this.spawnWave(); }
    }, 1500);
  }

  spawnWave() {
    this.ammo  = this.maxAmmo;
    this.bombs = 1;           // refresh bomb every wave
    this.targets = [];

    let count = 1;
    if (this.mode === 2) count = 2;
    if (this.mode === 3) count = 2;

    for (let i = 0; i < count; i++) {
      if (this.mode === 3 && i === 1) this.targets.push(this.createIceShard());
      else                             this.targets.push(this.createMarshmallow());
    }
    this.targetsSpawned += count;
    this.syncState();
  }

  // ── entity factories ────────────────────────
  createMarshmallow() {
    let sm = 0.5 + this.round * 0.05;
    if (this.mode === 2) sm = 0.8 + this.round * 0.05;
    if (this.mode === 3) sm = 1.2 + this.round * 0.1;
    const dir = Math.random() > 0.5 ? 1 : -1;
    const startY = 150 + Math.random() * 100;
    return {
      type: 'marshmallow', x: dir === 1 ? -80 : this.W + 80,
      y: startY, baseY: startY,
      vx: (140 + Math.random() * 40) * sm * dir,
      amplitude: 130 + Math.random() * 50,
      phase: Math.random() * Math.PI,
      phaseSpeed: (2.0 + Math.random()) * sm,
      dead: false, escaped: false, escapeTimer: 0,
      maxTime: this.mode === 1 ? 5.0 : Math.max(1.5, 4.0 - this.round * 0.2),
      frozen: false, frozenTimer: 0
    };
  }

  createIceShard() {
    let sm = 1.0 + this.round * 0.1;
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      type: 'iceshard',
      x: dir === 1 ? -40 : this.W + 40,
      y: this.H * 0.5 + (Math.random() * 120 - 60),
      vx: (160 + Math.random() * 60) * sm * dir,
      vy: (-20 - Math.random() * 30) * sm,
      scale: 2.5,
      dead: false, escaped: false, escapeTimer: 0,
      maxTime: Math.max(1.5, 3.5 - this.round * 0.15),
      frozen: false, frozenTimer: 0
    };
  }

  // ── SHOOT ───────────────────────────────────
  shoot(clickX, clickY) {
    if (this.state !== 'PLAYING') return;
    if (this.ammo <= 0) return;

    this.ammo--;
    this.shotsFired++;
    playSound('shoot');

    // Flash
    const flashEl = document.getElementById('screen-flash');
    if (flashEl) { flashEl.style.opacity = '0.3'; setTimeout(() => (flashEl.style.opacity = '0'), 55); }

    // Freeze-ray beam from bottom-center to click
    this.beams.push({ ox: this.W / 2, oy: this.H - 80, tx: clickX, ty: clickY, life: 1.0 });

    let hitAnything = false;
    const radiusMult = this.mode === 1 ? 1.5 : this.mode === 3 ? 0.8 : 1.0;

    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (t.dead || t.escaped) continue;
      const baseRadius = t.type === 'iceshard' ? 24 * t.scale : 32;
      if (Math.hypot(t.x - clickX, t.y - clickY) < baseRadius * radiusMult) {
        t.dead = true;
        hitAnything = true;
        this.currentCombo++;
        playSound('hit');

        const basePts   = (t.type === 'iceshard' ? 1000 : 500) + this.round * 100;
        const comboMult = this.currentCombo > 1 ? this.currentCombo : 1;
        const totalPts  = basePts * comboMult;
        this.score += totalPts;
        if (this.score > this.hiScore) { this.hiScore = this.score; localStorage.setItem('arendelle_hi', this.hiScore); }

        this.floatingTexts.push({ x: t.x, y: t.y - 30, text: `+${totalPts}`, color: '#7ecef4', life: 1.2, isTaunt: false });

        // ── Combo blast effects ──────────────
        if (this.currentCombo >= 3) {
          // Snowstorm ring on 3× combo
          playSound('combo_blast');
          this.floatingTexts.push({ x: t.x, y: t.y - 55, text: `${this.currentCombo}× COMBO!`, color: '#ffffff', life: 1.8, isTaunt: false });
          this.spawnSnowstorm(t.x, t.y);
          this.novaRings.push({ x: t.x, y: t.y, r: 0, maxR: 120, life: 1.0, color: '#a8edfc' });
        } else if (this.currentCombo === 2) {
          this.floatingTexts.push({ x: t.x, y: t.y - 55, text: `2× COMBO!`, color: '#a8edfc', life: 1.5, isTaunt: false });
          this.novaRings.push({ x: t.x, y: t.y, r: 0, maxR: 80, life: 1.0, color: '#7ecef4' });
        }

        // Ice-nova explosion on every hit
        this.spawnIceExplosion(t.x, t.y, this.currentCombo);

        const idx = this.targetsSpawned - this.targets.length + i;
        if (idx < 10) this.history[idx] = 'hit';
        break;
      }
    }

    if (!hitAnything) {
      playSound('miss');
      this.currentCombo = 0;
      this.floatingTexts = this.floatingTexts.filter(ft => !ft.isTaunt);
      this.floatingTexts.push({
        x: this.W / 2, y: this.H / 3,
        text: MISS_TAUNTS[Math.floor(Math.random() * MISS_TAUNTS.length)],
        color: '#90caf9', life: 2.5, isTaunt: true
      });
    }

    this.checkWaveEnd();
    this.syncState();
  }

  // ── BOMB ────────────────────────────────────
  useBomb() {
    if (this.state !== 'PLAYING') return;
    if (this.bombs <= 0) return;
    if (this.bombActive) return;

    this.bombs--;
    this.bombActive = true;
    this.bombTimer  = 0;
    this.bombWave   = 0;
    playSound('bomb');

    // Full screen flash
    const flashEl = document.getElementById('screen-flash');
    if (flashEl) {
      flashEl.style.opacity = '0.7';
      setTimeout(() => (flashEl.style.opacity = '0'), 180);
    }

    // Kill / freeze all living targets
    this.targets.forEach((t, i) => {
      if (!t.dead && !t.escaped) {
        t.dead = true;
        const basePts = (t.type === 'iceshard' ? 800 : 400) + this.round * 50;
        this.score += basePts;
        if (this.score > this.hiScore) { this.hiScore = this.score; localStorage.setItem('arendelle_hi', this.hiScore); }
        this.spawnIceExplosion(t.x, t.y, 1);
        const idx = this.targetsSpawned - this.targets.length + i;
        if (idx < 10) this.history[idx] = 'hit';
      }
    });

    // Big nova
    this.novaRings.push({ x: this.W / 2, y: this.H / 2, r: 0, maxR: 600, life: 1.0, color: '#cce8ff', isBomb: true });
    this.novaRings.push({ x: this.W / 2, y: this.H / 2, r: 0, maxR: 500, life: 1.0, color: '#7ecef4', isBomb: true });
    this.novaRings.push({ x: this.W / 2, y: this.H / 2, r: 0, maxR: 400, life: 1.0, color: '#ffffff', isBomb: true });

    // Massive snowstorm
    for (let k = 0; k < 4; k++) {
      this.spawnSnowstorm(100 + k * 200, this.H / 2);
    }

    this.floatingTexts.push({ x: this.W / 2, y: this.H / 2 - 40, text: '❄ BLIZZARD BOMB! ❄', color: '#ffffff', life: 2.2, isTaunt: false });

    if (this.score > this.hiScore) { this.hiScore = this.score; localStorage.setItem('arendelle_hi', this.hiScore); }
    this.checkWaveEnd();
    this.syncState();
  }

  // ── blast helpers ───────────────────────────
  spawnIceExplosion(x, y, comboMult = 1) {
    const colors = ['#cce8ff', '#7ecef4', '#a8d8f0', '#ffffff', '#b3e5fc'];
    const count  = Math.min(20 + comboMult * 10, 60);
    for (let i = 0; i < count; i++) {
      const speed = (200 + Math.random() * 200) * (1 + comboMult * 0.2);
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * speed * 2,
        vy: (Math.random() - 0.5) * speed * 2,
        life: 1.0,
        color: colors[Math.floor(Math.random() * colors.length)],
        isFlake: Math.random() > 0.55,
        size: 2 + Math.random() * 4
      });
    }
  }

  spawnSnowstorm(cx, cy) {
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.stormClouds.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 40,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 40,
        life: 0.8 + Math.random() * 0.6,
        r: 4 + Math.random() * 8
      });
    }
  }

  // ── wave logic ──────────────────────────────
  checkWaveEnd() {
    const allResolved = this.targets.length > 0 && this.targets.every(t => t.dead || t.escaped);
    if (allResolved && !this.waveEnding) {
      this.waveEnding = true;
      setTimeout(() => { this.waveEnding = false; this.endWave(); }, 600);
    }
  }

  endWave() {
    if (this.state !== 'PLAYING') return;
    const caughtCount = this.targets.filter(t => t.dead).length;
    if (this.targets.some(t => t.escaped && !t.dead)) {
      this.currentCombo = 0;
      this.targets.forEach((t, i) => {
        if (t.escaped && !t.dead) {
          const idx = this.targetsSpawned - this.targets.length + i;
          if (idx < 10) this.history[idx] = 'miss';
        }
      });
    }
    this.state = 'END_ANIM';
    this.mascot.active = true;
    this.mascot.y      = this.H;
    this.mascot.timer  = 0;
    this.mascot.type   = caughtCount > 0 ? 'stand' : 'laugh';
    if (caughtCount === 0) playSound('laugh');
    this.syncState();
  }

  checkRoundClear() {
    const hits = this.history.filter(h => h === 'hit').length;
    let required = 5 + Math.floor(this.round / 2);
    if (this.mode === 1) required -= 1;
    required = Math.min(required, 10);
    if (hits >= required) { this.round++; this.startRound(); }
    else {
      this.state = 'GAME_OVER';
      this.gameOverTaunt = GAME_OVER_TAUNTS[Math.floor(Math.random() * GAME_OVER_TAUNTS.length)];
      this.syncState();
    }
  }

  // ── LOOP ────────────────────────────────────
  loop(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    this.reqId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // Ambient snowflakes
    this.snowflakes.forEach(s => {
      s.y += s.speed * dt; s.x += s.drift * dt;
      if (s.y > this.H + 10) { s.y = -10; s.x = Math.random() * this.W; }
      if (s.x > this.W + 10) s.x = -10;
      if (s.x < -10) s.x = this.W + 10;
    });

    if (this.state === 'PLAYING') {
      let activeCount = 0;
      this.targets.forEach(t => {
        if (t.dead) { t.y += 500 * dt; return; }
        if (t.escaped) return;
        t.escapeTimer += dt;
        if (t.escapeTimer > t.maxTime || t.x < -150 || t.x > this.W + 150) {
          t.escaped = true; this.checkWaveEnd(); return;
        }
        if (t.type === 'marshmallow') {
          t.x += t.vx * dt;
          t.phase += t.phaseSpeed * dt;
          t.y = t.baseY + Math.sin(t.phase) * t.amplitude;
        } else if (t.type === 'iceshard') {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.scale = Math.max(0.5, t.scale - 0.5 * dt);
        }
        activeCount++;
      });
      if (this.ammo === 0 && activeCount > 0) {
        this.targets.forEach(t => { if (!t.dead) t.escapeTimer += dt * 5; });
      }
    }

    if (this.state === 'END_ANIM') {
      this.mascot.timer += dt;
      if (this.mascot.timer < 0.5) this.mascot.y -= 150 * dt;
      else if (this.mascot.timer > 2.0) this.mascot.y += 150 * dt;
      if (this.mascot.timer > 2.5) {
        this.mascot.active = false;
        if (this.targetsSpawned >= 10) this.checkRoundClear();
        else { this.state = 'PLAYING'; this.spawnWave(); }
      }
    }

    // Bomb animation
    if (this.bombActive) {
      this.bombTimer += dt;
      this.bombWave  += 400 * dt;
      if (this.bombTimer > 1.2) this.bombActive = false;
    }

    // Particles
    this.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.5; });
    this.particles = this.particles.filter(p => p.life > 0);

    // Nova rings
    this.novaRings.forEach(n => {
      n.r   += (n.isBomb ? 700 : 300) * dt;
      n.life -= (n.isBomb ? 1.2 : 1.8) * dt;
    });
    this.novaRings = this.novaRings.filter(n => n.life > 0 && n.r < n.maxR);

    // Storm clouds
    this.stormClouds.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.1; s.vy += 40 * dt; });
    this.stormClouds = this.stormClouds.filter(s => s.life > 0);

    // Beam trails
    this.beams.forEach(b => { b.life -= dt * 4; });
    this.beams = this.beams.filter(b => b.life > 0);

    // Floating texts
    this.floatingTexts.forEach(ft => { ft.y -= (ft.isTaunt ? 5 : 45) * dt; ft.life -= dt; });
    this.floatingTexts = this.floatingTexts.filter(ft => ft.life > 0);
  }

  // ── DRAW ────────────────────────────────────
  draw() {
    const ctx = this.ctx;
    const t   = performance.now() / 1000;

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.H);
    bgGrad.addColorStop(0, '#03102e');
    bgGrad.addColorStop(0.4, '#0a2a52');
    bgGrad.addColorStop(1, '#0d3b6e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Aurora
    const auroraColors = ['rgba(100,220,180,0.06)','rgba(80,180,255,0.07)','rgba(180,100,255,0.05)','rgba(60,240,160,0.06)'];
    for (let a = 0; a < 4; a++) {
      ctx.save(); ctx.beginPath();
      const waveY = 60 + a * 40 + Math.sin(t * 0.4 + a) * 20;
      ctx.moveTo(0, waveY);
      for (let x = 0; x <= this.W; x += 20)
        ctx.lineTo(x, waveY + Math.sin(x * 0.01 + t * 0.5 + a) * 30);
      ctx.lineTo(this.W, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = auroraColors[a]; ctx.fill(); ctx.restore();
    }

    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = (Math.sin(i*743)*0.5+0.5)*this.W;
      const sy = (Math.cos(i*312)*0.5+0.5)*(this.H*0.55);
      ctx.globalAlpha = (0.5+0.5*Math.sin(t*2+i))*0.7;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx, sy, i%3===0?2:1, i%3===0?2:1);
    }
    ctx.globalAlpha = 1.0;

    // Moon
    const moonGrad = ctx.createRadialGradient(this.W-90,65,5,this.W-90,65,40);
    moonGrad.addColorStop(0,'#e8f4fd'); moonGrad.addColorStop(1,'#a8d8f0');
    ctx.fillStyle = moonGrad;
    ctx.beginPath(); ctx.arc(this.W-90,65,38,0,Math.PI*2); ctx.fill();

    // Ambient snow
    this.snowflakes.forEach(s => {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = '#cce8ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*0.5, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // ── Nova rings ──────────────────────────
    this.novaRings.forEach(n => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, n.life) * (n.isBomb ? 0.7 : 0.5);
      ctx.strokeStyle = n.color;
      ctx.lineWidth   = n.isBomb ? 6 : 3;
      ctx.shadowBlur  = 20; ctx.shadowColor = n.color;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    // ── Freeze-ray beams ────────────────────
    this.beams.forEach(b => drawFreezeBeam(ctx, b.ox, b.oy, b.tx, b.ty, b.life));

    // ── Targets ─────────────────────────────
    this.targets.forEach(tgt => {
      if (tgt.escaped && !tgt.dead) return;
      if (tgt.type === 'marshmallow') {
        ctx.strokeStyle = 'rgba(180,220,255,0.6)';
        ctx.lineWidth = 2; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(tgt.x + tgt.vx*0.2, -20); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
        ctx.setLineDash([]);
        if (!tgt.dead) drawGrid(ctx, tgt.x, tgt.y, MARSHMALLOW_SPRITE, PALETTES.marshmallow, tgt.vx > 0, 2.0);
      } else if (tgt.type === 'iceshard') {
        if (!tgt.dead) {
          ctx.save();
          ctx.translate(tgt.x, tgt.y); ctx.rotate(t*3); ctx.translate(-tgt.x, -tgt.y);
          drawGrid(ctx, tgt.x, tgt.y, ICESHARD_SPRITE, PALETTES.iceshard, false, tgt.scale);
          ctx.restore();
        }
      }
    });

    // ── Particles ───────────────────────────
    this.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.isFlake) drawSnowflake(ctx, p.x, p.y, p.size || 6, Math.max(0, p.life));
      else { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size||4, p.size||4); }
    });
    ctx.globalAlpha = 1.0;

    // ── Storm clouds ─────────────────────────
    this.stormClouds.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life) * 0.6;
      const sg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      sg.addColorStop(0, '#cce8ff'); sg.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });

    // ── Bomb shockwave ring ──────────────────
    if (this.bombActive) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - this.bombTimer / 1.2) * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.shadowBlur = 30; ctx.shadowColor = '#7ecef4';
      ctx.beginPath(); ctx.arc(this.W/2, this.H/2, this.bombWave, 0, Math.PI*2); ctx.stroke();
      // Second trailing ring
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = '#a8edfc';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.W/2, this.H/2, Math.max(0,this.bombWave-60), 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // Foreground: snow ground
    const groundGrad = ctx.createLinearGradient(0, this.H-90, 0, this.H);
    groundGrad.addColorStop(0, '#c8e6fa'); groundGrad.addColorStop(1, '#a0cfe8');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, this.H-75, this.W, 75);
    ctx.fillStyle = '#daeefb';
    for (let bx = 0; bx < this.W; bx += 60) {
      ctx.beginPath(); ctx.arc(bx+30, this.H-75, 28, Math.PI, 0); ctx.fill();
    }

    // Ice castles
    const castles = [
      {x:20,  w:80,  h:160, towers:[{ox:5,tw:18,th:40},{ox:57,tw:18,th:55}]},
      {x:130, w:110, h:210, towers:[{ox:10,tw:22,th:60},{ox:78,tw:22,th:70}]},
      {x:270, w:90,  h:155, towers:[{ox:5,tw:18,th:45},{ox:67,tw:18,th:35}]},
      {x:395, w:125, h:230, towers:[{ox:8,tw:25,th:70},{ox:92,tw:25,th:80}]},
      {x:555, w:85,  h:145, towers:[{ox:5,tw:16,th:40},{ox:64,tw:16,th:50}]},
      {x:670, w:100, h:185, towers:[{ox:5,tw:20,th:55},{ox:75,tw:20,th:65}]}
    ];
    castles.forEach(b => {
      const cg = ctx.createLinearGradient(b.x, this.H-b.h, b.x, this.H);
      cg.addColorStop(0,'rgba(100,180,240,0.35)'); cg.addColorStop(1,'rgba(20,60,120,0.6)');
      ctx.fillStyle = cg;
      ctx.fillRect(b.x, this.H-b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(150,230,255,0.5)';
      for (let wy = this.H-b.h+20; wy < this.H-55; wy += 22)
        for (let wx = b.x+12; wx < b.x+b.w-12; wx += 22)
          if ((wx*wy)%7 > 2) ctx.fillRect(wx, wy, 6, 9);
      b.towers.forEach(tw => {
        ctx.fillStyle = 'rgba(80,160,220,0.4)';
        ctx.fillRect(b.x+tw.ox, this.H-b.h-tw.th, tw.tw, tw.th+5);
        ctx.fillStyle = 'rgba(160,220,255,0.6)';
        ctx.beginPath();
        ctx.moveTo(b.x+tw.ox-4, this.H-b.h-tw.th);
        ctx.lineTo(b.x+tw.ox+tw.tw/2, this.H-b.h-tw.th-20);
        ctx.lineTo(b.x+tw.ox+tw.tw+4, this.H-b.h-tw.th);
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(220,240,255,0.75)';
      ctx.fillRect(b.x-2, this.H-b.h, b.w+4, 8);
    });

    // Mascot
    if (this.mascot.active) {
      const mY = Math.max(this.mascot.y, this.H-130);
      const bob = this.mascot.type === 'laugh' ? Math.sin(this.mascot.timer*20)*5 : 0;
      const sprite  = this.mascot.type === 'stand' ? ELSA_STAND : OLAF_STAND;
      const palette = this.mascot.type === 'stand' ? PALETTES.elsa : PALETTES.olaf;
      drawGrid(ctx, this.W/2, mY+bob, sprite, palette, false, 2.8);
    }

    // Floating texts
    ctx.textAlign = 'center';
    this.floatingTexts.forEach(ft => {
      ctx.font = ft.isTaunt ? 'bold 15px "Press Start 2P",monospace' : '12px "Press Start 2P",monospace';
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.life * 1.5));
      const tw  = ctx.measureText(ft.text).width;
      const dx  = Math.max(tw/2+20, Math.min(this.W-tw/2-20, ft.x));
      ctx.strokeStyle = '#001a3a'; ctx.lineWidth = 4;
      ctx.strokeText(ft.text, dx, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, dx, ft.y);
    });
    ctx.globalAlpha = 1.0;
  }

  syncState() {
    if (this.updateReactState) {
      this.updateReactState({
        state: this.state,
        score: this.score,
        hiScore: this.hiScore,
        round: this.round,
        ammo: this.ammo,
        maxAmmo: this.maxAmmo,
        bombs: this.bombs,
        history: [...this.history],
        mode: this.mode,
        gameOverTaunt: this.gameOverTaunt
      });
    }
  }

  destroy() {
    cancelAnimationFrame(this.reqId);
    stopMusic();
  }
}

// ─────────────────────────────────────────────
//  REACT APP
// ─────────────────────────────────────────────
const App = () => {
  const canvasRef  = useRef(null);
  const engineRef  = useRef(null);
  const [musicOn, setMusicOn] = useState(false);

  const [gameState, setGameState] = useState({
    state: 'MENU', score: 0,
    hiScore: parseInt(localStorage.getItem('arendelle_hi')) || 0,
    round: 1, ammo: 5, maxAmmo: 5, bombs: 1,
    history: new Array(10).fill('empty'), mode: 1, gameOverTaunt: ''
  });

  const initEngine = useCallback(() => {
    if (engineRef.current) engineRef.current.destroy();
    engineRef.current = new GameEngine(canvasRef.current, setGameState);
    setGameState(prev => ({ ...prev, hiScore: engineRef.current.hiScore }));
  }, []);

  useEffect(() => { initEngine(); return () => { if (engineRef.current) engineRef.current.destroy(); }; }, [initEngine]);

  // Music auto-start on first interaction
  useEffect(() => {
    const handleFirst = () => {
      if (!musicPlaying) { startMusic(); setMusicOn(true); }
      window.removeEventListener('pointerdown', handleFirst);
    };
    window.addEventListener('pointerdown', handleFirst);
    return () => window.removeEventListener('pointerdown', handleFirst);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.key.toLowerCase()) {
        case '1': if (eng.state === 'MENU') eng.startGame(1); break;
        case '2': if (eng.state === 'MENU') eng.startGame(2); break;
        case '3': if (eng.state === 'MENU') eng.startGame(3); break;
        case 'r': eng.startGame(eng.mode); break;
        case 'escape': eng.state = 'MENU'; eng.syncState(); break;
        case ' ': if (eng.state === 'PLAYING') eng.shoot(400, 225); break;
        case 'b': eng.useBomb(); break;          // ← Bomb key
        case 'm': setMusicOn(toggleMusic()); break; // ← Music toggle
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCanvasClick = (e) => {
    const eng = engineRef.current;
    if (!eng || eng.state !== 'PLAYING') return;
    const rect   = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width  / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    eng.shoot((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
  };

  const modeNames = { 1: 'FLURRY: EASY', 2: 'BLIZZARD: MEDIUM', 3: 'ETERNAL WINTER: HARD' };

  return (
    <div className="game-area">
      <canvas ref={canvasRef} onClick={handleCanvasClick} />
      <div className="crt-overlay"></div>
      <div id="screen-flash" className="flash"></div>

      {/* HUD Top */}
      {gameState.state !== 'MENU' && (
        <div className="hud-top">
          <div />
          <div>
            <button className="btn" onClick={() => { const m = toggleMusic(); setMusicOn(m); }}>
              {musicOn ? '🔊 MUSIC' : '🔇 MUSIC'} (M)
            </button>
            <button className="btn" onClick={() => engineRef.current?.startGame(engineRef.current.mode)}>RESTART (R)</button>
            <button className="btn" onClick={() => { if (engineRef.current) { engineRef.current.state = 'MENU'; engineRef.current.syncState(); } }}>MENU (ESC)</button>
          </div>
        </div>
      )}

      {/* MENU */}
      {gameState.state === 'MENU' && (
        <div className="overlay-screen">
          <div className="snowflake-deco">❄</div>
          <h2 className="title">DEFEND ARENDELLE</h2>
          <p className="subtitle">
            Shoot Snow Monsters &amp; Ice Shards · Press <b>B</b> to use Blizzard Bomb<br />
            Press <b>M</b> to toggle music · Click to fire freeze-ray
          </p>
          <div className="menu-opts">
            <div className="menu-opt" onClick={() => engineRef.current.startGame(1)}>❄ FLURRY — EASY (1)</div>
            <div className="menu-opt" onClick={() => engineRef.current.startGame(2)}>🌨 BLIZZARD — MEDIUM (2)</div>
            <div className="menu-opt" onClick={() => engineRef.current.startGame(3)}>🌪 ETERNAL WINTER — HARD (3)</div>
          </div>
          <p className="footer-text">❄ The cold never bothered me anyway ❄</p>
        </div>
      )}

      {/* ROUND START */}
      {gameState.state === 'ROUND_START' && (
        <div className="overlay-screen round-start-screen">
          <h2 className="title" style={{ fontSize: '3vmin' }}>❄ WAVE {gameState.round} ❄</h2>
          <p className="subtitle">The snow monsters are coming…</p>
        </div>
      )}

      {/* GAME OVER */}
      {gameState.state === 'GAME_OVER' && (
        <div className="overlay-screen">
          <div className="snowflake-deco">❄</div>
          <h2 className="title game-over-title">ARENDELLE HAS FALLEN</h2>
          <p style={{ fontSize: '1.4vmin', marginBottom: '14px', color: '#7ecef4' }}>SCORE: {gameState.score}</p>
          <p style={{ fontSize: '1.3vmin', color: '#a8d8f0', marginBottom: '32px', maxWidth: '80%', lineHeight: '1.7' }}>
            "{gameState.gameOverTaunt}"
          </p>
          <div className="menu-opt" onClick={() => engineRef.current.startGame(gameState.mode)}>❄ TRY AGAIN (R)</div>
          <div className="menu-opt" style={{ marginTop: '10px' }} onClick={() => { engineRef.current.state = 'MENU'; engineRef.current.syncState(); }}>MENU (ESC)</div>
        </div>
      )}

      {/* HUD Bottom */}
      {gameState.state !== 'MENU' && (
        <div className="hud-bottom">
          <div className="hud-left">
            <div><span className="text-highlight">WAVE {gameState.round}</span></div>
            <div style={{ color: '#90caf9' }}>{modeNames[gameState.mode]}</div>
          </div>

          <div className="hud-center">
            {gameState.history.map((res, i) => (
              <div key={i} className={`hit-box ${res === 'hit' ? 'hit' : res === 'miss' ? 'miss' : ''}`} />
            ))}
          </div>

          <div className="hud-right">
            <div>SCORE <span className="text-highlight">{gameState.score.toString().padStart(6, '0')}</span></div>
            <div>HI <span className="text-highlight">{gameState.hiScore.toString().padStart(6, '0')}</span></div>
          </div>

          {/* Ammo + Bomb side by side */}
          <div className="hud-ammo-bomb">
            <div className="ammo-container">
              {Array.from({ length: gameState.maxAmmo }).map((_, i) => (
                <div key={i} className={`snowflake-ammo ${i >= gameState.ammo ? 'spent' : ''}`}>❄</div>
              ))}
            </div>
            <div
              className={`bomb-icon ${gameState.bombs > 0 ? 'ready' : 'used'}`}
              title="Blizzard Bomb (B)"
              onClick={() => engineRef.current?.useBomb()}
            >
              💣
              <span className="bomb-label">BOMB (B)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
