// Durable, shared state for the venue: the order book and the onboarding abuse-guard ledger.
//
// Two backends behind one interface. When REDIS_URL is set we use Redis — state that survives
// restarts and is shared across instances, which is exactly what a deployed, multi-user venue needs
// (a fresh lambda / a redeploy must see the same book and the same rate-limit ledger). When it is
// unset we fall back to an in-memory globalThis store, so local `next dev` needs zero setup and
// behaves as before. Selection is by env at process start; the two backends are behaviourally
// identical from the routes' point of view.
//
// Everything is async because the Redis path is. Server-only — never import from a client component.

import type { Address } from '../types';
import { requireServerEnv, serverEnv } from './env';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/store is server-only and must never be bundled to the client');
}

export type Side = 'bid' | 'ask';

export interface RestingOrder {
  id: string;
  side: Side;
  account: Address;
  /** Whole cash units (USDC) per bond unit. */
  price: number;
  /** Bond units. */
  quantity: number;
  /** The ATS hold id the placer created (stringified bigint): a bond hold for an ask, cash for a bid. */
  holdId: string;
  createdAt: number;
}

/** The state a deployed venue must keep durably: the resting book, and the per-window onboarding
 *  ledger the faucet circuit-breaker reads. */
interface Backend {
  // --- order book ---
  listOrders(): Promise<RestingOrder[]>;
  getOrder(id: string): Promise<RestingOrder | undefined>;
  addOrder(o: Omit<RestingOrder, 'id' | 'createdAt'>, now: number): Promise<RestingOrder>;
  removeOrder(id: string): Promise<boolean>;
  // --- onboarding abuse guard ---
  getCooldown(who: string): Promise<number | undefined>;
  setCooldown(who: string, now: number, ttlMs: number): Promise<void>;
  /** Count of onboards and total HBAR (wei) dripped within the trailing `windowMs`, pruning older. */
  windowOnboards(now: number, windowMs: number): Promise<{ count: number; drippedWei: bigint }>;
  pushOnboard(now: number, drippedWei: bigint, windowMs: number): Promise<void>;
}

// --- in-memory backend (local dev; pinned on globalThis so every route bundle shares one copy and
// it survives hot-reload). Not durable across restarts or instances — that is what Redis is for.
interface MemState {
  orders: Map<string, RestingOrder>;
  seq: number;
  cooldown: Map<string, number>;
  log: { t: number; drippedWei: bigint }[];
}
const g = globalThis as unknown as { __venueMem?: MemState };
function mem(): MemState {
  return (g.__venueMem ??= { orders: new Map(), seq: 0, cooldown: new Map(), log: [] });
}

const memBackend: Backend = {
  async listOrders() {
    return [...mem().orders.values()].sort((a, b) => a.createdAt - b.createdAt);
  },
  async getOrder(id) {
    return mem().orders.get(id);
  },
  async addOrder(o, now) {
    const m = mem();
    const order: RestingOrder = { ...o, id: `o${++m.seq}`, createdAt: now };
    m.orders.set(order.id, order);
    return order;
  },
  async removeOrder(id) {
    return mem().orders.delete(id);
  },
  async getCooldown(who) {
    return mem().cooldown.get(who);
  },
  async setCooldown(who, now) {
    mem().cooldown.set(who, now);
  },
  async windowOnboards(now, windowMs) {
    const log = mem().log;
    while (log.length > 0 && now - log[0].t > windowMs) log.shift();
    return { count: log.length, drippedWei: log.reduce((s, e) => s + e.drippedWei, 0n) };
  },
  async pushOnboard(now, drippedWei) {
    mem().log.push({ t: now, drippedWei });
  },
};

// --- Redis backend (deploy). Keys:
//   venue:orders          hash  id -> JSON(order)
//   venue:seq             int   order-id counter
//   venue:cd:{who}        str   last-onboard ts, PX = cooldown (auto-expiring)
//   venue:onboardlog      zset  score = ts, member = "{uid}:{drippedWei}"  (uid keeps members unique)
//   venue:onboardlog:seq  int   uid counter for the zset
type RedisClient = import('ioredis').Redis;
let client: RedisClient | undefined;
async function redis(): Promise<RedisClient> {
  if (!client) {
    const { default: Redis } = await import('ioredis');
    client = new Redis(requireServerEnv('REDIS_URL'), { maxRetriesPerRequest: 5 });
  }
  return client;
}

const ORDERS = 'venue:orders';
const LOG = 'venue:onboardlog';

const redisBackend: Backend = {
  async listOrders() {
    const all = await (await redis()).hgetall(ORDERS);
    return Object.values(all)
      .map((s) => JSON.parse(s) as RestingOrder)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
  async getOrder(id) {
    const s = await (await redis()).hget(ORDERS, id);
    return s ? (JSON.parse(s) as RestingOrder) : undefined;
  },
  async addOrder(o, now) {
    const r = await redis();
    const n = await r.incr('venue:seq');
    const order: RestingOrder = { ...o, id: `o${n}`, createdAt: now };
    await r.hset(ORDERS, order.id, JSON.stringify(order));
    return order;
  },
  async removeOrder(id) {
    return (await (await redis()).hdel(ORDERS, id)) > 0;
  },
  async getCooldown(who) {
    const v = await (await redis()).get(`venue:cd:${who}`);
    return v ? Number(v) : undefined;
  },
  async setCooldown(who, now, ttlMs) {
    await (await redis()).set(`venue:cd:${who}`, String(now), 'PX', ttlMs);
  },
  async windowOnboards(now, windowMs) {
    const r = await redis();
    const min = now - windowMs;
    await r.zremrangebyscore(LOG, 0, min);
    const members = await r.zrangebyscore(LOG, min, '+inf');
    let drippedWei = 0n;
    for (const m of members) drippedWei += BigInt(m.slice(m.indexOf(':') + 1));
    return { count: members.length, drippedWei };
  },
  async pushOnboard(now, drippedWei, windowMs) {
    const r = await redis();
    const uid = await r.incr(`${LOG}:seq`);
    await r.zadd(LOG, now, `${uid}:${drippedWei.toString()}`);
    await r.zremrangebyscore(LOG, 0, now - windowMs);
  },
};

const usingRedis = !!serverEnv('REDIS_URL');
const active: Backend = usingRedis ? redisBackend : memBackend;
// One line at boot so the deploy operator can see which store is live.
console.log(`[venue] state backend: ${usingRedis ? 'redis (durable)' : 'in-memory (dev only)'}`);

// --- book ---
export const listOrders = (): Promise<RestingOrder[]> => active.listOrders();
export const getOrder = (id: string): Promise<RestingOrder | undefined> => active.getOrder(id);
export const addOrder = (o: Omit<RestingOrder, 'id' | 'createdAt'>, now = Date.now()): Promise<RestingOrder> =>
  active.addOrder(o, now);
export const removeOrder = (id: string): Promise<boolean> => active.removeOrder(id);

// --- onboarding abuse guard ---
export const getCooldown = (who: string): Promise<number | undefined> => active.getCooldown(who.toLowerCase());
export const setCooldown = (who: string, now: number, ttlMs: number): Promise<void> =>
  active.setCooldown(who.toLowerCase(), now, ttlMs);
export const windowOnboards = (now: number, windowMs: number): Promise<{ count: number; drippedWei: bigint }> =>
  active.windowOnboards(now, windowMs);
export const pushOnboard = (now: number, drippedWei: bigint, windowMs: number): Promise<void> =>
  active.pushOnboard(now, drippedWei, windowMs);
