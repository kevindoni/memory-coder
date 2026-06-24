const BASE_URL = process.env.MEMORY_CODER_BRIDGE_URL || "http://127.0.0.1:3333/v1";

async function post(path, payload) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return JSON.parse(text);
}

const command = process.argv[2];
const raw = process.argv[3] || "{}";

if (!command || command === "help" || command === "--help" || command === "-h") {
  console.log(`Memory Coder Bridge Client\n\nUsage:\n  node integrations/bridge_client.js recall '{"query":"cors issue"}'\n  node integrations/bridge_client.js remember '{"content":"...","type":"decision"}'\n`);
  process.exit(0);
}

const routes = {
  "create-project": "/create-project",
  "get-project-context": "/get-project-context",
  "remember": "/remember",
  recall: "/recall",
  "log-bug": "/log-bug"
};

if (!routes[command]) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

post(routes[command], JSON.parse(raw))
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
