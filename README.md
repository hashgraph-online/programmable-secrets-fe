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

## Live Subgraphs

- Robinhood query endpoint: `https://ps-subgraph.hol.org/subgraphs/name/programmable-secrets-robinhood`
- Arbitrum query endpoint: `https://ps-subgraph.hol.org/subgraphs/name/programmable-secrets-arbitrum`

DNS record for the new subgraph host:
- Host: `ps-subgraph.hol.org`
- Target ingress IP: `134.199.242.153`
- Record type: `A`

Quick query verification:

```bash
node -e "fetch('https://ps-subgraph.hol.org/subgraphs/name/programmable-secrets-robinhood',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{ _meta { block { number } } datasets(first:1){id datasetId} }'})}).then(async r=>{console.log(r.status);console.log(await r.text());});"
```

## Product Story

- Primary chain path: Robinhood Chain testnet for the core financial data marketplace flow.
- Secondary chain path: Arbitrum Sepolia for ERC-8004 / UAID-gated policy validation.
- The frontend demonstrates purchase and unlock UX while the contract deployments and manifests remain the source of truth for addresses and policy semantics.
- Providers can now choose whether a policy mints buyer-bound receipts or transferable receipts. That flag is stored in policy metadata, persisted in the app database, and confirmed against the onchain `PolicyCreated` state before the policy is finalized.

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
