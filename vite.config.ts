import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Relative paths, so the build works at any address, including username.github.io/repo/.
  base: './',
  plugins: [preact()],
  build: { target: 'esnext', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
