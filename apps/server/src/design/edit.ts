/**
 * One design request in, a reply and a list of `DesignOp`s out. Goes through
 * the same client as the plan reading, so it works with an API key and with the
 * Claude Code login alike.
 */
import type { DesignEditRequest, DesignOp } from '@interio/core';
import { AnalyzeError, FALLBACK_BETA, createWithRetry, defaultLogger, type CreateParams, type VisionSettings } from '../vision/analyze';
import { parseJsonText } from '../vision/sanitize';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, buildUserText } from './prompt';
import { toDesignAnswer } from './sanitize';

const MAX_OUTPUT_TOKENS = 8000;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRY_DELAY_MS = 750;

export interface DesignEditOutput {
  reply: string;
  ops: DesignOp[];
  /** The model that answered. */
  model: string;
}

export async function designEdit(settings: VisionSettings, request: DesignEditRequest): Promise<DesignEditOutput> {
  const { client, model, logger = defaultLogger } = settings;
  const params: CreateParams = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildUserText(request) }] }],
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      ...(settings.effort ? { effort: settings.effort } : {}),
    },
    ...(settings.fallbacks === false ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
  };

  const message = await createWithRetry(client, params, {
    timeoutMs: settings.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retryDelayMs: settings.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    logger,
    label: 'design-edit',
  });

  if (message.stop_reason === 'refusal') {
    logger('design-edit: model declined the request');
    throw new AnalyzeError(502, 'The AI model declined this request.');
  }
  if (message.stop_reason === 'max_tokens') {
    logger('design-edit: response hit max_tokens');
    throw new AnalyzeError(502, 'The AI response was cut off before it was complete.');
  }
  const text = message.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
  const answer = toDesignAnswer(parseJsonText(text), request);
  if (!answer) {
    logger('design-edit: response was not a readable answer', { stopReason: message.stop_reason });
    throw new AnalyzeError(502, 'The AI response could not be read.');
  }
  if (answer.dropped > 0) logger('design-edit: dropped operations that did not match the home or the catalog', { dropped: answer.dropped });
  return { reply: answer.reply, ops: answer.ops, model: message.model || model };
}
