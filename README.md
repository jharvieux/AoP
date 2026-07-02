# Age of Plunder

Pirate-themed strategy game loosely based on Heroes of Might and Magic. Web-based,
mobile-friendly, with async turn-based multiplayer.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture and roadmap.

## Development

```bash
pnpm install
pnpm dev          # start the web client (apps/web)
pnpm test         # run all package tests
pnpm typecheck    # typecheck all packages
pnpm build        # build all packages
```

## Layout

| Path               | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `packages/engine`  | Pure, deterministic game logic (no I/O)          |
| `packages/content` | Data-driven game content: factions, units, ships |
| `packages/shared`  | Shared types and utilities                       |
| `apps/web`         | React + Vite + PixiJS client                     |
