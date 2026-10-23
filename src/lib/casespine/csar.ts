// .csar = CaseSpine portable assembly: a PEP 441 Python zipapp (shebang +
// ZIP) holding the IR, Lean/Z3 contracts, BPMN and every cloud scaffold, plus
// a stdlib-only runtime that verifies digests and evaluates the contract.

import { zipSync, strToU8 } from "fflate";
import { sha256Hex } from "../sha256";
import { emitAll, emitIR } from "./emit";
import type { CompileResult } from "./types";

const RUNTIME_PY = `"""CaseSpine v5 portable assembly runtime (.csar) — Python 3.9+, stdlib only.

  python3 case.csar info                  case tree, budgets, guards and rules
  python3 case.csar verify                SHA-256 digests in META-INF/MANIFEST.MF
  python3 case.csar check state.json      evaluate the Binding Lean Contract on a runtime state
  python3 case.csar targets               embedded cloud / orchestration scaffolds
  python3 case.csar extract OUT_DIR       unpack every scaffold for the engineering lanes
"""
import hashlib
import json
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))


def _read(name):
    if zipfile.is_zipfile(HERE):
        with zipfile.ZipFile(HERE) as z:
            return z.read(name)
    with open(os.path.join(HERE, name), "rb") as fh:
        return fh.read()


def _names():
    if zipfile.is_zipfile(HERE):
        with zipfile.ZipFile(HERE) as z:
            return z.namelist()
    out = []
    for root, _, files in os.walk(HERE):
        for f in files:
            out.append(os.path.relpath(os.path.join(root, f), HERE).replace(os.sep, "/"))
    return out


IR = json.loads(_read("ir/compiled_case_manifest.json"))
OPS = {">=": lambda a, b: a >= b, "<=": lambda a, b: a <= b, ">": lambda a, b: a > b,
       "<": lambda a, b: a < b, "=": lambda a, b: a == b, "!=": lambda a, b: a != b}


def eval_clause(c, s):
    left = s.get(c["field"])
    right = s.get(c["rhsField"]) if c.get("rhsField") else c["value"]
    if left is None or right is None:
        return None
    return OPS[c["op"]](left, right)


def eval_rule(rule, s):
    vals = [eval_clause(c, s) for c in rule["clauses"]]
    if not vals:
        return True
    if rule.get("negated"):
        if any(v is False for v in vals):
            return True
        return None if any(v is None for v in vals) else False
    if any(v is False for v in vals):
        return False
    return None if any(v is None for v in vals) else True


def cmd_info():
    for c in IR["cases"]:
        pad = "  " * c["namespace_path"].count("/")
        print(f"{pad}{c['kind']}: {c['name']}  [{c['namespace_path']} · isolation {c['isolation_hash']}]")
        print(f"{pad}  budget {c['budget']['tokens']} tokens / {c['budget']['usd']} USD · rules {len(c['rules'])} · stages {len(c['stages'])}")
        for r in c["rules"]:
            tag = "inherited" if r["inherited"] else "local"
            print(f"{pad}    {r['id']} ({tag}) {r['lean4']}")


def cmd_verify():
    manifest = _read("META-INF/MANIFEST.MF").decode()
    ok = True
    for line in manifest.splitlines():
        if line.startswith("SHA-256-Digest: "):
            name, digest = line[len("SHA-256-Digest: "):].split(" ", 1)
            actual = hashlib.sha256(_read(name)).hexdigest()
            status = "ok" if actual == digest.strip() else "MISMATCH"
            ok = ok and status == "ok"
            print(f"{status:9} {name}")
    print("assembly intact" if ok else "ASSEMBLY TAMPERED")
    return 0 if ok else 2


def cmd_check(path, namespace=None):
    with open(path) as fh:
        state = json.load(fh)
    cases = [c for c in IR["cases"] if namespace in (None, c["namespace_path"])] or IR["cases"]
    worst = 0
    for c in cases:
        print(f"{c['kind']}: {c['name']}")
        for r in c["rules"]:
            v = eval_rule(r, state)
            mark = {True: "PASS", False: "FAIL", None: "UNBOUND"}[v]
            worst = max(worst, {True: 0, None: 1, False: 2}[v])
            print(f"  {mark:8} {r['id']} before {r['milestone']}: {r['text']}")
    verdict = {0: "GATE OPEN — emit deliverable", 1: "FAIL-CLOSED — unbound probes, escalate", 2: "GATE CLOSED — halt, compensate, escalate"}[worst]
    print(verdict)
    return worst


def cmd_targets():
    for n in sorted(_names()):
        if n.startswith(("integrations/", "process/", "contracts/")):
            print(n)


def cmd_extract(out):
    for n in _names():
        if n.endswith("/") or n == "__main__.py":
            continue
        dest = os.path.join(out, n)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(_read(n))
    print(f"extracted to {out}")


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = argv[1]
    if cmd == "info":
        return cmd_info()
    if cmd == "verify":
        return cmd_verify()
    if cmd == "check" and len(argv) >= 3:
        return cmd_check(argv[2], argv[4] if len(argv) > 4 and argv[3] == "--case" else None)
    if cmd == "targets":
        return cmd_targets()
    if cmd == "extract" and len(argv) >= 3:
        return cmd_extract(argv[2])
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv) or 0)
`;

