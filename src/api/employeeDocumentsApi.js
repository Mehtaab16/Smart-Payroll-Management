const BASE = "http://localhost:5000/api/employee-documents";

function authHeadersForm() {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
}

function authHeadersJson() {
    const token = localStorage.getItem("token");
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handle(res) {
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
    return data;
}

// ✅ Employee: list MY documents (new)
export async function listMyEmployeeDocuments() {
    const res = await fetch(`${BASE}/mine`, { headers: authHeadersJson() });
    return handle(res);
}

// ✅ Admin/PM: Backend route is /by-employee/:employeeId
export async function listEmployeeDocuments(employeeId) {
    const res = await fetch(`${BASE}/by-employee/${employeeId}`, { headers: authHeadersJson() });
    return handle(res);
}

export async function uploadEmployeeDocument({ file, employeeIds, category, title, period }) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("employeeIds", JSON.stringify(employeeIds || []));
    if (category) fd.append("category", category);
    if (title) fd.append("title", title);
    if (period) fd.append("period", period);

    const res = await fetch(`${BASE}`, {
        method: "POST",
        headers: authHeadersForm(), // ✅ don't set content-type manually
        body: fd,
    });
    return handle(res);
}

export async function deleteEmployeeDocument(id) {
    const res = await fetch(`${BASE}/${id}`, {
        method: "DELETE",
        headers: authHeadersJson(),
    });
    return handle(res);
}
