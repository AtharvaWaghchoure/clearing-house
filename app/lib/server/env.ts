// Server-only env access. In dev the operator secrets live in the repo-root .env (shared with the
// verifier); in prod they come from the deployment environment. We only backfill what's missing, so
// process.env / real deploy env always wins. NEVER import this from a client component.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let backfilled = false;

function backfillFromRootEnv(): void {
  if (backfilled) return;
  backfilled = true;
  const path = resolve(process.cwd(), '../.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim();
  }
}

export function serverEnv(key: string): string | undefined {
  backfillFromRootEnv();
  return process.env[key];
}

export function requireServerEnv(key: string): string {
  const v = serverEnv(key);
  if (!v) throw new Error(`missing server env: ${key}`);
  return v;
}
