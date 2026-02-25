// src/api/overtimePmApi.js
const BASE = "http://localhost:5000/api/overtime";

function authHeaders() {
    const token = localStorage.getItem("token");
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
}

async function handle(res) {
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : null;

    if (!res.ok) {
        const msg = data?.message || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

export async function getOvertimeApprovals({ status = "inprogress", month = "" } = {}) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (month) qs.set("month", month);
    const res = await fetch(`${BASE}/approvals?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function decideOvertimeApproval(id, { status, managerNote = "" }) {
    const res = await fetch(`${BASE}/approvals/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status, managerNote }),
    });
    return handle(res);
}
