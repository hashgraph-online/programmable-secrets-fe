# Programmable Secrets Frontend

Frontend for the Programmable Secrets policy-backed data access flow.

This app exposes:
- provider publishing flow
- buyer purchase and unlock flow
- agent onboarding flow with `skill-publish`
- local API routes used by the frontend runtime

## Update Notes (2026-03-07)

- Replaced boilerplate template README with project-specific operator docs.
- Added live URL, route map, Robinhood and Arbitrum story, and local run instructions.
- Kept deployment guidance provider-neutral and public-safe.

## Live App

- Base URL: [https://ps.hol.org](https://ps.hol.org)
- Agent onboarding route: [https://ps.hol.org/agents](https://ps.hol.org/agents)

## Product Story

- Primary chain path: Robinhood Chain testnet for the core financial data marketplace flow.
- Secondary chain path: Arbitrum Sepolia for ERC-8004 / UAID-gated policy validation.
- The frontend demonstrates purchase and unlock UX while the contract deployments and manifests remain the source of truth for addresses and policy semantics.

## Route Map

- `/` marketplace and policy discovery
- `/provider` provider publishing flow
- `/policy/[id]` policy purchase, receipt, and unlock flow
- `/agents` agent and developer onboarding with `skill-publish`
- `/api/ps/*` programmable-secrets API endpoints used by the app

## Prerequisites

- Node.js `>=20`
- pnpm `>=10`
- Wallet extension or WalletConnect-compatible wallet for purchase flows
- Access to the corresponding backend and contract deployments when testing non-mocked behavior

## Local Development

From `/Users/michaelkantor/CascadeProjects/hashgraph-online/programmable-secrets-fe`:

```bash
pnpm install
pnpm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Production Build Check

```bash
pnpm run lint
pnpm run build
pnpm run start
```

## Agent Install Flow (Skill-Publish)

The `/agents` page is aligned with pinned skill URL handoff patterns.

```bash
npx skill-publish install-url \
  --name programmable-secrets \
  --version <version> \
  --format pinned-skill-md
```

Optional manifest URL:

```bash
npx skill-publish install-url \
  --name programmable-secrets \
  --version <version> \
  --format pinned-manifest
```

## Contracts and Address Source of Truth

This frontend does not define canonical contract addresses in documentation.
Use deployment manifests from the contracts repo:

- `/Users/michaelkantor/CascadeProjects/hashgraph-online/programmable-secrets-contracts/deployments/robinhood-testnet.json`
- `/Users/michaelkantor/CascadeProjects/hashgraph-online/programmable-secrets-contracts/deployments/arbitrum-sepolia.json`

## Common Failure Modes

- Wallet connected to the wrong chain for the flow being tested.
- Backend service unavailable on expected API routes.
- Missing runtime configuration in local or deployment environment.
- Policy exists but buyer does not satisfy runtime witness requirements.

## Deployment Notes (Public-Safe)

- Docker and Kubernetes examples should stay generic and reusable.
- Do not commit cluster-specific secrets, provider-specific secret names, or internal infrastructure topology.
- Keep environment-specific values in deployment environment configuration, not in tracked docs.
