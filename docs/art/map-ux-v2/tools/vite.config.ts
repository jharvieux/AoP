import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const packages = fileURLToPath(new URL('../../../../packages', import.meta.url))
const stubs = fileURLToPath(new URL('./stubs', import.meta.url))

export default {
  root,
  publicDir: fileURLToPath(new URL('../../../../apps/web/public', import.meta.url)),
  resolve: {
    alias: [
      { find: /^\.\.\/auth\/config$/, replacement: `${stubs}/authConfig.ts` },
      { find: /^\.\.\/auth$/, replacement: `${stubs}/auth.ts` },
      { find: /^\.\.\/audio\/feedback$/, replacement: `${stubs}/audioFeedback.ts` },
      {
        find: /^\.\.\/multiplayer\/realtimeTransport$/,
        replacement: `${stubs}/realtimeTransport.ts`,
      },
      {
        find: /^\.\.\/multiplayer\/reconnectSync$/,
        replacement: `${stubs}/reconnectSync.ts`,
      },
      {
        find: /^\.\.\/multiplayer\/spectateClient$/,
        replacement: `${stubs}/spectateClient.ts`,
      },
      {
        find: /^\.\.\/multiplayer\/spectatePoll$/,
        replacement: `${stubs}/spectatePoll.ts`,
      },
      {
        find: /^\.\.\/multiplayer\/submitWithRetry$/,
        replacement: `${stubs}/submitWithRetry.ts`,
      },
      { find: /^\.\.\/multiplayer\/turnSync$/, replacement: `${stubs}/turnSync.ts` },
      { find: '@aop/content', replacement: `${packages}/content/src/index.ts` },
      { find: '@aop/engine', replacement: `${packages}/engine/src/index.ts` },
      { find: /^@aop\/shared\/(.*)$/, replacement: `${packages}/shared/src/$1.ts` },
      { find: '@aop/shared', replacement: `${packages}/shared/src/index.ts` },
    ],
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
}
