// x402-gated NAV endpoint. GET /nav returns HTTP 402 with the payment terms; once the caller pays
// (X-PAYMENT header), the resource server verifies + settles the payment through the Blocky402
// facilitator on Hedera testnet, then returns the live NAV.

import express from 'express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { computeNav } from './nav.js';

const PORT = Number(process.env.PORT ?? 4021);
const NETWORK = 'hedera:testnet';
const ASSET = process.env.NAV_ASSET ?? '0.0.0'; // HBAR
const PAY_TO = process.env.NAV_PAY_TO ?? '0.0.10417883'; // the venue's receivable account
const FEE_PAYER = process.env.NAV_FEE_PAYER ?? '0.0.7162784'; // Blocky402 sponsors gas
const PRICE = process.env.NAV_PRICE ?? '10000000'; // 0.1 HBAR (tinybar)
const FACILITATOR = process.env.BLOCKY402_URL ?? 'https://api.testnet.blocky402.com';

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });

/** The x402 v2 payment terms for the NAV resource (matched to the Blocky402 hedera:testnet schema). */
function requirements(resource: string) {
  return {
    scheme: 'exact',
    network: NETWORK,
    amount: PRICE,
    payTo: PAY_TO,
    asset: ASSET,
    maxTimeoutSeconds: 120,
    resource,
    description: 'CLEARING HOUSE — NAV of the HELVETIA 4.25% 15FEB2031 bond',
    mimeType: 'application/json',
    extra: { feePayer: FEE_PAYER },
  };
}

const app = express();

app.get('/', (_req, res) =>
  res.json({ service: 'CLEARING HOUSE · NAV (x402)', endpoint: 'GET /nav', network: NETWORK, facilitator: FACILITATOR }),
);

app.get('/nav', async (req, res) => {
  const resource = `http://localhost:${PORT}/nav`;
  const reqs = requirements(resource);
  const header = req.header('X-PAYMENT') ?? req.header('PAYMENT-SIGNATURE');

  // No payment yet → 402. x402 v2 clients read the terms from the PAYMENT-REQUIRED header; the JSON
  // body is the human-readable mirror.
  if (!header) {
    const paymentRequired = { x402Version: 2, accepts: [reqs] };
    res.setHeader('PAYMENT-REQUIRED', encodePaymentRequiredHeader(paymentRequired as never));
    return res.status(402).json({ ...paymentRequired, error: 'payment required' });
  }

  try {
    const payload = decodePaymentSignatureHeader(header);

    const verify = await facilitator.verify(payload, reqs as never);
    if (!verify.isValid) {
      return res.status(402).json({ x402Version: 2, accepts: [reqs], error: verify.invalidReason ?? 'payment invalid' });
    }

    const settle = await facilitator.settle(payload, reqs as never);
    if (!settle.success) {
      return res.status(502).json({ error: 'settlement failed', reason: settle.errorReason, message: settle.errorMessage });
    }

    res.setHeader('X-PAYMENT-RESPONSE', encodePaymentResponseHeader(settle));
    const nav = await computeNav(new Date().toISOString());
    return res.status(200).json({
      ...nav,
      paid: { tx: settle.transaction, payer: settle.payer, network: settle.network, asset: ASSET, amount: PRICE },
    });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  CLEARING HOUSE · NAV x402 service`);
  console.log(`  http://localhost:${PORT}/nav   (402 → pay ${PRICE} tinybar HBAR to ${PAY_TO})`);
  console.log(`  facilitator: ${FACILITATOR}  ·  fee payer ${FEE_PAYER}\n`);
});
