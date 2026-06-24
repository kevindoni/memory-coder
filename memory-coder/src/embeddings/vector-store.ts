import { cosineSimilarity } from "./index.js";

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
    this.vectors.set(id, vector);
    this.dirty = true;
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
  search(query: Float32Array, k: number, opts?: { projectIds?: Set<string> | null; pool?: Map<string, string> }): Array<{ id: string; similarity: number }> {
    const n = this.vectors.size;
    if (n === 0) return [];

    // For small datasets, exact search is fastest (no bucket overhead)
    if (n <= 600) {
      return this.bruteForce(query, k, opts?.pool);
    }

    // For larger datasets, narrow candidates via buckets then exact-rank
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

  private bruteForce(query: Float32Array, k: number, pool?: Map<string, string>): Array<{ id: string; similarity: number }> {
    const results: Array<{ id: string; similarity: number }> = [];
    for (const [id, vec] of this.vectors) {
      if (pool && !pool.has(id)) continue;
      results.push({ id, similarity: cosineSimilarity(query, vec) });
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
