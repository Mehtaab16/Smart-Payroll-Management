// client/src/api/reportsApi.js
const BASE = "http://localhost:5000/api/pm/reports";

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

export async function getReportPeriods() {
    const res = await fetch(`${BASE}/periods`, { headers: authHeaders() });
    return handle(res);
}

export async function getAuditReport({ period, module = "" }) {
    const qs = new URLSearchParams();
    qs.set("period", period);
    if (module) qs.set("module", module);
    const res = await fetch(`${BASE}/audit?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getPayrollSummaryReport({ period, status = "released" }) {
    const qs = new URLSearchParams();
    qs.set("period", period);
    qs.set("status", status);
    const res = await fetch(`${BASE}/payroll-summary?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getEmployeeWiseReport({ period }) {
    const qs = new URLSearchParams();
    qs.set("period", period);
    const res = await fetch(`${BASE}/employee-wise?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getPaycodesReport({ status = "all" }) {
    const qs = new URLSearchParams();
    qs.set("status", status);
    const res = await fetch(`${BASE}/paycodes?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getEmployeeSetupReport({ status = "all" }) {
    const qs = new URLSearchParams();
    qs.set("status", status);
    const res = await fetch(`${BASE}/employee-setup?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getPayrollRunsReport({ period }) {
    const qs = new URLSearchParams();
    qs.set("period", period);
    const res = await fetch(`${BASE}/payroll-runs?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getAnomaliesReport({ period, status = "all", severity = "" }) {
    const qs = new URLSearchParams();
    qs.set("period", period);
    qs.set("status", status);
    if (severity) qs.set("severity", severity);
    const res = await fetch(`${BASE}/anomalies?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}

export async function getEmailReport({ period, recipientType = "all", module = "", status = "all" }) {
    const qs = new URLSearchParams();
    if (period) qs.set("period", period);
    if (recipientType && recipientType !== "all") qs.set("recipientType", recipientType);
    if (module) qs.set("module", module);
    if (status && status !== "all") qs.set("status", status);

    const res = await fetch(`${BASE}/emails?${qs.toString()}`, {
        headers: authHeaders(),
    });
    return handle(res);
}


export async function getAccessRightsReport({ role = "all" }) {
    const qs = new URLSearchParams();
    qs.set("role", role);
    const res = await fetch(`${BASE}/access-rights?${qs.toString()}`, { headers: authHeaders() });
    return handle(res);
}
