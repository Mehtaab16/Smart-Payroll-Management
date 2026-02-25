// client/src/api/payrollRunsApi.js ✅ FULL FILE
const BASE = "http://localhost:5000/api/pm/payroll-runs";

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

export async function previewPayroll({ period }) {
    const res = await fetch(`${BASE}/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ period }),
    });
    return handle(res);
}

export async function getPayrollCandidates({ period }) {
    const res = await fetch(`${BASE}/candidates?period=${encodeURIComponent(period)}`, {
        headers: authHeaders(),
    });
    return handle(res);
}

// Backwards compatible:
// - runPayroll({ period, payDate }) behaves the same as before (runs ALL candidates server-side)
// - runPayroll({ period, payDate, employeeIds }) runs ONLY selected employees
export async function runPayroll({ period, payDate, employeeIds = null }) {
    const res = await fetch(`${BASE}/run`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            period,
            payDate,
            employeeIds: Array.isArray(employeeIds) ? employeeIds : null,
        }),
    });
    return handle(res);
}
