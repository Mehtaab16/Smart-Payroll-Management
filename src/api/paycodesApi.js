const BASE = "http://localhost:5000/api/paycodes";

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

export async function listPaycodes(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        qs.set(k, String(v));
    });

    const res = await fetch(`${BASE}?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function createPaycode(payload) {
    const res = await fetch(`${BASE}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return handle(res);
}

export async function updatePaycode(id, patch) {
    const res = await fetch(`${BASE}/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(patch),
    });
    return handle(res);
}

export async function archivePaycode(id) {
    const res = await fetch(`${BASE}/${id}/archive`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handle(res);
}

export async function bulkAddPaycodes(csvText) {
    const res = await fetch(`${BASE}/bulk`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ csvText }),
    });
    return handle(res);
}
