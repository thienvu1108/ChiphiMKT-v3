import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const BUILD_ID = `${(process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)}-${Date.now().toString(36)}`;

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), {
      name: 'mh-version-json',
      apply: 'build',
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }); },
    }],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __BUILD_ID__: JSON.stringify(mode === 'production' ? BUILD_ID : 'dev'),
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        // Nhật ký thay đổi: mọi import 'firebase/firestore' đi qua shim (chỉ ghi log trên DB *-staging).
        { find: /^firebase\/firestore$/, replacement: path.resolve(__dirname, 'src/vnext/changeLogShim.ts') },
      ],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      chunkSizeWarningLimit: 1200,
      modulePreload: {
        resolveDependencies: (_filename, deps) => {
          // Login/entry must not preload heavy optional vendors
          return deps.filter(
            (dep) => !dep.includes('vendor-xlsx') && !dep.includes('vendor-charts'),
          );
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('recharts') || id.includes('/d3-') || id.includes('\\d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            // Match only the actual React packages (not @base-ui/react etc.)
            if (
              /node_modules\/(react|react-dom|scheduler)\//.test(id) ||
              /node_modules\\(react|react-dom|scheduler)\\/.test(id)
            ) {
              return 'vendor-react';
            }
            if (
              id.includes('@radix-ui') ||
              id.includes('@base-ui') ||
              id.includes('class-variance-authority') ||
              id.includes('/clsx/') ||
              id.includes('tailwind-merge')
            ) {
              return 'vendor-ui';
            }
          },
        },
      },
    },
  };
});
