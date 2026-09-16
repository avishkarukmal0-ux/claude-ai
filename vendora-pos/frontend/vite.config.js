import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill process.env so any npm packages that reference it don't crash in the browser
    'process.env': {},
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor — core React
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Vendor — charts (Recharts is large)
          'vendor-charts': ['recharts'],
          // Vendor — UI utilities
          'vendor-ui': ['lucide-react', 'clsx', 'react-hot-toast'],
          // Vendor — date + forms
          'vendor-forms': ['dayjs', 'react-hook-form', 'axios'],
          // Vendor — socket
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
  },
});
