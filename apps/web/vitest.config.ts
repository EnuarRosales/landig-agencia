import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
      "client-only": path.resolve(__dirname, "./test/stubs/client-only.ts"),
    },
  },
});
