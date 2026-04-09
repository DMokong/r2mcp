import { describe, it, expect } from 'vitest';
import { fingerprint, normalizeContent } from '../src/fingerprint.js';

describe('fingerprint', () => {
  it('produces consistent SHA-256 for same content', () => {
    const a = fingerprint('always use bun over npm');
    const b = fingerprint('always use bun over npm');
    expect(a).toBe(b);
  });

  it('differs for different content', () => {
    const a = fingerprint('use bun');
    const b = fingerprint('use npm');
    expect(a).not.toBe(b);
  });

  it('normalizes whitespace before hashing', () => {
    const a = fingerprint('  use  bun  ');
    const b = fingerprint('use bun');
    expect(a).toBe(b);
  });
});

describe('normalizeContent', () => {
  it('strips metadata comments', () => {
    expect(normalizeContent('use bun <!-- type:preference -->')).toBe('use bun');
  });

  it('collapses whitespace', () => {
    expect(normalizeContent('use   bun\n over   npm')).toBe('use bun over npm');
  });
});
