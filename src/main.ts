/**
 * main.ts — bootstrap: mount the shell, own the screen state machine, run the fixed
 * loop, and wire input / audio / ghost / share. Heavy logic lives in game.ts (sim),
 * render.ts (view), bot.ts (benchmark) — this file is the conductor.
 */

import './styles/mobile.css';
import './styles/main.css';

import { hardenViewport } from './engine/mobile';
import { createSfx } from './engine/sound';
import { createStore } from './engine/storage';
import { createLoop, type Loop } from './engine/loop';
import { DEFAULT_MODE, modeOf, type Mode } from './modes';
import {
  createRun,
  genTrack,
  stepRun,
  type RunState,
  type StepReport,
  type TrackEvent,
} from './game';
import { benchmarkDistance } from './bot';
import { Fx } from './fx';
import { computeView, drawScene, COLORS, type GhostSample, type View } from './render';
import { createInput, type InputCtl } from './input';
import {
  buildUI,
  buildModeChips,
  highlightMode,
  momentumColor,
  type UIRefs,
} from './ui';
import {
  buildShareUrl,
  clearShareInUrl,
  dailySeed,
  parseShare,
  randomSeed,
  todayKey,
  type ShareTarget,
} from './daily';

const SAMPLE_DT = 0.1;

interface GhostRun {
  d: number;
  s: [number, number][]; // [x, lane] sampled every SAMPLE_DT
}

const app = document.getElementById('app') as HTMLElement;
const ui: UIRefs = buildUI(app);
const store = createStore('emberwake');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

hardenViewport();

const muted0 = store.get<boolean>('muted', false);
const sfx = createSfx(muted0);
const fx = new Fx(reduced);

let mode: Mode = modeOf(store.get<string>('lastMode', DEFAULT_MODE));
let seed = randomSeed();
let isDaily = false;
let beatTarget: number | null = null;

let s: RunState = createRun(mode);
let track: TrackEvent[] = [];
let view: View = computeView(window.innerWidth, window.innerHeight, mode.lanes);
let input: InputCtl | null = null;
let loop: Loop | null = null;
let phase: 'menu' | 'play' | 'dying' | 'over' = 'menu';
let deathTimer = 0;
let renderX = 0;

// ghost
let ghostRec: [number, number][] = [];
let ghostSampleT = 0;
let ghostPlay: GhostRun | null = null;

const ctx = ui.canvas.getContext('2d', { alpha: false })!;

// ── canvas sizing ────────────────────────────────────────────────────────────
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 0 || h <= 0) return; // ignore transient 0-measure (backgrounded tab)
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  ui.canvas.width = Math.round(w * dpr);
  ui.canvas.height = Math.round(h * dpr);
  ui.canvas.style.width = `${w}px`;
  ui.canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = computeView(w, h, mode.lanes);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ── audio helpers ────────────────────────────────────────────────────────────
function setMuted(m: boolean): void {
  sfx.setMuted(m);
  store.set('muted', m);
  ui.btnMute.textContent = m ? '🔇' : '🔊';
  ui.btnMuteMenu.textContent = `Sound: ${m ? 'off' : 'on'}`;
}
setMuted(muted0);

// ── ghost storage ────────────────────────────────────────────────────────────
const ghostKey = (m: Mode, sd: number): string => `ghost:${m.id}:${sd >>> 0}`;

function loadGhost(m: Mode, sd: number): GhostRun | null {
  return store.get<GhostRun | null>(ghostKey(m, sd), null);
}
function saveGhost(m: Mode, sd: number, run: GhostRun): void {
  const prev = loadGhost(m, sd);
  if (prev && prev.d >= run.d) return;
  store.set(ghostKey(m, sd), run);
  // prune: keep a small LRU of ghost keys so replays never fill the quota
  const k = ghostKey(m, sd);
  const keys = store.get<string[]>('ghostKeys', []);
  const next = [k, ...keys.filter((x) => x !== k)].slice(0, 18);
  for (const old of keys) if (!next.includes(old)) store.remove(old);
  store.set('ghostKeys', next);
}

// ── best scores ──────────────────────────────────────────────────────────────
const bestKey = (m: Mode): string => `best:${m.id}`;
const bestOf = (m: Mode): number => store.get<number>(bestKey(m), 0);

// ── screen transitions ───────────────────────────────────────────────────────
function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}

