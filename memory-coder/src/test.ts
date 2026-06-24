import { initDatabase, createProject, getProject, createMemory, getMemoriesByProject } from "./db/index.js";
import { getEmbedder, cosineSimilarity } from "./embeddings/index.js";

async function test() {
  console.log("=== Testing Memory Coder MCP ===\n");
  
  // 1. Test database init
  console.log("1. Initializing database...");
  await initDatabase("./data/memory.db");
  console.log("   ✓ Database ready\n");
  
  // 2. Test create project
  console.log("2. Creating test project...");
  const project = createProject({
    name: "test-api",
    path: "D:/test-api",
    tech_stack: ["typescript", "express", "postgresql"],
    description: "REST API for e-commerce"
  });
  console.log(`   ✓ Project created: ${project.name} (${project.id})\n`);
  
  // 3. Test get project
  console.log("3. Retrieving project...");
  const retrieved = getProject("test-api");
  console.log(`   ✓ Project found: ${retrieved?.name} with stack: ${retrieved?.tech_stack.join(", ")}\n`);
  
  // 4. Test create memory (with embedding)
  console.log("4. Creating memory with embedding...");
  const embedder = getEmbedder();
  const embedding = await embedder.embed("Express middleware for CORS setup");
  
  const memory = createMemory({
    project_id: project.id,
    type: "pattern",
    title: "CORS Middleware Pattern",
    content: "Always configure CORS in Express: app.use(cors({ origin: '*' }))",
    embedding,
    tags: ["cors", "express", "middleware"],
    metadata: { language: "javascript", framework: "express" },
    importance: 0.7
  });
  console.log(`   ✓ Memory created: ${memory.title} (${memory.id})\n`);
  
  // 5. Test recall (semantic search)
  console.log("5. Testing semantic recall...");
  const queryEmbedding = await embedder.embed("cross origin issues");
  const memories = getMemoriesByProject(project.id, 100);
  
  const withSimilarity = memories
    .filter(m => m.embedding)
    .map(m => ({
      memory: m,
      similarity: cosineSimilarity(queryEmbedding, m.embedding!)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
  
  console.log(`   ✓ Found ${withSimilarity.length} memories by semantic similarity:`);
  withSimilarity.forEach(({ memory, similarity }) => {
    console.log(`     - ${memory.title} (similarity: ${similarity.toFixed(3)})`);
  });
  
  console.log("\n=== All tests passed! ===");
}

test().catch(console.error);
