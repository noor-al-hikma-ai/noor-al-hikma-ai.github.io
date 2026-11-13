export interface Passage {
  id: string;
  corpus: "synthetic" | "uae";
  title: string;
  url?: string;
  text: string;
}

export interface Claim {
  text: string;
  quote: string;
  source: Passage;
}

export const policies: Passage[];
export function retrieve(question: string, corpus: Passage["corpus"]): Passage[];
export function checkEvidence(value: unknown, passages: Passage[]): Claim[];
