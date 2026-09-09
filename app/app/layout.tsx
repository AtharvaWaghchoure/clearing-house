import type { Metadata } from 'next';
import { Instrument_Serif, Martian_Mono } from 'next/font/google';
import './globals.css';

// Display serif for nameplates; the monospace below carries the data grid.
const serif = Instrument_Serif({
  weight: ['400'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const mono = Martian_Mono({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CLEARING HOUSE · atomic compliant settlement',
  description:
    'A tokenised-bond settlement venue where delivery and payment clear in one atomic transaction, compliance checked inside it, provable from an index the venue does not control.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
