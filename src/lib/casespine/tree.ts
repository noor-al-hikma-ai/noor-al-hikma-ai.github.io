// Permissive "literate YAML" reader. CaseSpine looks like YAML 1.2 but is
// deliberately forgiving: values may contain quotes, brackets and prose
// (`User: "Dr. A" <a@bank.ae>`), so we build an indentation tree ourselves and
// let the semantic pass decide how to read each node.

export interface SpecNode {
  line: number; // 1-based
  indent: number;
  isItem: boolean;
  /** Content after indentation and the list dash. */
  text: string;
  key?: string;
  value?: string;
  children: SpecNode[];
  endLine: number;
}

const KEY_RE = /^([^"'[{#\s][^:]*?)\s*:(?:\s+(.*))?$/;

export function parseKey(text: string): { key: string; value: string } | null {
  const m = KEY_RE.exec(text);
  if (!m) return null;
  const key = m[1].trim();
  if (key.length > 90 || /\s{2,}/.test(key)) return null;
  return { key, value: (m[2] ?? "").trim() };
}

export function buildTree(src: string): SpecNode[] {
  const roots: SpecNode[] = [];
  const stack: SpecNode[] = [];
  const lines = src.split("\n");
  lines.forEach((raw0, i) => {
    const raw = raw0.replace(/\t/g, "  ");
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const m = /^(\s*)(-(?:\s+|$))?(.*)$/.exec(raw)!;
    const indent = m[1].length;
    const isItem = m[2] !== undefined;
    const text = m[3].trimEnd();
    const kv = parseKey(text);
    const node: SpecNode = {
      line: i + 1,
      indent,
      isItem,
      text,
      key: kv?.key,
      value: kv?.value,
      children: [],
      endLine: i + 1,
    };
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.indent < indent) break;
      // Compact YAML lists: "Rules:\n- a\n- b" (items at the key's indentation).
      if (isItem && !top.isItem && top.indent === indent && top.value === "") break;
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(node);
    stack.push(node);
  });
  const fix = (n: SpecNode): number => {
    for (const c of n.children) n.endLine = Math.max(n.endLine, fix(c));
    return n.endLine;
  };
  roots.forEach(fix);
  return roots;
}

/** Normalised key for matching: lower-case, parenthetical remarks removed. */
export function normKey(k: string | undefined): string {
  return (k ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseList(v: string | undefined): string[] {
  if (!v) return [];
  const m = /\[([^\]]*)\]/.exec(v);
  const body = m ? m[1] : v;
  return body
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function unquote(v: string | undefined): string {
  return (v ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}
