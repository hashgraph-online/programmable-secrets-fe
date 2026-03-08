# Programmable Secrets Frontend

Frontend for the Programmable Secrets marketplace, provider publishing flow, buyer unlock flow, and agent onboarding flow.

This repository is the web application layer for the Programmable Secrets stack. It is responsible for:
- marketplace and policy discovery UX
- provider-side staged publish flow
- buyer purchase, receipt, and unlock UX
- agent onboarding and `skill-publish` handoff
- local API routes for policy staging, indexing, nonce issuance, and key release

## Quick Navigation

- Contracts source of truth: [`hashgraph-online/programmable-secrets-contracts`](https://github.com/hashgraph-online/programmable-secrets-contracts)
- Frontend app routes: `src/app/`
- Runtime services: `src/lib/server/`
- Components: `src/components/`
- Deployment manifests: `deploy/k8s/`
- Operator scripts: `script/` and `scripts/`

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/app/` | Next.js App Router pages and API routes. |
| `src/components/` | Marketplace, provider, policy, navigation, and onboarding UI. |
| `src/lib/api/` | Browser-facing API clients. |
| `src/lib/contracts/` | Chain metadata, ABIs, and contract address helpers. |
| `src/lib/crypto/` | Buyer-side and provider-side crypto helpers for envelopes and payload handling. |
| `src/lib/server/` | Server-only policy, KRS, DB, indexing, and registry integration services. |
| `deploy/k8s/` | Kubernetes base and overlay manifests. |
| `script/` | Operator-oriented scripts for policy management and dataset publishing. |
| `scripts/` | Local/demo automation scripts for seeding and unlock testing. |
| `drizzle/` | SQL migrations and schema snapshots. |
| `public/` | Static assets. |

## System Integrations

The frontend depends on the broader Programmable Secrets stack:

| Repository | Role |
| --- | --- |
| [`hashgraph-online/programmable-secrets-contracts`](https://github.com/hashgraph-online/programmable-secrets-contracts) | Canonical contract ABIs, deployment manifests, and subgraph package. |
| [`hashgraph-online/programmable-secrets-skill`](https://github.com/hashgraph-online/programmable-secrets-skill) | Skill package linked from the `/agents` onboarding flow. |
| [`erc-8004/erc-8004-contracts`](https://github.com/erc-8004/erc-8004-contracts) | Upstream ERC-8004 identity registry contracts used for UAID-gated flows. |

For canonical addresses, always use the deployment manifests in `programmable-secrets-contracts` rather than copying values into frontend docs.

## Product Scope

- Primary chain path: Robinhood Chain testnet for the core data marketplace flow.
- Secondary chain path: Arbitrum Sepolia for ERC-8004 and UAID-gated policy validation.
- Providers can publish encrypted datasets and choose buyer-bound or transferable receipts.
- Buyers can purchase access, obtain a nonce, request a wrapped content key, and decrypt locally.
- Agents can onboard through the dedicated `/agents` surface and install supporting skill metadata.

## Route Map

- `/` marketplace and policy discovery
- `/provider` provider publishing flow
- `/policy/[id]` policy purchase, receipt, and unlock flow
- `/agents` agent and developer onboarding
- `/api/ps/*` programmable-secrets API endpoints used by the app runtime

## Environment Model

Required for meaningful local or deployed use:
- `DATABASE_URL` or `POSTGRES_URL`
- `KRS_MASTER_KEY`
- `CIPHERTEXT_STORAGE_ROOT`

Public/runtime config:
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_REGISTRY_ORIGIN`
- `REGISTRY_BROKER_API_URL`

Local/test script config:
- `API_BASE`
- `ETH_PK`
- `RPC_URL`
- `POLICY_VAULT_ADDRESS`
- `BROKER_URL`
- `API_KEY` or `API_KEYS`

Safe bootstrap:

```bash
cp .env.example .env.local
```

Notes:
- `KRS_MASTER_KEY` must be supplied explicitly. Do not rely on a checked-in or shared fallback.
- Operator scripts in `script/` and `scripts/` require explicit env vars and do not read sibling repositories.
- Deployment-specific hosts, ingress IPs, and secrets should stay outside tracked files.

## Local Development

Prerequisites:
- Node.js `>=20`
- pnpm `>=10`
- PostgreSQL if not using Docker Compose
- Wallet extension or WalletConnect-compatible wallet for purchase flows

Run locally:

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Optional local container stack:

```bash
docker compose up --build
```

## Verification

Primary checks:

```bash
pnpm run lint
pnpm run build
pnpm run start
```

Useful local scripts:

```bash
node script/manage-policies.mjs list
node script/publish-test-datasets.mjs
node scripts/seed-policies.mjs
node scripts/test-unlock.mjs <policy-id>
```

## Contracts and Data Sources

This frontend does not define canonical contract addresses in documentation.

Use:
- `https://github.com/hashgraph-online/programmable-secrets-contracts/blob/main/deployments/robinhood-testnet.json`
- `https://github.com/hashgraph-online/programmable-secrets-contracts/blob/main/deployments/arbitrum-sepolia.json`

The frontend runtime consumes:
- contract addresses and ABI-compatible interfaces
- indexed policy and purchase data
- staged provider records in Postgres
- ciphertext blobs from configured local or mounted storage

## Agent Install Flow

The `/agents` page is aligned with `skill-publish` install handoff patterns.

Pinned skill URL:

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

## Public Repo Guidance

Before publishing or syncing this repository publicly:
- do not commit real `KRS_MASTER_KEY`, wallet private keys, API keys, or kubeconfig files
- keep deployment-specific secret material in external secret management or untracked env files
- keep provider-specific infrastructure names and internal topology out of tracked docs where possible
- treat contract deployment manifests in the contracts repo as the source of truth instead of duplicating addresses here
- rotate any secret that was ever committed, even if history has been rewritten

## Common Failure Modes

- Wallet connected to the wrong chain for the flow being tested.
- Backend service unavailable on expected API routes.
- Missing runtime configuration in local or deployment environment.
- Policy exists but buyer does not satisfy runtime witness requirements.
- KRS is unconfigured, so provider prepare or buyer unlock flows fail.
