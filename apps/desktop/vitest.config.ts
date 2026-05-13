import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config — unit tests for reducers, hooks, and theory clients.
// The jsdom environment gives us a minimal DOM for React-component tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["src/test/**", "src/main.tsx", "**/*.d.ts"],
    },
  },
});
