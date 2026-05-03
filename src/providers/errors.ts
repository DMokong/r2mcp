/**
 * Provider-selection error surfaces. Kept in a dedicated module so consumers
 * can import them without pulling in the heavy adapter modules.
 */

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * The exact error message thrown when no provider can be auto-selected.
 * D.AC4 requires that all three remediation paths be named.
 */
export const NO_PROVIDER_AVAILABLE_MESSAGE =
  'No LLM provider is configured. Pick one of:\n' +
  '  • Claude Code (Max plan, $0/call): run `claude /login` so the headless adapter can spawn `claude -p`.\n' +
  '  • Anthropic API: export ANTHROPIC_API_KEY=sk-... and re-run.\n' +
  '  • OpenRouter: export R2MCP_OPENROUTER_API_KEY=sk-or-... and re-run.\n' +
  'You can also force a specific provider via --provider=<claude-code|anthropic|openrouter> or R2MCP_CLASSIFIER_PROVIDER.';
