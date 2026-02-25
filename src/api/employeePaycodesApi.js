// client/src/api/employeePaycodesApi.js
const BASE = "http://localhost:5000/api/employee-paycodes";

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

export async function listEmployeePaycodes(employeeId) {
    const res = await fetch(`${BASE}/${employeeId}`, { headers: authHeaders() });
    return handle(res);
}

export async function createEmployeePaycode(employeeId, payload) {
    const res = await fetch(`${BASE}/${employeeId}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return handle(res);
}

export async function updateEmployeePaycode(employeeId, assignmentId, payload) {
    const res = await fetch(`${BASE}/${employeeId}/${assignmentId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return handle(res);
}

export async function endEmployeePaycode(employeeId, assignmentId, effectiveTo) {
    const res = await fetch(`${BASE}/${employeeId}/${assignmentId}/end`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ effectiveTo }),
    });
    return handle(res);
}
