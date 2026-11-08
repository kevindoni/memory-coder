import { cosineSimilarity } from "./index.js";

/**
 * Corpus size below which search is exact brute-force. A full scan of
 * 100k x 384-dim vectors is ~40-80ms in JS; the bucketed ANN path is only
 * worth it beyond that, and it trades recall for speed (see search()).
 */
const EXACT_SEARCH_MAX = 100_000;

export interface VectorEntry {
  id: string;
  vector: Float32Array;
}

/**
 * Approximate Nearest Neighbor index using a tiered approach:
 * - small datasets (< SMALL_THRESHOLD): exact brute-force (fast enough)
 * - large datasets: bucketed inverted index + brute-force within candidate set
 *
 * This is a pragmatic pure-JS replacement for hnswlib-node (which failed to
 * compile on Windows). It scales well to ~10k vectors while staying dependency-free.
 */
class VectorStore {
  private vectors = new Map<string, Float32Array>();
  // precomputed norms (vectors are already normalized by embedder, so norm ~= 1)
  private buckets: Float32Array[][] = [];
  private bucketOf = new Map<string, number>();
  private numBuckets = 16;
  private bucketReady = false;
  private dirty = false;
  private dim = 0;

  add(id: string, vector: Float32Array): void {
    if (this.dim === 0 && vector.length > 0) this.dim = vector.length;
    this.vectors.set(id, this.ensureUnit(vector));
    this.dirty = true;
  }

  /**
   * Store-side invariant: all vectors are unit-length so search can use a
   * plain dot product (cosine of normalized vectors). Guard is cheap and
   * makes the fast path always correct even for non-normalized input.
   */
  private ensureUnit(vec: Float32Array): Float32Array {
    let sq = 0;
    for (let i = 0; i < vec.length; i++) sq += vec[i] * vec[i];
    const norm = Math.sqrt(sq);
    if (norm === 0 || Math.abs(norm - 1) < 1e-3) return vec;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
  }

  remove(id: string): void {
    this.vectors.delete(id);
    this.bucketOf.delete(id);
    this.dirty = true;
  }

  clear(): void {
    this.vectors.clear();
    this.buckets = [];
    this.bucketOf.clear();
    this.dirty = true;
  }

  get size(): number {
    return this.vectors.size;
  }

  has(id: string): boolean {
    return this.vectors.has(id);
  }

  get(id: string): Float32Array | undefined {
    return this.vectors.get(id);
  }

  private ensureBuckets(): void {
    if (!this.dirty && this.bucketReady) return;
    this.rebuildBuckets();
    this.bucketReady = true;
    this.dirty = false;
  }

  private rebuildBuckets(): void {
    this.buckets = Array.from({ length: this.numBuckets }, () => []);
    this.bucketOf.clear();
    for (const [id, vec] of this.vectors) {
      const b = this.bucketIndex(vec);
      this.buckets[b].push(vec);
      this.bucketOf.set(id, b);
    }
  }

  /**
   * Assign a vector to a bucket using a projection hash of the first few dims.
   * Vectors in the same bucket are likely semantically similar (LSH-lite).
   */
  private bucketIndex(vec: Float32Array): number {
    const dim = this.dim || vec.length;
    let h = 0;
    const stride = Math.max(1, Math.floor(dim / 16));
    for (let i = 0; i < dim; i += stride) {
      // quantize each sampled dim into sign bit and combine
      h = (h * 31 + (vec[i] >= 0 ? 1 : 0)) | 0;
    }
    return Math.abs(h) % this.numBuckets;
  }

  /**
   * Search for the k nearest neighbors of `query`.
   * Returns ids sorted by similarity (descending).
   */
  search(query: Float32Array, k: number, opts?: { projectIds?: Set<string> | null; pool?: Set<string> }): Array<{ id: string; similarity: number }> {
    const n = this.vectors.size;
    if (n === 0) return [];

    // Exact search up to a large corpus: measured on 7k x 384-dim vectors a
    // full scan costs single-digit ms, while the bucketed path only probes
    // ~19% of vectors (3/16 buckets) and silently caps recall — e.g. a
    // memory failed to self-match its own title through the bucketed path.
    if (n <= EXACT_SEARCH_MAX) {
      return this.bruteForce(query, k, opts?.pool);
    }

    // For very large datasets, narrow candidates via buckets then exact-rank
    this.ensureBuckets();
    const queryBucket = this.bucketIndex(query);

    // gather candidate ids: own bucket + nearest neighbor buckets
    const candidateBuckets = new Set<number>([queryBucket]);
    // also include adjacent buckets to improve recall
    candidateBuckets.add((queryBucket + 1) % this.numBuckets);
    candidateBuckets.add((queryBucket - 1 + this.numBuckets) % this.numBuckets);

    const candidates: Array<{ id: string; vec: Float32Array }> = [];
    for (const [id, vec] of this.vectors) {
      const b = this.bucketOf.get(id);
      if (b === undefined || candidateBuckets.has(b)) {
        // apply project filter if provided
        if (opts?.pool && !opts.pool.has(id)) continue;
        candidates.push({ id, vec });
      }
    }

    // safety: if too few candidates, fall back to full scan
    if (candidates.length < k * 2) {
      return this.bruteForce(query, k, opts?.pool);
    }

    return candidates
      .map(({ id, vec }) => ({ id, similarity: cosineSimilarity(query, vec) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  private bruteForce(query: Float32Array, k: number, pool?: Set<string>): Array<{ id: string; similarity: number }> {
    const results: Array<{ id: string; similarity: number }> = [];
    for (const [id, vec] of this.vectors) {
      if (pool && !pool.has(id)) continue;
      // vectors (and the query embedding) are unit-length: dot == cosine,
      // 3x cheaper than recomputing norms per pair
      let dot = 0;
      for (let i = 0; i < vec.length; i++) dot += query[i] * vec[i];
      results.push({ id, similarity: dot });
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }
}

let storeInstance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!storeInstance) {
    storeInstance = new VectorStore();
  }
  return storeInstance;
}