function toMenu(): void {
  phase = 'menu';
  loop?.stop();
  input?.destroy();
  input = null;
  document.body.classList.remove('playing');
  show(ui.menu, true);
  show(ui.over, false);
  show(ui.hud, false);
  show(ui.controls, false);
  show(ui.pauseVeil, false);
  refreshMenu();
  clearShareInUrl();
  isDaily = false;
  beatTarget = null;
  // paint one idle menu-backdrop frame
  drawIdle();
}

function refreshMenu(): void {
  highlightMode(ui.modeChips, mode.id);
  ui.dailySub.textContent = `· best ${store.get<number>(`daily:${mode.id}:${todayKey()}`, 0)}m today`;
}

function drawIdle(): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
}

// ── run lifecycle ────────────────────────────────────────────────────────────
function startRun(m: Mode, sd: number, opts: { daily?: boolean; beat?: number | null } = {}): void {
  mode = m;
  seed = sd >>> 0;
  isDaily = !!opts.daily;
  beatTarget = opts.beat ?? null;
  store.set('lastMode', mode.id);
  resize();

  s = createRun(mode);
  track = genTrack(seed, mode);
  fx.clear();
  renderX = 0;
  ghostRec = [];
  ghostSampleT = 0;
  ghostPlay = loadGhost(mode, seed);
  deathTimer = 0;
  phase = 'play';

  sfx.unlock();
  input?.destroy();
  input = createInput(ui.canvas);

  show(ui.menu, false);
  show(ui.over, false);
  show(ui.hud, true);
  show(ui.controls, true);
  show(ui.pauseVeil, false);
  ui.modeChip.textContent = mode.name + (isDaily ? ' · daily' : '');
  ui.bestSm.textContent = `best ${bestOf(mode)}m`;
  document.body.classList.add('playing');

  loop?.stop();
  loop = createLoop({ update, render, hz: 60 });
  loop.start();
}

function onDeath(): void {
  phase = 'dying';
  deathTimer = 0;
  sfx.play('lose');
  fx.shake(20);
  const cx = laneScreenX(s.lane);
  fx.burst(cx, view.actionY, 40, COLORS.ember, { speed: 260, life: 0.8, size: 4, up: 60 });
  fx.burst(cx, view.actionY, 20, '#ff3050', { speed: 200, life: 0.7, size: 3 });
}

function finishToOver(): void {
  phase = 'over';
  loop?.stop();
  input?.destroy();
  input = null;
  document.body.classList.remove('playing');

  const dist = Math.round(s.x);
  const prevBest = bestOf(mode);
  const isBest = dist > prevBest;
  if (isBest) store.set(bestKey(mode), dist);
  if (isDaily) {
    const dk = `daily:${mode.id}:${todayKey()}`;
    if (dist > store.get<number>(dk, 0)) store.set(dk, dist);
  }
  saveGhost(mode, seed, { d: dist, s: ghostRec });

  const bench = Math.round(benchmarkDistance(seed, mode));
  renderOver(dist, prevBest, isBest, bench);
  show(ui.over, true);
  show(ui.hud, false);
  show(ui.controls, false);
}

function renderOver(dist: number, prevBest: number, isBest: boolean, bench: number): void {
  ui.overBadge.textContent = s.cause === 'chasm' ? 'FELL' : 'UNMADE';
  ui.overDist.innerHTML = `${dist}<span class="unit">m</span>`;

  let sub = isBest ? 'New best!' : `Best ${Math.max(prevBest, dist)}m`;
  if (beatTarget != null) {
    sub = dist > beatTarget ? `You beat their ${beatTarget}m! 🔥` : `${beatTarget - dist}m short of their ${beatTarget}m`;
  }
  ui.overSub.textContent = sub;

  const pct = bench > 0 ? Math.round((dist / bench) * 100) : 0;
  ui.bench.innerHTML = `A clean line on this seed reaches <b>${bench}m</b> — you ran <b>${pct}%</b> of it.`;

  ui.breakdown.innerHTML = [
    ['motes', s.motes, COLORS.mote],
    ['threads', s.nearMisses, '#9fe'],
    ['clips', s.hits, COLORS.block],
    ['chasms', s.gates, COLORS.gate],
  ]
    .map(
      ([label, val, col]) =>
        `<div class="bd"><div class="bd-v" style="color:${col}">${val}</div><div class="bd-l">${label}</div></div>`,
    )
    .join('');
}

