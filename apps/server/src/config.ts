/**
 * Environment wiring for AI assist.
 *
 *   ANTHROPIC_API_KEY     enables AI assist; without it the API answers { available: false }
 *   ANTHROPIC_MODEL       model id, default claude-fable-5-2
 *   INTERIO_AI_EFFORT     optional: low | medium | high | xhigh | max (model default when unset)
 *   INTERIO_AI_FALLBACKS  optional: "off" stops asking the API to re-run a declined request on a fallback model
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Effort, VisionClient } from './vision/analyze';

export const DEFAULT_MODEL = 'claude-fable-5-2';

export type Env = Record<string, string | undefined>;

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

const value = (env: Env, name: string) => env[name]?.trim() || undefined;

export function modelFromEnv(env: Env = process.env): string {
  return value(env, 'ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
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
