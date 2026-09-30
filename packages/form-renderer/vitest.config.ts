import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@field/form-engine": path.resolve(__dirname, "../form-engine/src"),
      "@field/ui": path.resolve(__dirname, "../ui/src"),
    },
  },
});
