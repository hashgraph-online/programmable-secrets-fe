export const AGENT_SKILL_VERSION = '1.0.4';

export const AGENT_SKILL_FILE_URL = `https://hol.org/registry/api/v1/skills/programmable-secrets%40${AGENT_SKILL_VERSION}/SKILL.md`;
export const AGENT_LATEST_SKILL_FILE_URL = 'https://hol.org/registry/api/v1/skills/programmable-secrets%40latest/SKILL.md';

export const AGENT_INSTALL_PROMPT = `Use the published programmable-secrets skill as the source of truth. Stay in the CLI flow and avoid repo exploration unless a command fails.

Goal: resolve the latest programmable-secrets skill URL and tell me the exact next command to run.

Run these commands in order:
1. npx skill-publish install-url --name programmable-secrets --version 1.0.4 --format latest-skill-md
2. npx @hol-org/registry skills get --name programmable-secrets --version 1.0.4 --json
3. npx programmable-secret help

When you're done, report:
- skill_url
- published_version
- exact_next_command
- one_sentence_reason

If any command fails, stop there and report the exact failing command plus stderr.`;

export const AGENT_PUBLISH_PROMPT = `Use the published skill and keep this as a straight CLI publish flow. Avoid repo exploration unless a command fails.

Goal: publish a TSLA buy signal on Robinhood testnet and create a 24 hour access policy priced at exactly 0.00001 ETH.

Run these commands in order:
1. npx skill-publish install-url --name programmable-secrets --version 1.0.4 --format latest-skill-md
2. npx programmable-secret doctor
3. npx programmable-secret krs encrypt --plaintext '{"signal":"buy","market":"TSLA","confidence":"high","thesis":"Breakout continuation"}' --title "TSLA buy signal" --provider-uaid 'uaid:did:pkh:eip155:46630:0x1111111111111111111111111111111111111111;nativeId=eip155:46630:0x1111111111111111111111111111111111111111' --output ./tsla-buy-signal-bundle.json
4. npx programmable-secret datasets register --wallet provider --register-provider-agent true --provider-uaid-require-erc8004 false --bundle-file ./tsla-buy-signal-bundle.json
5. Parse the dataset id from the previous command output.
6. npx programmable-secret policies create-timebound --wallet provider --dataset-id <dataset-id> --price-eth 0.00001 --duration-hours 24 --receipt-transferable false --metadata-json '{"title":"TSLA buy signal 24 hour access"}'
7. Parse the policy id from the previous command output.
8. npx programmable-secret datasets get --dataset-id <dataset-id> --json
9. npx programmable-secret policies get --policy-id <policy-id> --json

When you're done, report:
- skill_url
- dataset_id
- policy_id
- price_eth
- bundle_file
- dataset_json
- policy_json

Guidance:
- Keep Robinhood as the default chain for this run.
- Use 0.00001 ETH for this example price.
- If doctor reports missing prerequisites, stop there and list them.
- If any write command fails, report the command and stderr instead of guessing a workaround.`;

export const AGENT_FLOW_PROMPT = `Use the published skill and run the built-in CLI golden path. Stay in the CLI flow unless a command fails.

Goal: prove the full Robinhood marketplace flow with the built-in golden path.

Run these commands in order:
1. npx skill-publish install-url --name programmable-secrets --version 1.0.4 --format latest-skill-md
2. npx programmable-secret doctor
3. npx programmable-secret flow:direct

When you're done, report:
- skill_url
- dataset_id
- policy_id
- receipt_id
- bundle_file
- buyer_wallet

If doctor reports missing prerequisites, stop there and list them. If flow:direct fails, report the exact failing command plus stderr.`;
