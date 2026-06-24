"use strict";
const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ 
      hostname: '127.0.0.1', 
      port: 3344, 
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch {
          // Handle plain text responses
          resolve({ statusCode: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    console.log('=== CREATING TEST PROJECT ===');
    const project = await post('/v1/create-project', {
      name: 'opt-test',
      path: 'D:/opt-test',
      tech_stack: ['typescript', 'express'],
      description: 'Optimization test'
    });
    console.log('Project:', project.success ? '✅ ' + project.project.name : '❌ ' + JSON.stringify(project));

    console.log('=== REMEMBERING MEMORY ===');
    const memory = await post('/v1/remember', {
      content: 'We chose JWT with RS256 algorithm for authentication across 5 internal microservices. HS256 would only work for one monolith.',
      type: 'decision',
      project_name: 'opt-test',
      title: 'JWT RS256 chosen for multiservice auth',
      tags: ['auth', 'security', 'jwt']
    });
    console.log('Memory:', memory.success ? '✅ ' + memory.memory.title : '❌ ' + JSON.stringify(memory));

    console.log('=== RUNNING HYBRID RECALL WITH RERANKING ===');
    const search = await post('/v1/recall', {
      query: 'authentication token security microservices',
      project_name: 'opt-test',
      limit: 3,
      candidate_pool: 20,
      hybrid: true,
      reranking: true
    });

    console.log('Search:', search.success ? '✅' : '❌');
    console.log('Mode:', search.mode);
    console.log('Reranked:', search.reranked);
    console.log('Total memories searched:', search.total_searched);
    console.log('Results:', search.results.length);
    
    if (search.results && search.results.length > 0) {
      search.results.forEach(r => {
        console.log(`  [${r.type}] sim=${r.similarity.toFixed(3)}, rerank=${r.rerank_score.toFixed(3)}`);
        console.log(`  Title: "${r.title}"`);
        console.log(`  Content: "${r.content.slice(0, 180)}..."`);
      });
    }
    
    if (search.success && search.results.length > 0 && search.mode === 'hybrid' && search.reranked) {
      console.log('\n🎉 OPTIMIZATION CONFIRMED: Hybrid + reranked pipeline works flawlessly');
      process.exit(0);
    } else {
      console.log('\n❌ Optimization pipeline NOT working as expected');
      console.log('Actual response:', JSON.stringify(search, null, 2));
      process.exit(1);
    }
  } catch(e) {
    console.error('SMOKE TEST FAILED:', e.message);
    console.error('Stack:', e.stack);
    process.exit(1);
  }
}

main();