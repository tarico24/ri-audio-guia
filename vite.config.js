import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['ri-audio-guia-production.up.railway.app']
  }
});
