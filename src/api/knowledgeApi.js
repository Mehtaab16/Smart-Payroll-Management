const API = "http://localhost:5000";

function authHeaders(isJson = true) {
    const token = localStorage.getItem("token") || "";
    const h = {};
    if (isJson) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
}

export async function listKnowledgeDocs() {
    const r = await fetch(`${API}/api/knowledge/docs`, { headers: authHeaders(false) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function uploadKnowledgeDoc({ file, title, category, tags }) {
    const token = localStorage.getItem("token") || "";
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || "");
    fd.append("category", category || "");
    fd.append("tags", tags || ""); // comma separated

    const r = await fetch(`${API}/api/knowledge/docs`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function patchKnowledgeDoc(id, patch) {
    const r = await fetch(`${API}/api/knowledge/docs/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function reprocessKnowledgeDoc(id) {
    const r = await fetch(`${API}/api/knowledge/docs/${id}/reprocess`, {
        method: "POST",
        headers: authHeaders(false),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function deleteKnowledgeDoc(id) {
    const token = localStorage.getItem("token") || "";
    const r = await fetch(`${API}/api/knowledge/docs/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}


export async function getKnowledgeSettings() {
    const r = await fetch(`${API}/api/knowledge/settings`, { headers: authHeaders(false) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function updateKnowledgeSettings(payload) {
    const r = await fetch(`${API}/api/knowledge/settings`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function chatKnowledge({ question }) {
    const r = await fetch(`${API}/api/knowledge/chat`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ question }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function askKnowledge(question) {
    const r = await fetch(`${API}/api/knowledge/chat`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ question }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "Request failed");
    return data;
}

