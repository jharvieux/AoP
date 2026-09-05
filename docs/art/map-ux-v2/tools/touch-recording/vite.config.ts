import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./', import.meta.url))
const repository = fileURLToPath(new URL('../../../../../', import.meta.url))
const packages = fileURLToPath(new URL('../../../../../packages', import.meta.url))
const requireFromWeb = createRequire(
  new URL('../../../../../apps/web/package.json', import.meta.url),
)

export default {
  root,
  base: './',
  cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../../../apps/web/public', import.meta.url)),
  resolve: {
    alias: [
      { find: /^react$/, replacement: requireFromWeb.resolve('react') },
      { find: /^react\/jsx-runtime$/, replacement: requireFromWeb.resolve('react/jsx-runtime') },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: requireFromWeb.resolve('react/jsx-dev-runtime'),
      },
      { find: /^react-dom$/, replacement: requireFromWeb.resolve('react-dom') },
      { find: /^react-dom\/client$/, replacement: requireFromWeb.resolve('react-dom/client') },
      { find: /^pixi\.js$/, replacement: requireFromWeb.resolve('pixi.js') },
      { find: '@aop/content', replacement: `${packages}/content/src/index.ts` },
      { find: '@aop/engine', replacement: `${packages}/engine/src/index.ts` },
      { find: /^@aop\/shared\/(.*)$/, replacement: `${packages}/shared/src/$1.ts` },
      { find: '@aop/shared', replacement: `${packages}/shared/src/index.ts` },
    ],
    dedupe: ['pixi.js', 'react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 4613,
    strictPort: true,
    fs: {
      allow: [repository],
    },
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
}
