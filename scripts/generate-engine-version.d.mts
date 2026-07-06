// Hand-written type declaration for generate-engine-version.mjs — the repo has
// no @types/node dependency anywhere (engine/content/shared must stay
// Node-API-free), so this plain-TS signature lets apps/web's Vitest suite
// import the .mjs script for the #251 regression test without pulling Node
// types into a browser-targeted tsconfig.
export declare function computeEngineVersion(repoRoot?: string): string
