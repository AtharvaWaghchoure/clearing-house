// Agent-callable MCP server exposing the independent verifier. An AI agent (or any MCP client) can
// ask "was trade 412 actually compliant?" and get an answer derived from the chain — not from the
// venue's word. Reusable infrastructure: point CH_CONFIG at any deployment (anvil / Hedera / Arc).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DEFAULT_CONFIG, DEFAULT_LEDGER, loadDeployment, loadLedger } from './config.js';
import { ChainDataSource } from './datasource/chain.js';
import { audit, verifyTrade } from './verify.js';

const CONFIG = process.env.CH_CONFIG ?? DEFAULT_CONFIG;
const LEDGER = process.env.CH_LEDGER ?? DEFAULT_LEDGER;

function dataSource() {
  const d = loadDeployment(CONFIG);
  return new ChainDataSource({
    rpcUrl: d.rpcUrl,
    engine: d.engine,
    tokens: [d.bondToken, d.cashToken],
    fromBlock: BigInt(d.fromBlock),
    label: 'mcp',
  });
}

const json = (o: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }],
});

const server = new McpServer({ name: 'clearing-house-verifier', version: '0.1.0' });

server.registerTool(
  'audit_venue',
  {
    description:
      "Independently reconcile the venue's settlement report against on-chain SettlementReceipts and compliance events. Flags any FABRICATED, HIDDEN, MISREPORTED, or NONCOMPLIANT trade. Shares no code with the venue.",
    inputSchema: {},
  },
  async () => json(await audit(dataSource(), loadLedger(LEDGER))),
);

server.registerTool(
  'verify_trade',
  {
    description:
      'Verify a single trade id against the chain. Returns CONFIRMED_COMPLIANT or a critical finding with evidence (block, reasons).',
    inputSchema: { tradeId: z.string().describe('bytes32 trade id, e.g. 0x0000…0001') },
  },
  async ({ tradeId }) => json(await verifyTrade(dataSource(), loadLedger(LEDGER), tradeId as `0x${string}`)),
);

server.registerTool(
  'list_settlements',
  {
    description:
      'List every settlement the venue actually cleared on-chain (ground truth), independent of what the venue reports.',
    inputSchema: {},
  },
  async () => json(await dataSource().getSettlements()),
);

await server.connect(new StdioServerTransport());
