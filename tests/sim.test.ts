/**
 * sim.test.ts — the deterministic simulation, its fairness invariants, and the
 * determinism the async daily-seed / share-link / ghost-replay all depend on.
 *
 * Determinism here is the analogue of the P2P-sync invariant: two runs of the same
 * seed (my ghost vs my live run; my share link vs your play; the balance bot vs the
 * live game) MUST produce byte-identical worlds, or the comparison is a lie.
 */
import { describe, expect, it } from 'vitest';
import { allModes, modeOf, DEFAULT_MODE } from '../src/modes';
import {
  createRun,
  genTrack,
  gapOf,
  maxDistance,
  speedOf,
  stepRun,
  JUMP_DUR,
  type StepInput,
  type TrackEvent,
} from '../src/game';
import { runBot } from '../src/bot';

const IDLE: StepInput = { move: 0, jump: false, slide: false, surge: false };
const mode = modeOf('ember');

describe('track generation — determinism & fairness', () => {
  it('is byte-identical for the same seed (daily seed / share link / ghost agree)', () => {
    for (const m of allModes()) {
      const a = genTrack(1234, m);
      const b = genTrack(1234, m);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('produces different tracks for different seeds', () => {
    const a = JSON.stringify(genTrack(1, mode));
    const b = JSON.stringify(genTrack(2, mode));
    expect(a).not.toBe(b);
  });

  it('event distances are strictly increasing — so at most one hazard per point, hence a lane is ALWAYS safe', () => {
    for (const m of allModes()) {
      const t = genTrack(77, m);
      for (let i = 1; i < t.length; i++) {
        expect(t[i].d).toBeGreaterThan(t[i - 1].d);
      }
    }
  });

  it('keeps every hazard/mote lane inside the lane range (gates span all, lane -1)', () => {
    for (const m of allModes()) {
      for (const ev of genTrack(9, m)) {
        if (ev.kind === 'gate') expect(ev.lane).toBe(-1);
        else {
          expect(ev.lane).toBeGreaterThanOrEqual(0);
          expect(ev.lane).toBeLessThan(m.lanes);
        }
      }
    }
  });

  it('contains both chasms and motes to power the surge economy', () => {
    const t = genTrack(5, mode);
    expect(t.some((e) => e.kind === 'gate')).toBe(true);
    expect(t.some((e) => e.kind === 'mote')).toBe(true);
  });
});

describe('step simulation', () => {
  it('advances distance and the dark together, starting one gap ahead', () => {
    const s = createRun(mode);
    expect(gapOf(s)).toBeCloseTo(mode.gap0, 5);
    stepRun(s, mode, [], IDLE, 1 / 60);
    expect(s.x).toBeGreaterThan(0);
    expect(s.xDark).toBeGreaterThan(-mode.gap0);
  });

  it('clamps lane changes to the track and moves one lane per step', () => {
    const s = createRun(mode);
    s.lane = 0;
    stepRun(s, mode, [], { ...IDLE, move: -1 }, 1 / 60);
    expect(s.lane).toBe(0); // cannot leave the left edge
    stepRun(s, mode, [], { ...IDLE, move: 1 }, 1 / 60);
    expect(s.lane).toBe(1);
  });

  it('a jump lasts JUMP_DUR and blocks a second jump mid-air', () => {
    const s = createRun(mode);
    const r = stepRun(s, mode, [], { ...IDLE, jump: true }, 1 / 60);
    expect(r.jumped).toBe(true);
    expect(s.air).toBeGreaterThan(0);
    const r2 = stepRun(s, mode, [], { ...IDLE, jump: true }, 1 / 60);
    expect(r2.jumped).toBe(false); // still airborne
    expect(s.air).toBeLessThanOrEqual(JUMP_DUR);
  });

  it('grabs a mote in-lane (momentum up) and misses it when sliding under', () => {
    const track: TrackEvent[] = [{ id: 0, d: 5, kind: 'mote', lane: 1 }];
    const s = createRun(mode);
    s.lane = 1;
    s.m = 0.5;
    // walk forward until the mote resolves
    for (let i = 0; i < 60 && s.overIdx === 0; i++) stepRun(s, mode, track, IDLE, 1 / 60);
    expect(s.motes).toBe(1);
    expect(s.m).toBeGreaterThan(0.5);

    const s2 = createRun(mode);
    s2.lane = 1;
    s2.m = 0.5;
    s2.slide = 1; // ducking under
    for (let i = 0; i < 60 && s2.overIdx === 0; i++)
      stepRun(s2, mode, track, { ...IDLE, slide: false }, 1 / 60);
    expect(s2.motes).toBe(0);
  });

  it('clipping a block bleeds momentum; dodging a lane away is clean', () => {
    const track: TrackEvent[] = [{ id: 0, d: 5, kind: 'block', lane: 1 }];
    const hitS = createRun(mode);
    hitS.lane = 1;
    hitS.m = 0.8;
    for (let i = 0; i < 60 && hitS.overIdx === 0; i++) stepRun(hitS, mode, track, IDLE, 1 / 60);
    expect(hitS.hits).toBe(1);
    expect(hitS.m).toBeLessThan(0.8);

    const safeS = createRun(mode);
    safeS.lane = 0; // different lane
    safeS.m = 0.8;
    for (let i = 0; i < 60 && safeS.overIdx === 0; i++) stepRun(safeS, mode, track, IDLE, 1 / 60);
    expect(safeS.hits).toBe(0);
  });

  it('a chasm is death unless you are surging as you cross it', () => {
    const track: TrackEvent[] = [{ id: 0, d: 8, kind: 'gate', lane: -1 }];
    const fell = createRun(mode);
    for (let i = 0; i < 120 && fell.alive; i++) stepRun(fell, mode, track, IDLE, 1 / 60);
    expect(fell.alive).toBe(false);
    expect(fell.cause).toBe('chasm');

    const crossed = createRun(mode);
    crossed.m = 1;
    for (let i = 0; i < 120 && crossed.overIdx === 0; i++)
      stepRun(crossed, mode, track, { ...IDLE, surge: true }, 1 / 60);
    expect(crossed.gates).toBe(1);
    expect(crossed.alive).toBe(true);
  });

  it('momentum can never leave [0,1]', () => {
    const s = createRun(mode);
    const track = genTrack(3, mode);
    for (let i = 0; i < 4000 && s.alive; i++) {
      stepRun(s, mode, track, { move: (i % 3) - 1, jump: i % 5 === 0, slide: i % 7 === 0, surge: i % 4 === 0 } as StepInput, 1 / 60);
      expect(s.m).toBeGreaterThanOrEqual(0);
      expect(s.m).toBeLessThanOrEqual(1);
    }
  });

  it('the dark eventually catches every runner (bounded runs)', () => {
    // even standing on max momentum, the ramp overtakes top speed.
    const s = createRun(mode);
    s.m = 1;
    for (let i = 0; i < 60 * 400 && s.alive; i++)
      stepRun(s, mode, [], { ...IDLE, surge: false }, 1 / 60);
    expect(s.alive).toBe(false);
    expect(speedOf(s, mode)).toBeGreaterThan(0);
  });

  it('maxDistance is positive and finite for every mode', () => {
    for (const m of allModes()) {
      const d = maxDistance(m);
      expect(d).toBeGreaterThan(0);
      expect(Number.isFinite(d)).toBe(true);
    }
  });
});

describe('bot determinism', () => {
  it('same seed + policy → identical run (ghost replay / share link reproduce exactly)', () => {
    for (const m of allModes()) {
      const a = runBot(42, m, { policy: 'mixed', skillSeed: 7 });
      const b = runBot(42, m, { policy: 'mixed', skillSeed: 7 });
      expect(a).toEqual(b);
    }
  });

  it('default mode resolves and is playable by the bot', () => {
    const r = runBot(1, modeOf(DEFAULT_MODE), { policy: 'mixed' });
    expect(r.distance).toBeGreaterThan(0);
    expect(r.cause).not.toBeNull();
  });
});
