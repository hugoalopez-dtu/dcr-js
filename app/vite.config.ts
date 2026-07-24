import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE ?? "/dcr-js";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: base.endsWith("/") ? base : `${base}/`,
});
