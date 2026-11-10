import { defineConfig, devices } from '@playwright/test';

// Dedicated ports so the suite never collides with a dev server you already have running.
const WEB_PORT = Number(process.env.INTERIO_E2E_WEB_PORT ?? 5273);
const API_PORT = Number(process.env.INTERIO_E2E_API_PORT ?? 8887);

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  // CI runners rasterise WebGL on two shared cores: give them room and one retry.
  timeout: process.env.CI ? 150_000 : 60_000,
  expect: { timeout: process.env.CI ? 20_000 : 10_000 },
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Software WebGL so 3D renders in headless runs and CI.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: `http://localhost:${WEB_PORT}`,
    env: { INTERIO_WEB_PORT: String(WEB_PORT), INTERIO_API_PORT: String(API_PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
