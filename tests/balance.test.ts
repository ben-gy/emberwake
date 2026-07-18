/**
 * balance.test.ts — the difficulty curve is the opponent, so it is MEASURED, not
 * argued (factory principle #18/#19). A reactive runner-bot plays hundreds of fixed
 * seeds per mode under three surge policies, and we assert on the SHAPE of the result:
 *
 *  1. A mixed "spend at chasms + escape the closing dark" line beats BOTH pure-hoarding
 *     (never surge → dies at the first chasm) AND surge-spam (bleeds momentum → slow).
 *     This is the idea's headline claim and the whole point of the surge economy.
 *  2. Ignoring the surge mechanic is catastrophic — pure-hoard dies at a chasm almost
 *     every game — so the game can't be beaten by refusing to engage with it.
 *  3. Near-zero UNFAIR early death: the track is always survivable by lane-dodging, so a
 *     competent line is essentially never killed in the first few seconds by bad luck.
 *  4. Run length lands in a sane, mode-appropriate window (not an instant wall, not
 *     endless), and every run terminates — the rising dark guarantees it.
 *
 * The baseline that set these numbers was printed first and let the sim referee the
 * tuning; the design's first guesses (see plan.md / the build log) were wrong twice.
 * Deterministic, seeded, no Math.random — runs in ~1s so it stays in the default suite.
 */
import { describe, expect, it } from 'vitest';
import { allModes, modeOf } from '../src/modes';
import { runBot, type BotResult, type SurgePolicy } from '../src/bot';

const N = 220;

function sweep(modeId: string, policy: SurgePolicy): BotResult[] {
  const mode = modeOf(modeId);
  const out: BotResult[] = [];
  for (let seed = 1; seed <= N; seed++) {
    out.push(runBot(seed, mode, { policy, skillSeed: 0x51 + seed * 7 }));
  }
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const rate = (rs: BotResult[], pred: (r: BotResult) => boolean): number =>
  rs.filter(pred).length / rs.length;

/** Mode-appropriate median-distance windows (metres), generous around the baseline. */
const DIST_WINDOW: Record<string, [number, number]> = {
  ember: [1500, 2800],
  nightfall: [850, 2100],
  latticework: [1600, 3300],
};

describe('balance — surge economy', () => {
  for (const mode of allModes()) {
    describe(mode.name, () => {
      const mixed = sweep(mode.id, 'mixed');
      const hoard = sweep(mode.id, 'purehoard');
      const spam = sweep(mode.id, 'spam');

      const mMixed = median(mixed.map((r) => r.distance));
      const mHoard = median(hoard.map((r) => r.distance));
      const mSpam = median(spam.map((r) => r.distance));

      it('mixed beats pure-hoarding by a wide margin', () => {
        expect(mMixed).toBeGreaterThan(mHoard * 2.0);
      });

      it('mixed beats surge-spam by a wide margin', () => {
        expect(mMixed).toBeGreaterThan(mSpam * 2.5);
      });

      it('ignoring surge (pure-hoard) dies at a chasm almost every game', () => {
        expect(rate(hoard, (r) => r.cause === 'chasm')).toBeGreaterThan(0.5);
      });

      it('the mixed line rarely fumbles a chasm it chose to cross', () => {
        expect(rate(mixed, (r) => r.cause === 'chasm')).toBeLessThan(0.08);
      });

      it('near-zero unfair early death (gone inside 8s)', () => {
        expect(rate(mixed, (r) => r.time < 8)).toBeLessThan(0.02);
      });

      it('median run length sits in a sane, mode-appropriate window', () => {
        const [lo, hi] = DIST_WINDOW[mode.id];
        expect(mMixed).toBeGreaterThanOrEqual(lo);
        expect(mMixed).toBeLessThanOrEqual(hi);
        const t = median(mixed.map((r) => r.time));
        expect(t).toBeGreaterThan(20);
        expect(t).toBeLessThan(140);
      });

      it('every run terminates (the rising dark guarantees it)', () => {
        for (const r of mixed) {
          expect(Number.isFinite(r.distance)).toBe(true);
          expect(r.time).toBeLessThan(400);
          expect(r.cause).not.toBeNull();
        }
      });
    });
  }
});
