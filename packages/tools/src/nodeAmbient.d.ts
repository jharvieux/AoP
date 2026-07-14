/**
 * Minimal ambient declarations for the Node surface the CLI tools touch.
 * @aop/tools deliberately declares these locally (the same idiom as the
 * engine's local `declare function btoa`) instead of depending on
 * @types/node: package.json edits are operator-gated in this repo, and the
 * tools run under tsx where the real Node globals exist regardless.
 */

declare const process: {
  argv: string[]
  exit(code?: number): never
}

declare module 'node:zlib' {
  export function deflateSync(data: Uint8Array): Uint8Array
}

declare module 'node:fs' {
  export function writeFileSync(path: string, data: Uint8Array): void
}
