const BASE = "http://localhost:5000/api/progressions";

function authHeaders() {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
}

async function handle(res) {
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : null;

    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
    return data;
}

export async function getProgressionsEmployees() {
    const res = await fetch(`${BASE}/backoffice/employees`, { headers: authHeaders() });
    return handle(res);
}

export async function getEmployeeProgressions(employeeId) {
    const res = await fetch(`${BASE}/backoffice/${employeeId}`, { headers: authHeaders() });
    return handle(res);
}
