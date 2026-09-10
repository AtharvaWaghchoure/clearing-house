// The full "any user" proof: a brand-new empty wallet is onboarded by the venue (gas + KYC + tokens),
// then signs its OWN hold paying gas from the dripped HBAR. No portal faucet, no pre-funding.
import { createWalletClient, formatEther, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { atsAbi } from '../lib/abi';
import { VENUE, hederaTestnet, publicClient } from '../lib/chain';
import { balanceOf } from '../lib/onchain';
import { fundHbar, mint, setVerified } from '../lib/server/operator';
import type { Address, Hex } from '../lib/types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

async function main() {
  const user = privateKeyToAccount(generatePrivateKey());
  console.log('fresh empty wallet:', user.address);

  // venue onboards it — operator-signed: gas, then KYC + tokens
  await fundHbar(user.address, '5');
  await setVerified(VENUE.bondToken, user.address);
  await setVerified(VENUE.cashToken, user.address);
  await mint(VENUE.bondToken, user.address, 1000n);
  console.log(
    'after onboard → HBAR:',
    formatEther(await publicClient.getBalance({ address: user.address })),
    '· bond:',
    (await balanceOf(VENUE.bondToken, user.address)).toString(),
  );

  // the USER signs their own hold, paying gas from the dripped HBAR
  const userWallet = createWalletClient({ account: user, chain: hederaTestnet, transport: http() });
  const hold = { amount: 10n, expirationTimestamp: 0n, escrow: VENUE.holdLeg, to: ZERO, data: '0x' as Hex };
  const { result } = await publicClient.simulateContract({ account: user, address: VENUE.bondToken, abi: atsAbi, functionName: 'createHoldByPartition', args: [VENUE.partition, hold] });
  const holdId = (result as readonly [boolean, bigint])[1];
  const hash = await userWallet.writeContract({ account: user, chain: hederaTestnet, address: VENUE.bondToken, abi: atsAbi, functionName: 'createHoldByPartition', args: [VENUE.partition, hold] });
  await publicClient.waitForTransactionReceipt({ hash });

  console.log(`user signed hold ${holdId} from own wallet · free bond now:`, (await balanceOf(VENUE.bondToken, user.address)).toString());
  console.log('HBAR left after paying gas:', formatEther(await publicClient.getBalance({ address: user.address })));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
