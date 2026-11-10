/**
 * Records a `VisionResult` for one plan image, through the same code path as
 * POST /api/analyze-plan. Used to capture fixtures, through the API key or the
 * Claude Code login, whichever the environment selects.
 *
 *   pnpm --filter @interio/server analyze <page.png|page.jpg> [out.json]
 *
 * Paths are relative to the directory the command was run from. Without
 * [out.json] the result goes next to the image as <name>.vision.json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { effortFromEnv, fallbacksFromEnv, modelFromEnv, visionFromEnv, type Env } from './config';
import { AnalyzeError, analyzePlan, type VisionClient, type VisionSettings } from './vision/analyze';

export interface CliOptions extends Partial<Omit<VisionSettings, 'client'>> {
  client?: VisionClient | null;
  env?: Env;
  /** Directory that relative paths resolve against. */
  cwd?: string;
  print?: (line: string) => void;
}

const USAGE = 'Usage: pnpm --filter @interio/server analyze <page.png|page.jpg> [out.json]';

/** Returns the process exit code. */
export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const { env = process.env, client: given, print = console.error, cwd, ...overrides } = options;
  const vision = given === undefined ? visionFromEnv(env) : { provider: 'api' as const, client: given };
  const client = vision.client;
  // pnpm sets INIT_CWD to where the user ran the command; the script itself runs in apps/server.
  const base = cwd ?? env.INIT_CWD ?? process.cwd();
  const [input, output] = argv.filter((arg) => arg !== '--');

  if (!input || argv.includes('--help')) {
    print(USAGE);
    return input ? 0 : 2;
  }
  if (/\.pdf$/i.test(input)) {
    print('PDF input is not supported: render the page to PNG or JPEG first.');
    return 2;
  }
  if (!client) {
    print('No AI provider: set ANTHROPIC_API_KEY, or INTERIO_AI_PROVIDER=claude-code to use the Claude Code login (shell or repo-root .env).');
    return 1;
  }

  const inputPath = path.resolve(base, input);
  const outputPath = output
    ? path.resolve(base, output)
    : path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}.vision.json`);

  let image: string;
  try {
    image = (await readFile(inputPath)).toString('base64');
  } catch {
    print(`Cannot read ${inputPath}`);
    return 1;
  }

  try {
    const { result, model } = await analyzePlan(
      {
        ...overrides,
        client,
        model: overrides.model ?? modelFromEnv(env, vision.provider),
        effort: overrides.effort ?? effortFromEnv(env),
        fallbacks: overrides.fallbacks ?? fallbacksFromEnv(env),
      },
      { image, fileName: path.basename(inputPath) },
    );
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    print(
      `${result.rooms.length} rooms, ${result.tags.length} tags, scale ${result.scaleText ?? 'not found'} (${model})`,
    );
    print(`Wrote ${outputPath}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AnalyzeError)) throw error;
    print(`Analysis failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
