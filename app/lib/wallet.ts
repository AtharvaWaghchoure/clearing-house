'use client';

// Injected-wallet connection for Hedera testnet (MetaMask / HashPack EVM), via viem — no wallet
// library, no extra deps. Reads use the public relay (see chain.ts); writes are signed here by the
// user's own key. The operator key never touches the browser.

import { useCallback, useEffect, useState } from 'react';
import { type WalletClient, createWalletClient, custom } from 'viem';
import { hederaTestnet } from './chain';
import type { Address } from './types';

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

function injected(): Eip1193 | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

const CHAIN_HEX = '0x128'; // 296

export interface Wallet {
  address?: Address;
  chainId?: number;
  connecting: boolean;
  hasProvider: boolean;
  onRightChain: boolean;
  connect(): Promise<void>;
  switchChain(): Promise<void>;
  disconnect(): void;
  /** A viem WalletClient bound to the connected account, or undefined if not connected. */
  walletClient(): WalletClient | undefined;
}

export function useWallet(): Wallet {
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);

  useEffect(() => {
    const p = injected();
    setHasProvider(!!p);
    if (!p) return;
    p.request({ method: 'eth_accounts' })
      .then((a) => setAddress(((a as string[])[0] as Address) ?? undefined))
      .catch(() => {});
    p.request({ method: 'eth_chainId' })
      .then((c) => setChainId(Number(c)))
      .catch(() => {});
    const onAcc = (...a: unknown[]) => setAddress(((a[0] as string[])[0] as Address) ?? undefined);
    const onChain = (...c: unknown[]) => setChainId(Number(c[0]));
    p.on?.('accountsChanged', onAcc);
    p.on?.('chainChanged', onChain);
    return () => {
      p.removeListener?.('accountsChanged', onAcc);
      p.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const switchChain = useCallback(async () => {
    const p = injected();
    if (!p) return;
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if ((e as { code?: number })?.code === 4902) {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: CHAIN_HEX,
              chainName: 'Hedera Testnet',
              nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
              rpcUrls: ['https://testnet.hashio.io/api'],
              blockExplorerUrls: ['https://hashscan.io/testnet'],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const p = injected();
    if (!p) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      setAddress((accounts[0] as Address) ?? undefined);
      const c = Number(await p.request({ method: 'eth_chainId' }));
      setChainId(c);
      if (c !== 296) await switchChain();
    } finally {
      setConnecting(false);
    }
  }, [switchChain]);

  const disconnect = useCallback(() => setAddress(undefined), []);

  const walletClient = useCallback((): WalletClient | undefined => {
    const p = injected();
    if (!p || !address) return undefined;
    return createWalletClient({ account: address, chain: hederaTestnet, transport: custom(p) });
  }, [address]);

  return {
    address,
    chainId,
    connecting,
    hasProvider,
    onRightChain: chainId === 296,
    connect,
    switchChain,
    disconnect,
    walletClient,
  };
}
