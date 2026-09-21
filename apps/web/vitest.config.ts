import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@field/types': path.resolve(__dirname, '../../packages/types/src'),
      '@field/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@field/config': path.resolve(__dirname, '../../packages/config'),
      '@field/form-engine': path.resolve(__dirname, '../../packages/form-engine/src'),
    },
  },
});
