import { describe, it, expect, vi } from 'vitest';
import {
  selectProvider,
  ProviderUnavailableError,
  NO_PROVIDER_AVAILABLE_MESSAGE,
  isProviderName,
  type LLMProvider,
} from '../../src/providers/index.js';

function fakeProvider(name: 'anthropic' | 'claude-code' | 'openrouter'): LLMProvider {
  return {
    name,
    concurrencyLimit: name === 'claude-code' ? 2 : 10,
    complete: vi.fn(),
  };
}

describe('isProviderName', () => {
  it('accepts the three valid provider names', () => {
    expect(isProviderName('anthropic')).toBe(true);
    expect(isProviderName('claude-code')).toBe(true);
    expect(isProviderName('openrouter')).toBe(true);
  });

  it('rejects unknown names', () => {
    expect(isProviderName('openai')).toBe(false);
    expect(isProviderName('')).toBe(false);
  });
});

describe('selectProvider — auto-fallback (D.AC1)', () => {
  it('prefers claude-code when logged in and no flag/env', async () => {
    const p = await selectProvider({
      env: { ANTHROPIC_API_KEY: 'sk-test', R2MCP_OPENROUTER_API_KEY: 'sk-or-test' },
      probeClaudeCode: async () => true,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('claude-code');
  });

  it('falls back to anthropic when claude-code probe fails and ANTHROPIC_API_KEY is set', async () => {
    const p = await selectProvider({
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      probeClaudeCode: async () => false,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('anthropic');
  });

  it('falls back to openrouter when only its API key is set', async () => {
    const p = await selectProvider({
      env: { R2MCP_OPENROUTER_API_KEY: 'sk-or-test' },
      probeClaudeCode: async () => false,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('openrouter');
  });
});

describe('selectProvider — explicit flag (D.AC2, D.AC3)', () => {
  it('--provider=anthropic overrides claude-code login (D.AC2)', async () => {
    const probe = vi.fn(async () => true);
    const p = await selectProvider({
      flag: 'anthropic',
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      probeClaudeCode: probe,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('anthropic');
    // The probe must NOT run when an explicit flag overrides auto-fallback —
    // probing would run a real subprocess and waste time.
    expect(probe).not.toHaveBeenCalled();
  });

  it('--provider=openrouter overrides claude-code login (D.AC3)', async () => {
    const p = await selectProvider({
      flag: 'openrouter',
      env: { R2MCP_OPENROUTER_API_KEY: 'sk-or-test', ANTHROPIC_API_KEY: 'sk-test' },
      probeClaudeCode: async () => true,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('openrouter');
  });

  it('--provider=claude-code skips the probe and forces claude-code', async () => {
    const probe = vi.fn(async () => false);
    const p = await selectProvider({
      flag: 'claude-code',
      env: {},
      probeClaudeCode: probe,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('claude-code');
    expect(probe).not.toHaveBeenCalled();
  });

  it('R2MCP_CLASSIFIER_PROVIDER env var resolves like a flag', async () => {
    const p = await selectProvider({
      env: { R2MCP_CLASSIFIER_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test' },
      probeClaudeCode: async () => true,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('anthropic');
  });

  it('flag wins over env var (precedence 1 > 2)', async () => {
    const p = await selectProvider({
      flag: 'openrouter',
      env: {
        R2MCP_CLASSIFIER_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-test',
        R2MCP_OPENROUTER_API_KEY: 'sk-or-test',
      },
      probeClaudeCode: async () => true,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    expect(p.name).toBe('openrouter');
  });
});

describe('selectProvider — error message names all three options (D.AC4)', () => {
  it('throws ProviderUnavailableError naming all 3 remediation paths when nothing is configured', async () => {
    const promise = selectProvider({
      env: {},
      probeClaudeCode: async () => false,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    await expect(promise).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(promise).rejects.toThrow(/Claude Code/);
    await expect(promise).rejects.toThrow(/Anthropic API/);
    await expect(promise).rejects.toThrow(/OpenRouter/);
    // The canonical message is what the CLI surfaces — keep it consistent.
    expect(NO_PROVIDER_AVAILABLE_MESSAGE).toContain('Claude Code');
    expect(NO_PROVIDER_AVAILABLE_MESSAGE).toContain('Anthropic API');
    expect(NO_PROVIDER_AVAILABLE_MESSAGE).toContain('OpenRouter');
  });

  it('--provider=anthropic without ANTHROPIC_API_KEY throws ProviderUnavailableError', async () => {
    const promise = selectProvider({
      flag: 'anthropic',
      env: {},
      probeClaudeCode: async () => false,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    await expect(promise).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('--provider=openrouter without R2MCP_OPENROUTER_API_KEY throws ProviderUnavailableError', async () => {
    const promise = selectProvider({
      flag: 'openrouter',
      env: {},
      probeClaudeCode: async () => false,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    await expect(promise).rejects.toThrow(/R2MCP_OPENROUTER_API_KEY/);
  });

  it('R2MCP_CLASSIFIER_PROVIDER with unknown value throws', async () => {
    const promise = selectProvider({
      env: { R2MCP_CLASSIFIER_PROVIDER: 'openai' },
      probeClaudeCode: async () => false,
      makeAnthropic: () => fakeProvider('anthropic'),
      makeClaudeCode: () => fakeProvider('claude-code'),
      makeOpenRouter: () => fakeProvider('openrouter'),
    });
    await expect(promise).rejects.toThrow(/not a recognized provider/);
  });
});
