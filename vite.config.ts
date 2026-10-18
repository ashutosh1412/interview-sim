import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const serverPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  server: {
    port: 5173,
    // Regex key: match only /api/... so source files like /api.ts are not proxied.
    proxy: { "^/api/": `http://localhost:${serverPort}` },
  },
  build: { outDir: "../../dist", emptyOutDir: true },
});
