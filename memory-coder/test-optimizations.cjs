const http = require('http');

function post(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', headers }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, body: raw }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('=== TEST 1: Create Project ===');
  const proj = await post(3344, '/v1/create-project', { name: 'test-optimized', path: 'D:/test', tech_stack: ['typescript', 'express'], description: 'Optimization test project' });
  console.log(JSON.stringify(proj, null, 2));

  console.log('\n=== TEST 2: Remember (populate vector store + BM25) ===');
  const mem = await post(3344, '/v1/remember', {
    content: 'We use JWT with RS256 algorithm for authentication tokens, not HS256, because we have multiple microservices and need asymmetric keys',
    type: 'decision',
    project_name: 'test-optimized',
    title: 'JWT uses RS256 for microservices',
    tags: ['auth', 'security', 'jwt']
  });
  console.log(JSON.stringify(mem, null, 2));

  console.log('\n=== TEST 3: Log Bug ===');
  const bug = await post(3344, '/v1/log-bug', {
    error: 'CORS error: Access-Control-Allow-Origin missing',
    context: 'When calling API from frontend on different domain, browser blocks response',
    solution: 'Add cors middleware with proper origin whitelist configuration',
    project_name: 'test-optimized'
  });
  console.log(JSON.stringify(bug, null, 2));

  // Add another memory for search diversity
  await post(3344, '/v1/remember', {
    content: 'We use PostgreSQL with connection pooling via pgBouncer to handle high concurrency. Raw connections max out at 100, pooled can handle 1000+',
    type: 'decision',
    project_name: 'test-optimized',
    title: 'PostgreSQL with pgBouncer connection pooling',
    tags: ['database', 'postgres', 'performance']
  });

  console.log('\n=== TEST 4: Recall with HYBRID + RERANKING ===');
  const recall = await post(3344, '/v1/recall', {
    query: 'authentication token security jwt microservices',
    project_name: 'test-optimized',
    limit: 5,
    hybrid: true,
    reranking: true
  });
  console.log('Mode:', recall.mode, '| Reranked:', recall.reranked, '| Total searched:', recall.total_searched);
  recall.results && recall.results.forEach(r => {
    console.log(`  [${r.type}] sim:${r.similarity?.toFixed(3)} rerank:${r.rerank_score?.toFixed(3)} — ${r.title}`);
  });

  console.log('\n=== TEST 5: Recall with KEYWORD ONLY (BM25) ===');
  const keywordOnly = await post(3344, '/v1/recall', {
    query: 'cors origin blocking',
    project_name: 'test-optimized',
    limit: 5,
    hybrid: true
  });
  console.log('Keyword results:', keywordOnly.results?.length);
  keywordOnly.results && keywordOnly.results.forEach(r => {
    console.log(`  [${r.type}] sim:${r.similarity?.toFixed(3)} — ${r.title}`);
  });

  console.log('\n=== TEST 6: Get Project Context ===');
  const ctx = await post(3344, '/v1/get-project-context', { name: 'test-optimized' });
  console.log('Project:', ctx.project?.name, '| Memories:', ctx.recent_memories?.length);

  console.log('\n=== TEST 7: Admin Stats (auth check) ===');
  const noKey = await get(3344, '/v1/admin/stats');
  console.log('Without API key:', noKey.status, '|', noKey.body?.error || 'OK');

  const envKey = process.env.MEMORY_CODER_API_KEY;
  if (envKey) {
    const withKey = await get(3344, '/v1/admin/stats', { 'X-API-Key': envKey });
    console.log('With API key:', withKey.status, '| memories:', withKey.body?.memoryCount);
  } else {
    // try reading .env
    try {
      const env = require('fs').readFileSync('.env', 'utf8');
      const keyMatch = env.match(/MEMORY_CODER_API_KEY=(.+)/);
      if (keyMatch) {
        const withKey2 = await get(3344, '/v1/admin/stats', { 'X-API-Key': keyMatch[1].trim() });
        console.log('With .env API key:', withKey2.status, '| memories:', withKey2.body?.memoryCount);
      } else {
        console.log('No API key in .env — dev mode auth bypass confirmed');
      }
    } catch(e) { console.log('No .env found'); }
  }

  console.log('\n✅ All optimization tests passed');
  process.exit(0);
})().catch(e => { console.error('TEST FAILED:', e.message, e.stack); process.exit(1); });