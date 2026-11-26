import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5200,
    strictPort: true,
    // Same-origin API calls: the refresh cookie stays SameSite=Strict and no CORS is needed in dev.
    proxy: { '/api': 'http://localhost:4100' },
  },
});
