// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * loop.ts — fixed-timestep game loop with a render interpolation hook.
 * Copied from patterns/. Fixed 60Hz sim keeps physics frame-rate independent and
 * deterministic (the same property the ghost replay + balance sim rely on).
 */

export interface LoopConfig {
  update: (step: number) => void;
  render: (alpha: number) => void;
  hz?: number;
  maxStepsPerFrame?: number;
  onFps?: (fps: number) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  running(): boolean;
}

export function createLoop(config: LoopConfig): Loop {
  const hz = config.hz ?? 60;
  const step = 1 / hz;
  const maxSteps = config.maxStepsPerFrame ?? 5;

  let raf = 0;
  let last = 0;
  let acc = 0;
  let alive = false;

  let fpsAccum = 0;
  let frames = 0;

  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);

    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    let steps = 0;
    while (acc >= step && steps < maxSteps) {
      config.update(step);
      acc -= step;
      steps++;
    }
    if (steps >= maxSteps) acc = 0;

    config.render(acc / step);

    if (config.onFps) {
      fpsAccum += dt;
      frames++;
      if (fpsAccum >= 0.5) {
        config.onFps(frames / fpsAccum);
        fpsAccum = 0;
        frames = 0;
      }
    }
  };

  return {
    start() {
      if (alive) return;
      alive = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      alive = false;
      cancelAnimationFrame(raf);
    },
    running: () => alive,
  };
}
