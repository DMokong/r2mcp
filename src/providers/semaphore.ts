/**
 * Counting semaphore for per-provider concurrency caps (D.R6, D.AC8).
 *
 * The driver wraps each provider call in `withPermit` so that no more than
 * `limit` calls are in flight concurrently. `inFlight` is exposed so tests
 * can observe peak concurrency.
 */

export class Semaphore {
  private _inFlight = 0;
  private waiters: Array<() => void> = [];
  private _peak = 0;

  constructor(public readonly limit: number) {
    if (limit < 1) throw new Error(`Semaphore limit must be >= 1, got ${limit}`);
  }

  get inFlight(): number {
    return this._inFlight;
  }

  get peak(): number {
    return this._peak;
  }

  private async acquire(): Promise<void> {
    if (this._inFlight < this.limit) {
      this._inFlight++;
      if (this._inFlight > this._peak) this._peak = this._inFlight;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this._inFlight++;
    if (this._inFlight > this._peak) this._peak = this._inFlight;
  }

  private release(): void {
    this._inFlight--;
    const next = this.waiters.shift();
    if (next) next();
  }

  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
