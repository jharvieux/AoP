import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./', import.meta.url))
const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const packages = fileURLToPath(new URL('../../../../packages', import.meta.url))
const stubs = fileURLToPath(new URL('./stubs', import.meta.url))

export default {
  root,
  cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../../apps/web/public', import.meta.url)),
  resolve: {
    alias: [
      { find: /^\.\.\/audio\/feedback$/, replacement: `${stubs}/audioFeedback.ts` },
      { find: '@aop/content', replacement: `${packages}/content/src/index.ts` },
      { find: '@aop/engine', replacement: `${packages}/engine/src/index.ts` },
      { find: /^@aop\/shared\/(.*)$/, replacement: `${packages}/shared/src/$1.ts` },
      { find: '@aop/shared', replacement: `${packages}/shared/src/index.ts` },
    ],
    dedupe: ['pixi.js', 'react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    fs: {
      allow: [repository],
    },
    headers: {
      'Cache-Control': 'no-store',
    },
  },
}
