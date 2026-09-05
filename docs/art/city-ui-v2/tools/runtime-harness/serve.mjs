import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const harnessRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(harnessRoot, '../../../../..')
const dependencyRoot = resolve(
  process.env.AOP_WEB_NODE_MODULES ?? join(repoRoot, 'apps/web/node_modules'),
)
const cacheRoot = resolve(
  process.env.AOP_VITE_CACHE_DIR ?? join(tmpdir(), 'aop-613-city-evidence-vite-cache'),
)
const requestedPort = Number.parseInt(process.argv[2] ?? '4613', 10)

if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
  throw new Error(`invalid port: ${process.argv[2]}`)
}
if (!existsSync(join(dependencyRoot, 'vite/dist/node/index.js'))) {
  throw new Error(
    `Vite is unavailable under ${dependencyRoot}; set AOP_WEB_NODE_MODULES to an installed apps/web/node_modules directory`,
  )
}

const { createServer } = await import(
  pathToFileURL(join(dependencyRoot, 'vite/dist/node/index.js')).href
)
const { default: react } = await import(
  pathToFileURL(join(dependencyRoot, '@vitejs/plugin-react/dist/index.js')).href
)
const packagesRoot = join(repoRoot, 'packages')

const server = await createServer({
  root: harnessRoot,
  cacheDir: cacheRoot,
  publicDir: join(repoRoot, 'apps/web/public'),
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'react/jsx-dev-runtime',
        replacement: join(dependencyRoot, 'react/jsx-dev-runtime.js'),
      },
      { find: 'react/jsx-runtime', replacement: join(dependencyRoot, 'react/jsx-runtime.js') },
      { find: 'react-dom/client', replacement: join(dependencyRoot, 'react-dom/client.js') },
      { find: 'react-dom', replacement: join(dependencyRoot, 'react-dom/index.js') },
      { find: 'react', replacement: join(dependencyRoot, 'react/index.js') },
      { find: '@aop/content', replacement: join(packagesRoot, 'content/src/index.ts') },
      { find: '@aop/engine', replacement: join(packagesRoot, 'engine/src/index.ts') },
      {
        find: /^@aop\/shared\/(.*)$/,
        replacement: `${join(packagesRoot, 'shared/src')}/$1.ts`,
      },
      { find: '@aop/shared', replacement: join(packagesRoot, 'shared/src/index.ts') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: requestedPort,
    strictPort: true,
    fs: { allow: [repoRoot, dependencyRoot] },
  },
})

await server.listen()
server.printUrls()
