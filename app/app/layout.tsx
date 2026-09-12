import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Two families, told apart by WIDTH rather than by the usual serif/mono split. Archivo is a
// variable grotesque with a real `wdth` axis, so nameplates run expanded and UI text runs normal —
// one voice, two tempos. Plex Mono is reserved strictly for figures: prices, balances, block
// numbers, hashes. Nothing narrative is ever set in mono.
const sans = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Clearing House — atomic compliant settlement',
  description:
    'A tokenised-bond settlement venue where delivery and payment clear in one atomic transaction, compliance checked inside it, provable from an index the venue does not control.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
