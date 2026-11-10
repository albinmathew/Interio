/**
 * Environment wiring for AI assist.
 *
 *   INTERIO_AI_PROVIDER   auto (default) | api | claude-code | off
 *                         auto: the API when ANTHROPIC_API_KEY is set, otherwise off
 *                         claude-code: the Claude Code login on this machine, no key needed.
 *                         It is opt-in because it sends the page image to Anthropic, and a
 *                         machine that merely has Claude Code installed has not agreed to that.
 *   ANTHROPIC_API_KEY     key for the API provider
 *   ANTHROPIC_MODEL       model id for either provider. Default: claude-fable-5-2 on the API;
 *                         claude-sonnet-5-5 through Claude Code, where every call counts against
 *                         the signed-in plan's usage limits and Sonnet reads these sheets accurately
 *   INTERIO_CLAUDE_COMMAND  path of the `claude` executable, when it is not on PATH
 *   INTERIO_AI_EFFORT     optional: low | medium | high | xhigh | max (model default when unset)
 *   INTERIO_AI_FALLBACKS  optional: "off" stops asking the API to re-run a declined request on a fallback model
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Effort, VisionClient } from './vision/analyze';
import { createClaudeCodeClient, findClaudeCommand } from './vision/claudeCode';

export const DEFAULT_MODEL = 'claude-fable-5-2';
export const DEFAULT_CLAUDE_CODE_MODEL = 'claude-sonnet-5-5';

export type Env = Record<string, string | undefined>;

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

const value = (env: Env, name: string) => env[name]?.trim() || undefined;

export function modelFromEnv(env: Env = process.env, provider: Provider = 'api'): string {
  return value(env, 'ANTHROPIC_MODEL') ?? (provider === 'claude-code' ? DEFAULT_CLAUDE_CODE_MODEL : DEFAULT_MODEL);
}

/** Null when no key is configured. Retries are handled by the caller, so the SDK's are off. */
export function clientFromEnv(env: Env = process.env): VisionClient | null {
  const apiKey = value(env, 'ANTHROPIC_API_KEY');
  return apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
}

export function effortFromEnv(env: Env = process.env): Effort | undefined {
  const effort = value(env, 'INTERIO_AI_EFFORT');
  return EFFORTS.find((e) => e === effort);
}

export function fallbacksFromEnv(env: Env = process.env): boolean {
  return value(env, 'INTERIO_AI_FALLBACKS')?.toLowerCase() !== 'off';
}

export type Provider = 'api' | 'claude-code' | 'off';

export interface Vision {
  provider: Provider;
  client: VisionClient | null;
}

/**
 * Picks how AI assist is served. With no explicit choice: the API when a key is
 * set, otherwise off. The Claude Code login is used only when asked for.
 */
export function visionFromEnv(env: Env = process.env): Vision {
  const off: Vision = { provider: 'off', client: null };
  const choice = value(env, 'INTERIO_AI_PROVIDER')?.toLowerCase() ?? 'auto';
  if (choice === 'off') return off;
  if (choice !== 'claude-code') {
    const client = clientFromEnv(env);
    return client ? { provider: 'api', client } : off;
  }
  const command = findClaudeCommand(env);
  return command ? { provider: 'claude-code', client: createClaudeCodeClient({ command, env }) } : off;
}
