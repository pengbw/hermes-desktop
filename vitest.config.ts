import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@services": path.resolve(__dirname, "./src/services"),
      "@hooks": path.resolve(__dirname, "./src/hooks"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@stores": path.resolve(__dirname, "./src/stores"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@constants": path.resolve(__dirname, "./src/constants"),
      "@types": path.resolve(__dirname, "./src/@types"),
      "@i18n": path.resolve(__dirname, "./src/i18n"),
      "@contexts": path.resolve(__dirname, "./src/contexts"),
      "@styles": path.resolve(__dirname, "./src/styles"),
      "@windows": path.resolve(__dirname, "./src/windows"),
      "@assets": path.resolve(__dirname, "./src/assets"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/core/**", "src/services/**", "src/hooks/**", "src/stores/**"],
    },
  },
});
