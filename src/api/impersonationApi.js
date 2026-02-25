// src/api/impersonationApi.js
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

// GET list targets (employees or payroll managers)
// expected: { departments: ["HR",...], users: [{id, fullName, email, department, role}] }
export async function getImpersonationTargets({ role, department = "" }) {
    const qs = new URLSearchParams();
    if (role) qs.set("role", role);
    if (department) qs.set("department", department);

    const r = await fetch(`${API}/api/impersonation/targets?${qs.toString()}`, {
        headers: authHeaders(true),
    });
    return readJson(r);
}

// POST start impersonation
// expected: { token, user }
export async function startImpersonation({ role, userId }) {
    const r = await fetch(`${API}/api/impersonation/start`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ role, userId }),
    });
    return readJson(r);
}
