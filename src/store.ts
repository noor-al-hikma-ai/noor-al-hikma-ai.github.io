// Shared Studio <-> Sandbox state: the CaseSpine source and its compilation.
import { useSyncExternalStore } from "react";
import { compileSpec } from "./lib/casespine/analyze";
import { RETAIL_WIRE_EN } from "./lib/casespine/examples";
import type { CompileResult } from "./lib/casespine/types";

const KEY = "noor.casespine.spec.v1";

function load(): string {
  try {
    return localStorage.getItem(KEY) || RETAIL_WIRE_EN;
  } catch {
    return RETAIL_WIRE_EN;
  }
}

let spec = load();
let compiled: CompileResult = compileSpec(spec);
const subs = new Set<() => void>();

export function setSpec(next: string) {
  if (next === spec) return;
  spec = next;
  compiled = compileSpec(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: keep in memory */
  }
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}

export function useSpec(): { spec: string; compiled: CompileResult } {
  const s = useSyncExternalStore(subscribe, () => spec);
  const c = useSyncExternalStore(subscribe, () => compiled);
  return { spec: s, compiled: c };
}

export function getSpec() {
  return { spec, compiled };
}
