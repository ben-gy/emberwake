/**
 * modes.test.ts — mode ids off the wire (a share link's ?mode=) must never resolve
 * to a Mode of undefined fields. Guarding with Object.hasOwn stops a prototype key
 * like `constructor` or `toString` sneaking through `MODES[id]`.
 */
import { describe, expect, it } from 'vitest';
import { allModes, modeOf, MODE_IDS, DEFAULT_MODE } from '../src/modes';

describe('modes', () => {
  it('exposes exactly three modes with genuine spread', () => {
    expect(MODE_IDS).toHaveLength(3);
    const lanes = allModes().map((m) => m.lanes);
    expect(lanes).toContain(3);
    expect(lanes).toContain(5); // Latticework — the phone-width risk, verified at 375px
  });

  it('resolves a known id', () => {
    expect(modeOf('nightfall').id).toBe('nightfall');
  });

  it('falls back to the default for unknown ids, never undefined', () => {
    expect(modeOf('does-not-exist').id).toBe(DEFAULT_MODE);
    expect(modeOf(null).id).toBe(DEFAULT_MODE);
    expect(modeOf(undefined).id).toBe(DEFAULT_MODE);
  });

  it('does not let a prototype key resolve to a bogus Mode', () => {
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(modeOf(key).id).toBe(DEFAULT_MODE);
    }
  });

  it('every mode has coherent, finite tuning', () => {
    for (const m of allModes()) {
      expect(m.vMax).toBeGreaterThan(m.vMin);
      expect(m.vMin).toBeGreaterThan(0);
      // at momentum 0 the runner is slower than the dark's floor, so a drained spark dies
      expect(m.vMin).toBeLessThan(m.darkBase);
      expect(m.darkRamp).toBeGreaterThan(0);
      expect(m.gateEvery).toBeGreaterThan(m.minSpacing);
      for (const v of Object.values(m)) {
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
