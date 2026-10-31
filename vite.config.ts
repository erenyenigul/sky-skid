import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'esnext', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
