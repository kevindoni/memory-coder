/**
 * BM25 keyword search engine (pure JS).
 * Complements semantic (embedding) search for exact-term recall.
 */

const K1 = 1.5;
const B = 0.75;

interface BM25Doc {
  id: string;
  terms: string[];
}

class BM25Index {
  private docs = new Map<string, BM25Doc>();
  private termFreq = new Map<string, number>(); // document frequency per term
  private avgDocLen = 0;
  private totalLen = 0;
  private dirty = false;

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  add(id: string, text: string): void {
    if (this.docs.has(id)) this.remove(id);
    const terms = this.tokenize(text);
    this.docs.set(id, { id, terms });
    this.totalLen += terms.length;
    const seen = new Set<string>();
    for (const t of terms) {
      if (!seen.has(t)) {
        seen.add(t);
        this.termFreq.set(t, (this.termFreq.get(t) || 0) + 1);
      }
    }
    this.dirty = true;
  }

  remove(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    this.totalLen -= doc.terms.length;
    const seen = new Set<string>();
    for (const t of doc.terms) {
      if (!seen.has(t)) {
        seen.add(t);
        const c = this.termFreq.get(t);
        if (c !== undefined) {
          if (c <= 1) this.termFreq.delete(t);
          else this.termFreq.set(t, c - 1);
        }
      }
    }
    this.docs.delete(id);
    this.dirty = true;
  }

  clear(): void {
    this.docs.clear();
    this.termFreq.clear();
    this.totalLen = 0;
    this.dirty = true;
  }

  get size(): number {
    return this.docs.size;
  }

  private ensureAvg(): void {
    if (this.dirty || this.avgDocLen === 0) {
      this.avgDocLen = this.docs.size > 0 ? this.totalLen / this.docs.size : 0;
      this.dirty = false;
    }
  }

  search(query: string, k: number, pool?: Set<string>): Array<{ id: string; score: number }> {
    this.ensureAvg();
    const qTerms = this.tokenize(query);
    if (qTerms.length === 0 || this.docs.size === 0) return [];

    const N = this.docs.size;
    const scores = new Map<string, number>();

    for (const qt of qTerms) {
      const df = this.termFreq.get(qt) || 0;
      if (df === 0) continue;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const doc of this.docs.values()) {
        if (pool && !pool.has(doc.id)) continue;
        // term frequency in this doc
        let tf = 0;
        for (const t of doc.terms) if (t === qt) tf++;
        if (tf === 0) continue;

        const dl = doc.terms.length;
        const denom = tf + K1 * (1 - B + B * (dl / (this.avgDocLen || 1)));
        const score = (idf * (tf * (K1 + 1))) / denom;
        scores.set(doc.id, (scores.get(doc.id) || 0) + score);
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

let bm25Instance: BM25Index | null = null;

export function getBM25Index(): BM25Index {
  if (!bm25Instance) {
    bm25Instance = new BM25Index();
  }
  return bm25Instance;
}

/**
 * Reciprocal Rank Fusion — merges two ranked lists into one.
 * Used to combine semantic (HNSW) + keyword (BM25) results.
 *
 * @param semantic ranked list of {id, similarity}
 * @param keyword   ranked list of {id, score}
 * @param k         RRF constant (default 60, standard value)
 */
export function reciprocalRankFusion(
  semantic: Array<{ id: string; similarity: number }>,
  keyword: Array<{ id: string; score: number }>,
  k = 60
): Array<{ id: string; score: number }> {
  const fused = new Map<string, number>();

  semantic.forEach((item, rank) => {
    fused.set(item.id, (fused.get(item.id) || 0) + 1 / (k + rank + 1));
  });
  keyword.forEach((item, rank) => {
    fused.set(item.id, (fused.get(item.id) || 0) + 1 / (k + rank + 1));
  });

  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
