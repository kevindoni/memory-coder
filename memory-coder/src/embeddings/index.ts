import { pipeline, env } from "@xenova/transformers";

// Skip model download checks - we handle it ourselves
env.allowLocalModels = false;
env.useFSCache = true;

export interface IEmbedder {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export class LocalEmbedder implements IEmbedder {
  private pipe: any = null;
  private modelName = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

  currentModel() {
    return this.modelName;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipe) {
      this.pipe = await pipeline("feature-extraction", this.modelName);
    }
    const output = await this.pipe(text, {
      pooling: "mean",
      normalize: true
    });
    return output.data as Float32Array;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.pipe) {
      this.pipe = await pipeline("feature-extraction", this.modelName);
    }
    const output = await this.pipe(texts, {
      pooling: "mean",
      normalize: true
    });

    const dim = Math.round(output.data.length / texts.length);
    const results: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      const arr = new Float32Array(dim);
      for (let j = 0; j < dim; j++) {
        arr[j] = output.data[i * dim + j];
      }
      results.push(arr);
    }
    return results;
  }
}

// Singleton instance
let embedderInstance: LocalEmbedder | null = null;

export function getEmbedder(): LocalEmbedder {
  if (!embedderInstance) {
    embedderInstance = new LocalEmbedder();
  }
  return embedderInstance;
}

// Cosine similarity for vector search
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
