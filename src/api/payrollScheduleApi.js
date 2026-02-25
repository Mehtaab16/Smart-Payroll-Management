const BASE = "http://localhost:5000/api/pm/payroll-schedule";

function authHeaders() {
    const token = localStorage.getItem("token");
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
async function handle(res) {
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
    return data;
}

export async function getPayrollSchedule() {
    const res = await fetch(BASE, { headers: authHeaders() });
    return handle(res);
}
export async function savePayrollSchedule(payload) {
    const res = await fetch(BASE, { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) });
    return handle(res);
}
export async function previewPayrollSchedule() {
    const res = await fetch(`${BASE}/preview`, { headers: authHeaders() });
    return handle(res);
}
