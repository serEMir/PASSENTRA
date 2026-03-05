import { defineConfig } from "vite";

export default defineConfig({
  // Keep idkit-core as a native ESM dependency so its WASM URL resolves to
  // /node_modules/@worldcoin/idkit-core/dist/idkit_wasm_bg.wasm in dev mode.
  optimizeDeps: {
    exclude: ["@worldcoin/idkit-core"],
  },
});