// ── the loop ─────────────────────────────────────────────────────────────────
function laneScreenX(lane: number): number {
  return view.playX0 + (lane + 0.5) * view.laneW;
}

function handleReport(rep: StepReport): void {
  const cx = laneScreenX(s.lane);
  if (rep.laneChanged) sfx.play('blip');
  if (rep.jumped) sfx.play('jump');
  if (rep.slid) sfx.play('slide');
  if (rep.mote) {
    sfx.play('coin');
    fx.burst(cx, view.actionY, 10, COLORS.mote, { speed: 150, life: 0.5, size: 3 });
  }
  if (rep.near) {
    sfx.play('near');
    fx.burst(cx, view.actionY, 6, '#bfffe9', { speed: 120, life: 0.4, size: 2.4 });
  }
  if (rep.hit) {
    sfx.play('hit');
    fx.shake(12);
    fx.burst(cx, view.actionY, 16, COLORS.block, { speed: 220, life: 0.5, size: 3 });
  }
  if (rep.gate) {
    sfx.play('chasm');
    fx.burst(cx, view.actionY, 14, COLORS.gate, { speed: 240, life: 0.6, size: 3, up: 40 });
  }
}

let trailT = 0;
function update(step: number): void {
  if (phase === 'play') {
    if (s.alive) {
      const inp = input ? input.consume() : { move: 0 as const, jump: false, slide: false, surge: false };
      const rep = stepRun(s, mode, track, inp, step);
      handleReport(rep);

      ghostSampleT += step;
      if (ghostSampleT >= SAMPLE_DT) {
        ghostSampleT -= SAMPLE_DT;
        ghostRec.push([Math.round(s.x), s.lane]);
      }
      // surge audio hint (throttled)
      if (!s.alive) onDeath();
    }
  } else if (phase === 'dying') {
    deathTimer += step;
    if (deathTimer > 0.85) finishToOver();
  }
  fx.update(step);
}

function currentGhost(): GhostSample | null {
  if (!ghostPlay) return null;
  const idx = Math.floor(s.time / SAMPLE_DT);
  if (idx < 0 || idx >= ghostPlay.s.length) return null;
  const [gx, gl] = ghostPlay.s[idx];
  return { x: gx, lane: gl };
}

function render(alpha: number): void {
  // smooth the scroll between fixed steps
  const v = s.alive ? s.m * (mode.vMax - mode.vMin) + mode.vMin + (s.surging ? mode.surgeBoost : 0) : 0;
  renderX = s.x + (s.alive ? v * (alpha / 60) : 0);

  // ember trail
  trailT += 1;
  if (s.alive && phase === 'play' && trailT % 2 === 0) {
    fx.burst(laneScreenX(s.lane), view.actionY + 4, 1, 'rgba(255,140,40,0.9)', {
      speed: 40,
      life: 0.4,
      size: 3,
      grav: -40,
    });
  }

  drawScene(ctx, view, s, mode, track, fx, renderX, currentGhost(), reduced);
  updateHud();
}

function updateHud(): void {
  ui.dist.innerHTML = `${Math.round(s.x)}<span class="unit">m</span>`;
  const m = s.m;
  ui.mfill.style.width = `${Math.max(2, m * 100)}%`;
  ui.mfill.style.background = momentumColor(m);
  ui.surgePad.classList.toggle('active', s.surging);
}

// ── pause ────────────────────────────────────────────────────────────────────
function pause(): void {
  if (phase !== 'play') return;
  loop?.stop();
  show(ui.pauseVeil, true);
}
function resume(): void {
  if (ui.pauseVeil.hidden) return;
  show(ui.pauseVeil, false);
  loop?.start();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'play') pause();
});

// ── share ────────────────────────────────────────────────────────────────────
async function shareRun(): Promise<void> {
  const dist = Math.round(s.x);
  const url = buildShareUrl(seed, mode.id, dist);
  const text = `I ran ${dist}m in Emberwake (${mode.name}). Beat me on the same track:`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Emberwake', text, url });
      return;
    }
  } catch {
    /* user cancelled or share failed — fall through to clipboard */
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    flashShare('Link copied!');
  } catch {
    flashShare(url);
  }
}
function flashShare(msg: string): void {
  ui.shareMsg.textContent = msg;
  show(ui.shareMsg, true);
  window.setTimeout(() => show(ui.shareMsg, false), 2600);
}

