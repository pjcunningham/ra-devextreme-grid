import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      insertTypesEntry: true,
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'RaDevextremeGrid',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        /^react(\/.*)?$/,
        /^react-dom(\/.*)?$/,
        /^react-admin(\/.*)?$/,
        /^ra-core(\/.*)?$/,
        /^devextreme(\/.*)?$/,
        /^devextreme-react(\/.*)?$/,
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-admin': 'ReactAdmin',
          devextreme: 'DevExpress',
          'devextreme-react': 'DevExpressReact',
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
