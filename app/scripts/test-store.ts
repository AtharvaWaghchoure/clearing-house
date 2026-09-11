// Exercises the durable-store contract — the order book AND the onboarding abuse-guard ledger — end
// to end, with no chain gas. Selects the backend the same way the app does: REDIS_URL set -> Redis
// (durable); unset -> in-memory. Run against a THROWAWAY Redis (it writes venue:* keys):
//   REDIS_URL=redis://127.0.0.1:6379 ../verifier/node_modules/.bin/tsx scripts/test-store.ts
// or with no REDIS_URL to check the in-memory fallback contract.
import type { Address } from '../lib/types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok · ${msg}`);
}

async function main() {
  // Import after env is read so the backend selection sees REDIS_URL.
  const store = await import('../lib/server/store');
  const A: Address = '0x1111111111111111111111111111111111111111';
  const B: Address = '0x2222222222222222222222222222222222222222';
  const now = Date.now();

  console.log(`store backend: ${process.env.REDIS_URL ? 'redis' : 'memory'}`);

  // --- order book ---
  const bid = await store.addOrder({ side: 'bid', account: A, price: 100, quantity: 5, holdId: '11' }, now);
  const ask = await store.addOrder({ side: 'ask', account: B, price: 99, quantity: 5, holdId: '22' }, now + 1);
  assert(bid.id !== ask.id, 'order ids are unique');
  const list = await store.listOrders();
  assert(list.some((o) => o.id === bid.id) && list.some((o) => o.id === ask.id), 'both orders resting');
  assert((await store.getOrder(bid.id))?.holdId === '11', 'getOrder returns the placed hold');
  assert(await store.removeOrder(bid.id), 'removeOrder reports deletion');
  assert(!(await store.getOrder(bid.id)), 'removed order is gone');
  await store.removeOrder(ask.id);

  // --- onboarding abuse guard ---
  const who = '0x33333333333333333333333333333333333cafe0';
  const HOUR = 60 * 60 * 1000;
  const DRIP = 5n * 10n ** 18n;
  assert((await store.getCooldown(who)) === undefined, 'no cooldown before onboarding');
  await store.setCooldown(who, now, 60_000);
  assert((await store.getCooldown(who)) === now, 'cooldown persisted');

  const before = await store.windowOnboards(now, HOUR);
  await store.pushOnboard(now, DRIP, HOUR);
  const after = await store.windowOnboards(now, HOUR);
  assert(after.count === before.count + 1, 'onboard counted in the window');
  assert(after.drippedWei === before.drippedWei + DRIP, 'dripped HBAR summed in the window');
  // entries older than the window are pruned
  const empty = await store.windowOnboards(now + HOUR + 1, HOUR);
  assert(empty.count === 0, 'stale onboards pruned from the window');

  console.log('store contract OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
