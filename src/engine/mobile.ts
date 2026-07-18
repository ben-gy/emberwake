/**
 * mobile.ts — never zoom, never feel like a web page. Copied from patterns/.
 * Call hardenViewport() once at boot. `user-scalable=no` is ignored by iOS Safari;
 * this cancels the proprietary gesture events and keeps --vh accurate.
 */

export interface HardenOptions {
  pinch?: boolean;
  doubleTap?: boolean;
  vhUnit?: boolean;
}

export type Unharden = () => void;

export function hardenViewport(opts: HardenOptions = {}): Unharden {
  const { pinch = true, doubleTap = true, vhUnit = true } = opts;
  const offs: (() => void)[] = [];

  const on = <K extends string>(
    target: EventTarget,
    type: K,
    fn: (e: Event) => void,
    options?: AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, fn, options);
    offs.push(() => target.removeEventListener(type, fn, options));
  };

  if (pinch) {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      on(document, type, (e) => e.preventDefault(), { passive: false });
    }
    on(
      document,
      'touchmove',
      (e) => {
        if ((e as TouchEvent).touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
  }

  if (doubleTap) {
    let lastTap = 0;
    on(
      document,
      'touchend',
      (e) => {
        const t = Date.now();
        if (t - lastTap < 320) e.preventDefault();
        lastTap = t;
      },
      { passive: false },
    );
    on(document, 'dblclick', (e) => e.preventDefault(), { passive: false });
  }

  if (vhUnit) {
    const setVh = (): void => {
      const h = window.innerHeight;
      if (h > 0) document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
    };
    setVh();
    on(window, 'resize', setVh);
    on(window, 'orientationchange', setVh);
    on(document, 'visibilitychange', setVh);
  }

  return () => {
    for (const off of offs) off();
  };
}
