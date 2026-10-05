/**
 * Stratified sampling shared by the corpus builder and the eval runner
 * (trk-7mx.1 review round 3, finding A/1: a plain prefix slice of --limit
 * pairs skewed toward whatever relation happened to sort first in the file,
 * so a default-sized fixture run never saw a 'none' pair at all).
 */

/** Evenly interleaves items from each stratum until `total` is reached or all strata are exhausted. */
export function roundRobinSample<T>(strata: ReadonlyArray<T[]>, total: number): T[] {
  const queues = strata.map((s) => [...s]);
  const result: T[] = [];
  let i = 0;
  while (result.length < total && queues.some((q) => q.length > 0)) {
    const q = queues[i % queues.length];
    const item = q.shift();
    if (item !== undefined) result.push(item);
    i++;
  }
  return result;
}

/** Groups `records` by `keyFn` and round-robin samples down to `limit` — every group gets a fair share. */
export function stratifiedLimit<T>(
  records: ReadonlyArray<T>,
  limit: number,
  keyFn: (item: T) => string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const key = keyFn(r);
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }
  return roundRobinSample([...groups.values()], limit);
}