export interface CsarBundle {
  bytes: Uint8Array;
  files: { name: string; size: number; sha256: string }[];
  fileName: string;
}

export function buildCsar(r: CompileResult): CsarBundle {
  const targets = emitAll(r);
  const payload: Record<string, Uint8Array> = {};
  payload["__main__.py"] = strToU8(RUNTIME_PY);
  for (const t of targets) {
    if (t.id === "aws") {
      const [asl, guard] = t.code.split("\n\n// aws_bedrock_guardrail.json (compiled from Banned Topics + Case File curation)\n");
      payload[t.file] = strToU8(asl.replace(/^\/\/.*\n/, ""));
      if (guard) payload["integrations/aws_bedrock_guardrail.json"] = strToU8(guard);
    } else payload[t.file] = strToU8(t.code);
  }
  payload["ir/universal_solution_archetypes.json"] = strToU8(
    JSON.stringify({ archetypes: [...new Set(r.cases.map((c) => c.archetype).filter(Boolean))] }, null, 2),
  );
  const ir = emitIR(r);
  const digests = Object.entries(payload).map(([name, data]) => ({ name, size: data.length, sha256: sha256Hex(data) }));
  const root = r.root!;
  const manifest = [
    "Manifest-Version: 1.0",
    "Created-By: CaseSpine v5 browser compiler (Noor Al Hikma AI)",
    "Main-Class: __main__",
    `Case: ${root.name}`,
    `Namespace: ${root.namespacePath}`,
    `Isolation-Hash: ${root.isolationHash}`,
    `Cases-Compiled: ${ir.cases.length}`,
    `Archetypes: ${[...new Set(r.cases.map((c) => c.archetype).filter(Boolean))].join(", ") || "unspecified"}`,
    "Clouds: aws, gcp, databricks, kubernetes",
    ...digests.map((d) => `SHA-256-Digest: ${d.name} ${d.sha256}`),
    "",
  ].join("\n");
  payload["META-INF/MANIFEST.MF"] = strToU8(manifest);
  const zip = zipSync(payload, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
  const shebang = strToU8("#!/usr/bin/env python3\n");
  const bytes = new Uint8Array(shebang.length + zip.length);
  bytes.set(shebang);
  bytes.set(zip, shebang.length);
  const fileName = root.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + ".csar";
  return {
    bytes,
    fileName,
    files: [...digests, { name: "META-INF/MANIFEST.MF", size: manifest.length, sha256: sha256Hex(manifest) }],
  };
}
