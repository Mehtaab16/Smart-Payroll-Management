const BASE = "http://localhost:5000/api/pm/adjustments";

function authHeaders() {
    const token = localStorage.getItem("token");
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handle(res) {
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
    return data;
}

export async function listAdjustments({ period = "", status = "", search = "" } = {}) {
    const qs = new URLSearchParams();
    if (period) qs.set("period", period);
    if (status) qs.set("status", status);
    if (search) qs.set("search", search);

    const res = await fetch(`${BASE}?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function createAdjustment(payload) {
    const res = await fetch(`${BASE}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
    return handle(res);
}

export async function updateAdjustment(id, payload) {
    const res = await fetch(`${BASE}/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload) });
    return handle(res);
}

export async function cancelAdjustment(id) {
    const res = await fetch(`${BASE}/${id}/cancel`, { method: "POST", headers: authHeaders() });
    return handle(res);
}

export async function bulkAddAdjustments(csvText) {
    const res = await fetch(`${BASE}/bulk`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ csvText }) });
    return handle(res);
}
