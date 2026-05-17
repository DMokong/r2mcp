import { describe, it, expect } from 'vitest';
import { normalizeEntityName } from '../../src/entities/normalize.js';

describe('SPEC-046 R3 normalizeEntityName', () => {
  it('lowercases', () => expect(normalizeEntityName('Speculator')).toBe('speculator'));
  it('trims leading and trailing whitespace', () => expect(normalizeEntityName('  spec  ')).toBe('spec'));
  it('collapses internal whitespace runs to single space', () => {
    expect(normalizeEntityName('Speculator   v2')).toBe('speculator v2');
    expect(normalizeEntityName('a\t\tb')).toBe('a b');
    expect(normalizeEntityName('a\nb')).toBe('a b');
  });
  it('applies NFKC normalization', () => {
    // Half-width digit → full-width: NFKC folds them
    expect(normalizeEntityName('Pgvector²')).toBe('pgvector2');
  });
  it('combines all four rules', () => {
    expect(normalizeEntityName('  Speculator   v2 ')).toBe('speculator v2');
  });
  it('empty input returns empty', () => expect(normalizeEntityName('')).toBe(''));
  it('whitespace-only input returns empty', () => expect(normalizeEntityName('   \t\n')).toBe(''));
});
