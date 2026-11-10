/**
 * AI assist through the Claude Code login on this machine, for local use
 * without an API key.
 *
 * Each call starts one short headless Claude Code run (`claude -p`) and hands
 * it the same system prompt, image and output schema the API path sends. No
 * tools, no project context and no saved session: it is a single model call
 * that counts against the signed-in Claude plan's usage.
 *
 * The adapter implements the same `VisionClient` slice as the Anthropic SDK,
 * so `analyzePlan` (validation, coordinate frame, sanitising) is shared.
 */
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VisionClientError, type VisionClient, type VisionMessage } from './analyze';

export type Env = Record<string, string | undefined>;

export type SpawnFn = (command: string, args: string[], options: { cwd: string; env: Env }) => ChildProcessWithoutNullStreams;

export interface ClaudeCodeOptions {
  /** Path of the `claude` executable. */
  command: string;
  /** Environment for the child process. Defaults to `process.env`. */
  env?: Env;
  /** Replaced in tests. */
  spawn?: SpawnFn;
}

/**
 * Where the `claude` executable is, or null. `INTERIO_CLAUDE_COMMAND` wins;
 * otherwise PATH and the usual install locations are searched.
 */
export function findClaudeCommand(env: Env = process.env, exists: (file: string) => boolean = existsSync): string | null {
  const explicit = env.INTERIO_CLAUDE_COMMAND?.trim();
  if (explicit) return exists(explicit) ? explicit : null;
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  // A server started from an app or a bare shell often has a short PATH: also look where Claude Code installs itself.
  if (env.HOME) dirs.push(path.join(env.HOME, '.local', 'bin'), path.join(env.HOME, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin');
  for (const dir of dirs) {
    const file = path.join(dir, 'claude');
    if (exists(file)) return file;
  }
  return null;
}

/** The closing `result` event of `claude -p --output-format stream-json`. */
interface CliResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  modelUsage?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 180_000;

/** The requested model when the run used it (ids may carry a date or context suffix); otherwise the busiest one. */
function servedBy(usage: Record<string, unknown> | undefined, requested: string): string {
  const ids = Object.keys(usage ?? {});
  const match = ids.find((id) => id === requested || id.startsWith(requested));
  if (match || ids.length === 0) return requested;
  const output = (id: string) => Number((usage![id] as { outputTokens?: number } | undefined)?.outputTokens ?? 0);
  return ids.reduce((best, id) => (output(id) > output(best) ? id : best));
}

function failureFor(text: string): VisionClientError {
  // Only classify: the CLI's own wording never reaches the caller.
  if (/usage limit|rate limit|limit reached|hit your .*limit|429/i.test(text)) {
    return new VisionClientError("The Claude plan's usage limit has been reached. Try again later, or set ANTHROPIC_API_KEY.", false);
  }
  if (/not logged in|\/login|sign in|authentication|unauthorized|401|invalid api key|oauth/i.test(text)) {
    return new VisionClientError('Claude Code is not signed in on this machine. Run `claude` once and sign in, or set ANTHROPIC_API_KEY.', false);
  }
  if (/model.*(not found|not available|does not exist|access)|404/i.test(text)) {
    return new VisionClientError('The configured model is not available to this Claude Code login.', false);
  }
  return new VisionClientError('Claude Code could not complete the request.', true);
}

export function createClaudeCodeClient(options: ClaudeCodeOptions): VisionClient {
  const { command, env = process.env, spawn = nodeSpawn as unknown as SpawnFn } = options;

  async function create(params: Parameters<VisionClient['beta']['messages']['create']>[0], requestOptions?: { timeout?: number }): Promise<VisionMessage> {
    const first = params.messages[0];
    if (!first || typeof first.content === 'string') throw new VisionClientError('AI analysis failed.', false);
    const system = typeof params.system === 'string' ? params.system : '';
    const schema = params.output_config?.format && 'schema' in params.output_config.format ? params.output_config.format.schema : undefined;

    const args = [
      '-p',
      '--input-format', 'stream-json',
      // Streaming input (needed to pass the image as a content block) requires streaming output.
      '--output-format', 'stream-json',
      '--verbose',
      '--model', params.model,
      '--system-prompt', system,
      '--tools', '',
      '--safe-mode',
      '--no-session-persistence',
    ];
    if (schema) args.push('--json-schema', JSON.stringify(schema));
    if (params.output_config?.effort) args.push('--effort', params.output_config.effort);

    // The image goes in as a content block, exactly as the API would receive it: nothing is written to disk.
    const turn = JSON.stringify({ type: 'user', message: { role: 'user', content: first.content } });

    // An API key in the environment would make Claude Code bill the key instead of using the login.
    const childEnv: Env = { ...env };
    delete childEnv.ANTHROPIC_API_KEY;
    delete childEnv.ANTHROPIC_AUTH_TOKEN;

    const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(command, args, { cwd: tmpdir(), env: childEnv });
      } catch {
        reject(new VisionClientError('Claude Code could not be started on this machine.', false));
        return;
      }
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new VisionClientError('Claude Code timed out.', true));
      }, requestOptions?.timeout ?? DEFAULT_TIMEOUT_MS);
      child.stdout.on('data', (chunk) => (stdout += String(chunk)));
      child.stderr.on('data', (chunk) => (stderr += String(chunk)));
      child.on('error', () => {
        clearTimeout(timer);
        reject(new VisionClientError('Claude Code could not be started on this machine.', false));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
      child.stdin.on('error', () => undefined); // the child may exit before reading everything
      child.stdin.end(`${turn}\n`);
    });

    // One JSON event per line; the `result` event closes the run.
    let parsed: CliResult | null = null;
    for (const line of output.stdout.split('\n')) {
      if (!line.startsWith('{')) continue;
      try {
        const event = JSON.parse(line) as CliResult;
        if (event.type === 'result') parsed = event;
      } catch {
        // Not an event line.
      }
    }
    if (!parsed || parsed.is_error || output.code !== 0) {
      throw failureFor(`${typeof parsed?.result === 'string' ? parsed.result : ''}\n${output.stderr}\n${parsed ? '' : output.stdout}`);
    }

    const text =
      parsed.structured_output !== undefined && parsed.structured_output !== null
        ? JSON.stringify(parsed.structured_output)
        : typeof parsed.result === 'string'
          ? parsed.result
          : '';
    return {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      // `modelUsage` also lists the small model Claude Code uses for housekeeping, so it cannot name the reader.
      model: servedBy(parsed.modelUsage, params.model),
    };
  }

  return { beta: { messages: { create } } };
}
