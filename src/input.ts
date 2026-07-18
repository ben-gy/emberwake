/**
 * input.ts — turns swipes and keys into the per-step StepInput the sim consumes.
 *
 * Controls are chosen for the game (factory principle #19): a runner that steps
 * between lanes and leaps/slides is a SWIPE game, not a D-pad game. Swipes are
 * classified off a Pointer Events stream (dominant-axis, low threshold for snappy
 * response, fired mid-gesture) and SURGE is a held pad in the thumb zone. Lane
 * intent is queued so a fast double-swipe shifts two lanes.
 */

import type { StepInput } from './game';

const SWIPE_MIN = 26; // px before a drag counts as a swipe — low, so it feels instant

export interface InputCtl {
  consume(): StepInput;
  isSurge(): boolean;
  setSurge(v: boolean): void;
  destroy(): void;
}

export function createInput(surface: HTMLElement): InputCtl {
  let moveQueue = 0;
  let jump = false;
  let slide = false;
  let surge = false;

  // swipe tracking
  let active = false;
  let sx = 0;
  let sy = 0;
  let fired = false;
  let pid = -1;

  const enqueue = (dir: 'l' | 'r' | 'u' | 'd'): void => {
    if (dir === 'l') moveQueue -= 1;
    else if (dir === 'r') moveQueue += 1;
    else if (dir === 'u') jump = true;
    else slide = true;
  };

  const onDown = (e: PointerEvent): void => {
    if (active) return;
    active = true;
    fired = false;
    pid = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (!active || e.pointerId !== pid || fired) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    if (Math.abs(dx) >= Math.abs(dy)) enqueue(dx > 0 ? 'r' : 'l');
    else enqueue(dy > 0 ? 'd' : 'u');
    fired = true;
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    active = false;
    pid = -1;
  };

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);

  // keyboard
  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        if (!e.repeat) moveQueue -= 1;
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        if (!e.repeat) moveQueue += 1;
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        if (!e.repeat) jump = true;
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        if (!e.repeat) slide = true;
        e.preventDefault();
        break;
      case ' ':
      case 'Shift':
        surge = true;
        e.preventDefault();
        break;
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ' || e.key === 'Shift') surge = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    consume(): StepInput {
      let move: -1 | 0 | 1 = 0;
      if (moveQueue > 0) {
        move = 1;
        moveQueue -= 1;
      } else if (moveQueue < 0) {
        move = -1;
        moveQueue += 1;
      }
      const out: StepInput = { move, jump, slide, surge };
      jump = false;
      slide = false;
      return out;
    },
    isSurge: () => surge,
    setSurge(v: boolean) {
      surge = v;
    },
    destroy() {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
