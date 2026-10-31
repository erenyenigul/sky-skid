import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5287',
    launchOptions: { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal'] },
  },
  webServer: { command: 'npx vite --port 5287 --strictPort', url: 'http://localhost:5287', reuseExistingServer: false },
});
