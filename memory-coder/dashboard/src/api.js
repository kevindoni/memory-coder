const BASE = "/v1";

export function getApiKey() {
  return localStorage.getItem("memory_coder_api_key") || "";
}

export function setApiKey(key) {
  localStorage.setItem("memory_coder_api_key", key);
}

async function request(path, options = {}) {
  const key = getApiKey();
  const headers = { "Content-Type": "application/json" };
  if (key) headers["X-API-Key"] = key;
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  return res.json();
}

export const api = {
  health: () => fetch("/health").then((r) => r.json()),
  stats: () => request("/admin/stats"),
  projects: () => request("/admin/projects"),
  memories: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    return request(`/admin/memories?${qs.toString()}`);
  },
  addMemory: (body) => request(`/admin/memories`, { method: "POST", body: JSON.stringify(body) }),
  deleteMemory: (id) => request(`/admin/memories/${id}`, { method: "DELETE" }),
  feedback: (memory_id, useful, note) => request(`/feedback`, { method: "POST", body: JSON.stringify({ memory_id, useful, note }) }),
  recall: (body) => request(`/recall`, { method: "POST", body: JSON.stringify(body) }),
  embedStatus: () => request("/admin/embed-status"),
  reembed: (limit) => request(`/admin/reembed`, { method: "POST", body: JSON.stringify(limit ? { limit } : {}) }),
  conflicts: (limit = 500) => request(`/admin/conflicts?limit=${limit}`),
  chain: (id) => request(`/admin/memories/${id}/chain`),
  related: (id) => request(`/memory/${id}/related`),
  suggestPatterns: (project_name) => {
    const qs = new URLSearchParams(project_name ? { project_name } : {});
    return request(`/suggest-patterns?${qs.toString()}`);
  },
  deleteProject: (id) => request(`/admin/projects/${id}`, { method: "DELETE" }),
  updateProject: (id, body) => request(`/admin/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  indexProject: (id) => request(`/admin/projects/${id}/index`, { method: "POST" }),
  smartSummary: (id) => request(`/admin/projects/${id}/smart-summary`, { method: "POST" }),
  logs: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    return request(`/admin/logs?${qs.toString()}`);
  },
  llmStatus: () => request("/admin/llm-status"),
  ask: (body) => request("/admin/ask", { method: "POST", body: JSON.stringify(body) }),
  capture: (body) => request("/admin/capture", { method: "POST", body: JSON.stringify(body) }),
  captureFile: (body) => request("/admin/capture-file", { method: "POST", body: JSON.stringify(body) }),
  fileWatcher: () => request("/admin/file-watcher"),
  smartStatus: () => request("/admin/smart-status"),
  smartExpire: (apply) => request(`/admin/smart-expire`, { method: "POST", body: JSON.stringify(apply ? { apply: true } : {}) }),
  smartScope: (apply) => request(`/admin/smart-scope`, { method: "POST", body: JSON.stringify(apply ? { apply: true } : {}) })
};
