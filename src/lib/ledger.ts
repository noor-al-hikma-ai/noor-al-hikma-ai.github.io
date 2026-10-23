// Append-only, hash-chained audit ledger (W3C PROV-O flavoured). Each entry
// commits to its predecessor, so any edit to history breaks verification.

import { sha256Hex } from "./sha256";

export interface LedgerEntry {
  seq: number;
  ts: string;
  agent: string;
  activity: string;
  entity: Record<string, unknown>;
  prev: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}

export function entryHash(e: Omit<LedgerEntry, "hash">): string {
  return sha256Hex(e.prev + canonical({ seq: e.seq, ts: e.ts, agent: e.agent, activity: e.activity, entity: e.entity }));
}

export function append(chain: LedgerEntry[], agent: string, activity: string, entity: Record<string, unknown>): LedgerEntry[] {
  const prev = chain.length ? chain[chain.length - 1].hash : GENESIS;
  const base = { seq: chain.length, ts: new Date().toISOString(), agent, activity, entity, prev };
  return [...chain, { ...base, hash: entryHash(base) }];
}

export function verify(chain: LedgerEntry[]): { ok: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (const e of chain) {
    if (e.prev !== prev || entryHash(e) !== e.hash) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true };
}

export function toProvJsonLd(chain: LedgerEntry[], caseName: string) {
  return {
    "@context": { prov: "http://www.w3.org/ns/prov#", cs: "https://casespine.io/ns#" },
    "@id": `cs:ledger/${encodeURIComponent(caseName)}`,
    "cs:headHash": chain.length ? chain[chain.length - 1].hash : GENESIS,
    "@graph": chain.map((e) => ({
      "@id": `cs:event/${e.seq}`,
      "@type": "prov:Activity",
      "prov:startedAtTime": e.ts,
      "prov:wasAssociatedWith": { "@id": `cs:agent/${encodeURIComponent(e.agent)}` },
      "cs:activity": e.activity,
      "prov:used": e.entity,
      "cs:prev": e.prev,
      "cs:hash": e.hash,
    })),
  };
}
