// Tiny dependency-free highlighter for CaseSpine (and Lean / Python snippets)
// used outside the editor — Copilot preview and the landing-page slides.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text: string): string {
  const rules: [RegExp, string][] = [
    [/^"[^"]*"/, "hl-str"],
    [/^It is (?:obligatory|prohibited|permitted) that/i, "hl-modal"],
    [/^(?:before\s+)?Milestone\s+\w+/i, "hl-ms"],
    [/^[a-z0-9_]+:\/\/[^\s,\])]*/, "hl-link"],
    [/^(?:>=|<=|!=|==|≥|≤|≠|∧|¬|=|>|<)/, "hl-op"],
    [/^\$?\d[\d,]*(?:\.\d+)?(?:%|x\b)?/, "hl-num"],
    [/^[A-Z][A-Z0-9_]{2,}\b/, "hl-atom"],
    [/^(?:def|example|by|decide|structure|where|import|from|return|if|else|True|False|true|false)\b/, "hl-kw"],
  ];
  let out = "";
  let rest = text;
  while (rest.length) {
    let hit = false;
    for (const [re, cls] of rules) {
      const m = re.exec(rest);
      if (m && m[0].length) {
        out += `<span class="${cls}">${esc(m[0])}</span>`;
        rest = rest.slice(m[0].length);
        hit = true;
        break;
      }
    }
    if (!hit) {
      const m = /^[^"$\d<>=!≥≤≠∧¬A-Za-z]+|^[A-Za-z_][\w-]*/.exec(rest);
      const chunk = m ? m[0] : rest[0];
      out += esc(chunk);
      rest = rest.slice(chunk.length);
    }
  }
  return out;
}

export function highlightCaseSpine(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      if (/^\s*(#|--|;)/.test(line)) return `<span class="hl-com">${esc(line)}</span>`;
      const m = /^(\s*)(-\s+)?([^:"'[{#\s][^:]*?):(\s.*|$)/.exec(line);
      if (m && !/^\s*-\s+It is/i.test(line)) {
        const cls = m[1].length === 0 && !m[2] ? "hl-head" : "hl-key";
        return `${m[1]}${m[2] ? `<span class="hl-com">${esc(m[2])}</span>` : ""}<span class="${cls}">${esc(m[3])}</span>:${inline(m[4])}`;
      }
      const d = /^(\s*)(-\s+)(.*)$/.exec(line);
      if (d) return `${d[1]}<span class="hl-com">${esc(d[2])}</span>${inline(d[3])}`;
      return inline(line);
    })
    .join("\n");
}
