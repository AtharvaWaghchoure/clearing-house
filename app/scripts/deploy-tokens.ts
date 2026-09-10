// Deploy two fresh MockATS tokens (bond + cash) that support releaseHoldByPartition, from the
// operator, on Hedera testnet. Keeps the existing engine + leg (they are token-agnostic). Prints the
// new addresses + deploy block to paste into lib/chain.ts. Run with tsx from app/.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Abi, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hederaTestnet, publicClient } from '../lib/chain';
import type { Hex } from '../lib/types';

function operatorKey(): Hex {
  for (const line of readFileSync(resolve(process.cwd(), '../.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('HEDERA_OPERATOR_KEY')) {
      const k = t.slice(t.indexOf('=') + 1).trim();
      return (k.startsWith('0x') ? k : `0x${k}`) as Hex;
    }
  }
  throw new Error('no HEDERA_OPERATOR_KEY');
}

function artifact() {
  const p = resolve(process.cwd(), '../contracts/out/MockATSSecurity.sol/MockATSSecurity.json');
  const j = JSON.parse(readFileSync(p, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

async function main() {
  const op = privateKeyToAccount(operatorKey());
  const wallet = createWalletClient({ account: op, chain: hederaTestnet, transport: http() });
  const { abi, bytecode } = artifact();

  const deploy = async (name: string) => {
    const hash = await wallet.deployContract({ abi, bytecode, args: [name], account: op, chain: hederaTestnet });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    if (!rc.contractAddress) throw new Error(`deploy failed for ${name}`);
    return rc.contractAddress;
  };

  const fromBlock = await publicClient.getBlockNumber();
  const bond = await deploy('HELVETIA 4.25% 15FEB2031');
  const cash = await deploy('USD Deposit Token');

  console.log('\n// paste into lib/chain.ts VENUE:');
  console.log(`bondToken: '${bond}',`);
  console.log(`cashToken: '${cash}',`);
  console.log(`fromBlock: ${fromBlock},`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
