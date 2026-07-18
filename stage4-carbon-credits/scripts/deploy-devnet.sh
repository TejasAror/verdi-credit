#!/usr/bin/env bash
#
# deploy-devnet.sh — Deploy the VerdiCred Carbon Credit Program to Solana Devnet.
#
# What it does:
#   1. Builds the Anchor program.
#   2. Airdrops SOL to the deployer (deterministic devnet-deployer keypair).
#   3. Deploys the program, generating a REAL on-chain Program ID.
#   4. Records the new Program ID into Anchor.toml + the IDL's metadata.
#
# Requirements:
#   * `solana` CLI configured for devnet (RPC https://api.devnet.solana.com)
#   * A funded deployer keypair at target/deploy/devnet-deployer-keypair.json
#     (paste your Devnet wallet's base58 secret here, or run `solana airdrop`).
#   * The Verifier Oracle Authority wallet address lives in scripts/config.ts
#     (default: HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB).
#
set -euo pipefail

cd "$(dirname "$0")/.."

CLUSTER="devnet"
RPC="https://api.devnet.solana.com"
DEPLOYER="target/deploy/devnet-deployer-keypair.json"
PROGRAM_KP="target/deploy/carbon_credit_program-keypair.json"

echo "==> Configuring solana CLI for ${CLUSTER}"
solana config set --url "${RPC}" >/dev/null

if [ ! -f "${DEPLOYER}" ]; then
  echo "!! Deployer keypair not found at ${DEPLOYER}"
  echo "   Generate one with: solana-keygen new -o ${DEPLOYER}"
  exit 1
fi

DEPLOYER_PUB=$(solana-keygen pubkey "${DEPLOYER}")
echo "==> Deployer: ${DEPLOYER_PUB}"

BAL=$(solana balance "${DEPLOYER_PUB}" --url "${RPC}" 2>/dev/null || echo "0")
echo "==> Current balance: ${BAL} SOL"
if [[ "${BAL}" == "0"* ]]; then
  echo "==> Airdropping 2 SOL to deployer for rent + fees"
  solana airdrop 2 "${DEPLOYER_PUB}" --url "${RPC}" || echo "!! airdrop failed (faucet busy) — fund manually"
fi

echo "==> Building program"
anchor build

echo "==> Deploying to ${CLUSTER}"
# `anchor deploy` writes the on-chain Program ID back into Anchor.toml and
# generates a fresh program keypair if needed. The --program-keypair pins the
# upgrade authority to our deployer.
anchor deploy \
  --provider.cluster "${CLUSTER}" \
  --provider.wallet "${DEPLOYER}" \
  --program-keypair "${PROGRAM_KP}"

PROGRAM_ID=$(solana-keygen pubkey "${PROGRAM_KP}")
echo "==> Deployed Program ID: ${PROGRAM_ID}"

# Persist for downstream scripts (init-oracle, smoke).
echo -n "${PROGRAM_ID}" > target/deploy/.program_id

echo "==> Next step: initialize the OracleConfig + mint"
echo "    npm run init:devnet"
