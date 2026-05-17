import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3022,
    strictPort: false,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:6022', changeOrigin: true },
      '/auth': { target: 'http://localhost:6022', changeOrigin: true },
    },
  },
  preview: {
    port: 3022,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://localhost:6022', changeOrigin: true },
      '/auth': { target: 'http://localhost:6022', changeOrigin: true },
    },
  },
});
