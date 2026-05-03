import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../src/providers/semaphore.js';

describe('Semaphore', () => {
  it('rejects limits < 1', () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
  });

  it('serializes calls when limit=1', async () => {
    const s = new Semaphore(1);
    const order: number[] = [];
    let inFlight = 0;
    let peak = 0;
    const work = async (id: number) => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      order.push(id);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    };
    await Promise.all([1, 2, 3].map((id) => s.withPermit(() => work(id))));
    expect(peak).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it('caps in-flight count at limit (D.AC8 — driver behavior)', async () => {
    const s = new Semaphore(2);
    let inFlight = 0;
    let peak = 0;
    const work = async () => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    };
    await Promise.all(Array.from({ length: 5 }, () => s.withPermit(work)));
    expect(peak).toBe(2);
  });

  it('caps at 10 with 15 concurrent tasks (D.AC8 anthropic/openrouter case)', async () => {
    const s = new Semaphore(10);
    let inFlight = 0;
    let peak = 0;
    const work = async () => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    };
    await Promise.all(Array.from({ length: 15 }, () => s.withPermit(work)));
    expect(peak).toBe(10);
  });

  it('releases the permit even when the wrapped fn throws', async () => {
    const s = new Semaphore(1);
    await expect(
      s.withPermit(async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    // Subsequent acquire must succeed (no deadlock).
    let ran = false;
    await s.withPermit(async () => { ran = true; });
    expect(ran).toBe(true);
  });

  it('exposes peak observed concurrency for instrumentation', async () => {
    const s = new Semaphore(3);
    await Promise.all([
      s.withPermit(() => new Promise<void>((r) => setTimeout(r, 5))),
      s.withPermit(() => new Promise<void>((r) => setTimeout(r, 5))),
      s.withPermit(() => new Promise<void>((r) => setTimeout(r, 5))),
    ]);
    expect(s.peak).toBe(3);
    expect(s.inFlight).toBe(0);
  });
});
