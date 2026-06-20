import { defineConfig } from "tsdown";

export default defineConfig({
  format: "esm",
  target: "esnext",
  shims: false,
  clean: true,
  outDir: "build",
  entry: ["dl.ts"],
});
