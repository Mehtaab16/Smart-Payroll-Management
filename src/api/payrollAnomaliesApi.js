// src/api/payrollAnomaliesApi.js
const API = "http://localhost:5000";

function authHeaders(isJson = true) {
    const token = localStorage.getItem("token") || "";
    const h = {};
    if (isJson) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
}

async function readJson(r) {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Request failed (${r.status})`);
    return j;
}

/**
 * Returns list of anomalies (open/pending/etc depending on your backend)
 * If your backend uses different status values, adjust the default to match.
 */
export async function listAnomalies({ status = "open" } = {}) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);

    const r = await fetch(`${API}/api/pm/anomalies?${qs.toString()}`, {
        headers: authHeaders(true),
    });
    return readJson(r);
}