// ── wiring ───────────────────────────────────────────────────────────────────
function selectMode(m: Mode): void {
  mode = m;
  store.set('lastMode', m.id);
  highlightMode(ui.modeChips, m.id);
  refreshMenu();
}

buildModeChips(ui.modeChips, mode.id, selectMode);

ui.btnPlay.addEventListener('click', () => startRun(mode, randomSeed()));
ui.btnDaily.addEventListener('click', () => startRun(mode, dailySeed(), { daily: true }));
ui.btnAgain.addEventListener('click', () => startRun(mode, isDaily ? dailySeed() : randomSeed(), { daily: isDaily, beat: beatTarget }));
ui.btnBackMenu.addEventListener('click', toMenu);
ui.btnShare.addEventListener('click', () => void shareRun());

ui.btnPause.addEventListener('click', pause);
ui.btnResume.addEventListener('click', resume);
ui.btnQuit.addEventListener('click', toMenu);

ui.btnMute.addEventListener('click', () => setMuted(!sfx.muted()));
ui.btnMuteMenu.addEventListener('click', () => setMuted(!sfx.muted()));

ui.btnHowto.addEventListener('click', () => show(ui.howto, true));
ui.btnHowtoClose.addEventListener('click', () => {
  show(ui.howto, false);
  store.set('seen', true);
});
ui.btnAbout.addEventListener('click', () => show(ui.about, true));
ui.btnAboutClose.addEventListener('click', () => show(ui.about, false));

// surge pad (touch) — the held burst control
const padDown = (e: Event): void => {
  e.preventDefault();
  input?.setSurge(true);
  sfx.play('surge');
};
const padUp = (e: Event): void => {
  e.preventDefault();
  input?.setSurge(false);
};
ui.surgePad.addEventListener('pointerdown', padDown);
ui.surgePad.addEventListener('pointerup', padUp);
ui.surgePad.addEventListener('pointercancel', padUp);
ui.surgePad.addEventListener('pointerleave', padUp);

// unlock audio on the very first gesture anywhere
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ── boot ─────────────────────────────────────────────────────────────────────
function boot(): void {
  const share: ShareTarget | null = parseShare();
  if (share) {
    // a deep-linked invite — run that exact seed once, then the URL is cleared
    clearShareInUrl();
    startRun(share.mode, share.seed, { beat: share.beat });
    return;
  }
  toMenu();
  if (!store.get<boolean>('seen', false)) show(ui.howto, true);
}
boot();

// Synchronous drive hook for verification: rAF is throttled in a hidden/backgrounded
// tab, so a browser test drives the fixed loop by hand (see the factory's rAF-testing
// note). Read-only w.r.t. the player; harmless in production.
(window as unknown as Record<string, unknown>).__ember = {
  play: (modeId?: string, sd?: number) =>
    startRun(modeId ? modeOf(modeId) : mode, sd ?? randomSeed()),
  daily: () => startRun(mode, dailySeed(), { daily: true }),
  step: (n = 60) => {
    for (let i = 0; i < n; i++) update(1 / 60);
    render(0);
  },
  surge: (on: boolean) => input?.setSurge(on),
  swipe: (dir: 'l' | 'r' | 'u' | 'd') => {
    const el = ui.canvas;
    const base = el.getBoundingClientRect();
    const cx = base.left + base.width / 2;
    const cy = base.top + base.height / 2;
    const to =
      dir === 'l' ? [cx - 90, cy] : dir === 'r' ? [cx + 90, cy] : dir === 'u' ? [cx, cy - 90] : [cx, cy + 90];
    const opt = (x: number, y: number): PointerEventInit => ({ pointerId: 1, clientX: x, clientY: y, bubbles: true });
    el.dispatchEvent(new PointerEvent('pointerdown', opt(cx, cy)));
    el.dispatchEvent(new PointerEvent('pointermove', opt(to[0], to[1])));
    el.dispatchEvent(new PointerEvent('pointerup', opt(to[0], to[1])));
  },
  state: () => ({ x: s.x, m: s.m, alive: s.alive, phase, lane: s.lane, mode: mode.id }),
  toMenu,
};
