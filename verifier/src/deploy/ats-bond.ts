// Issue a compliant bond through the live Hedera ATS Factory (0.0.9213391).
//
// Field values mirror the ATS repo's working fixtures (test/fixtures/tokens/{bond,common}.fixture.ts):
// resolver = the reused BLR, config key BOND_CONFIG_ID version 1, REG_S/NONE, clearingActive=false (so
// holds work), internal KYC on. Simulate first (predicts the diamond address, surfaces a revert before
// spending gas), then deploy.
//
// Run:  pnpm --filter @clearing-house/verifier exec tsx src/deploy/ats-bond.ts

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Abi, type Log, createPublicClient, createWalletClient, decodeEventLog, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hederaTestnet } from 'viem/chains';
import { loadArtifact } from '../abi.js';
import type { Address, Hex } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../');
const LOCAL = resolve(here, '../../.local');

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const DEFAULT_ADMIN_ROLE = `0x${'0'.repeat(64)}` as Hex;
const BOND_CONFIG_ID = `0x${'0'.repeat(63)}2` as Hex; // 0x…0002
const MAX_UINT256 = 2n ** 256n - 1n;

const ctUrl = (a: string) => `https://hashscan.io/testnet/contract/${a}`;
const txUrl = (h: string) => `https://hashscan.io/testnet/transaction/${h}`;

function loadEnv() {
  const path = `${ROOT}/.env`;
  if (!existsSync(path)) throw new Error(`no .env at ${path}`);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    if (!(t.slice(0, eq).trim() in process.env)) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

// Read + validate the deploy env before we build any client or spend gas.
function requireEnv() {
  const RPC = process.env.HEDERA_RPC ?? 'https://testnet.hashio.io/api';
  const OP_KEY = process.env.HEDERA_OPERATOR_KEY as Hex;
  const FACTORY = process.env.ATS_FACTORY_EVM as Address;
  const BLR = process.env.ATS_BLR_EVM as Address;
  if (!/^0x[0-9a-fA-F]{64}$/.test(OP_KEY ?? '')) throw new Error('HEDERA_OPERATOR_KEY missing/invalid');
  if (!FACTORY || !BLR) throw new Error('ATS_FACTORY_EVM / ATS_BLR_EVM missing in .env');
  return { RPC, OP_KEY, FACTORY, BLR };
}

// The deployBond payload — values mirror the ATS repo's own working fixtures (see file header).
// No branches: it's a data literal parameterised by the operator (admin + rbac) and issuance time.
function buildBond(operatorAddress: Address, blr: Address, now: bigint) {
  const YEAR = 31_536_000n;
  const bondData = {
    security: {
      resolver: blr,
      maxSupply: MAX_UINT256,
      resolverProxyConfiguration: { key: BOND_CONFIG_ID, version: 1n },
      erc20MetadataInfo: { name: 'HELVETIA 4.25% 15FEB2031', symbol: 'HELV31', isin: 'US0378331005', decimals: 6 },
      rbacs: [{ role: DEFAULT_ADMIN_ROLE, members: [operatorAddress] }],
      externalPauses: [] as Address[],
      externalControlLists: [] as Address[],
      externalKycLists: [] as Address[],
      compliance: ZERO,
      identityRegistry: ZERO,
      arePartitionsProtected: false,
      isMultiPartition: false,
      isControllable: true,
      isWhiteList: false,
      clearingActive: false, // holds require clearing disabled
      internalKycActivated: true,
      erc20VotesActivated: false,
    },
    bondDetails: {
      currency: '0x555344' as Hex, // "USD"
      nominalValue: 100n,
      nominalValueDecimals: 2,
      startingDate: now + 3600n,
      maturityDate: now + 3600n + 6n * YEAR,
    },
    proceedRecipients: [] as Address[],
    proceedRecipientsData: [] as Hex[],
  };
  const regulation = {
    regulationType: 1, // REG_S
    regulationSubType: 0, // NONE
    additionalSecurityData: {
      countriesControlListType: true,
      listOfCountries: 'US,GB,CH',
      info: 'CLEARING HOUSE — demo bond issued via ATS Factory',
    },
  };
  return { bondData, regulation };
}

// Pull the deployed diamond address out of the BondDeployed event, falling back to the simulated
// prediction if the event isn't present (the address is deterministic, so the two agree).
function bondAddressFromLogs(logs: Log[], abi: Abi, fallback: Address): Address {
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (d.eventName === 'BondDeployed') {
        return ((d.args as unknown as Record<string, unknown>).bondAddress as Address) ?? fallback;
      }
    } catch {
      /* not our event */
    }
  }
  return fallback;
}

async function main() {
  loadEnv();
  const { RPC, OP_KEY, FACTORY, BLR } = requireEnv();

  const pub = createPublicClient({ chain: hederaTestnet, transport: http(RPC) });
  const operator = privateKeyToAccount(OP_KEY);
  const wallet = createWalletClient({ account: operator, chain: hederaTestnet, transport: http(RPC) });
  const Factory = loadArtifact('IATSFactory');

  const now = BigInt(Math.floor(Date.now() / 1000));
  const { bondData, regulation } = buildBond(operator.address, BLR, now);

  console.log(`\n▍ Issuing a bond via the real ATS Factory ${FACTORY}\n`);
  console.log(`  operator ${operator.address}`);
  console.log(`  resolver(BLR) ${BLR}  ·  config ${BOND_CONFIG_ID.slice(0, 6)}…02 v1  ·  REG_S`);

  // simulate: validate the call + predict the diamond address without spending gas
  let predicted: Address;
  try {
    const sim = await pub.simulateContract({
      account: operator,
      address: FACTORY,
      abi: Factory.abi as Abi,
      functionName: 'deployBond',
      args: [bondData, regulation],
      gas: 10_000_000n,
    });
    predicted = sim.result as Address;
    console.log(`  ✓ simulate ok — predicted bond diamond ${predicted}`);
  } catch (e) {
    console.error(`\n✗ simulate reverted — not sending. Reason:\n${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  console.log(`  deploying…`);
  const hash = await wallet.writeContract({
    address: FACTORY,
    abi: Factory.abi as Abi,
    functionName: 'deployBond',
    args: [bondData, regulation],
    gas: 10_000_000n,
  });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 180_000, pollingInterval: 2_000 });
  if (rc.status !== 'success') throw new Error(`deployBond reverted on-chain (${txUrl(hash)})`);

  const bond = bondAddressFromLogs(rc.logs, Factory.abi as Abi, predicted);

  mkdirSync(LOCAL, { recursive: true });
  const out = {
    network: 'hedera-testnet',
    factory: FACTORY,
    resolver: BLR,
    bond,
    isin: 'US0378331005',
    tx: hash,
    hashscan: { bond: ctUrl(bond), tx: txUrl(hash) },
  };
  writeFileSync(`${LOCAL}/ats-bond.json`, JSON.stringify(out, null, 2));

  console.log(`\n▍ Bond issued via ATS Factory ✓`);
  console.log(`  bond diamond ${bond}`);
  console.log(`  ${ctUrl(bond)}`);
  console.log(`  tx ${txUrl(hash)}`);
  console.log(`  saved → verifier/.local/ats-bond.json\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
