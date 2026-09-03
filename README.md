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

## License

Copyright (c) 2026 John Harvieux. This project is proprietary and all rights
are reserved. Public availability does not make it open source or grant
permission to use, copy, modify, distribute, deploy, host, or commercialize it,
except for the limited license required by the GitHub Terms of Service for
content in a public repository. See [LICENSE](LICENSE) for the full notice.
