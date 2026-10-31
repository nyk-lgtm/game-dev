// A queue of short animation steps, advanced by frame time. Games turn their
// rule events into steps; while the timeline is busy, input waits.

export interface Step {
  dur: number;
  start?: () => void;
  update?: (t: number) => void;
  end?: () => void;
}

export class Timeline {
  private steps: Step[] = [];
  private cur: Step | null = null;
  private t = 0;
  private onDone: (() => void) | null = null;

  get busy(): boolean {
    return this.cur !== null || this.steps.length > 0;
  }

  play(steps: Step[], onDone: () => void): void {
    this.steps.push(...steps);
    this.onDone = onDone;
  }

  /** Drop all pending steps without running their callbacks. */
  cancel(): void {
    this.steps = [];
    this.cur = null;
    this.onDone = null;
  }

  update(dt: number): void {
    let budget = dt;
    for (let guard = 0; guard < 64; guard++) {
      if (!this.cur) {
        this.cur = this.steps.shift() ?? null;
        if (!this.cur) {
          const done = this.onDone;
          this.onDone = null;
          done?.();
          return;
        }
        this.t = 0;
        this.cur.start?.();
      }
      const remaining = this.cur.dur - this.t;
      if (budget < remaining) {
        this.t += budget;
        this.cur.update?.(this.t / this.cur.dur);
        return;
      }
      budget -= remaining;
      this.cur.update?.(1);
      this.cur.end?.();
      this.cur = null;
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
