const BASE = "http://localhost:5000/api/employees";

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

/** Admin/PM list (will 403 for employee — normal) */
export async function listEmployees() {
    const res = await fetch(`${BASE}`, { headers: authHeaders() });
    return handle(res);
}

/** ✅ Employee-safe delegate list */
export async function listDelegates() {
    const res = await fetch(`${BASE}/delegates`, { headers: authHeaders() });
    return handle(res);
}

export async function createEmployee(payload) {
    const res = await fetch(`${BASE}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return handle(res);
}

export async function updateEmployee(id, payload) {
    const res = await fetch(`${BASE}/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return handle(res);
}

export async function deactivateEmployee(id) {
    const res = await fetch(`${BASE}/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    return handle(res);
}

export async function activateEmployee(id) {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:5000/api/employees/${id}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.message || "Failed to activate employee");
    return j;
}

export async function terminateEmployee(id, terminationDate) {
    const res = await fetch(`${BASE}/${id}/terminate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ terminationDate }),
    });
    return handle(res);
}

export async function rehireEmployee(id, rehireDate) {
    const res = await fetch(`${BASE}/${id}/rehire`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ rehireDate }),
    });
    return handle(res);
}

export async function bulkAddEmployees(csvText) {
    const res = await fetch(`${BASE}/bulk`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ csvText }),
    });
    return handle(res);
}
