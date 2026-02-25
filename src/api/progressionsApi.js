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

/* Projects */
export async function getMyProjects() {
    const res = await fetch(`${BASE}/projects/mine`, { headers: authHeaders() });
    return handle(res);
}
export async function createProject(payload) {
    const res = await fetch(`${BASE}/projects`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handle(res);
}
export async function updateProject(id, payload) {
    const res = await fetch(`${BASE}/projects/${id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return handle(res);
}
export async function deleteProject(id) {
    const res = await fetch(`${BASE}/projects/${id}`, { method: "DELETE", headers: authHeaders() });
    return handle(res);
}

/* CV */
export async function getMyCv() {
    const res = await fetch(`${BASE}/cv`, { headers: authHeaders() });
    return handle(res);
}
export async function uploadCv(file) {
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`${BASE}/cv`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
    });
    return handle(res);
}

/* Certificates */
export async function getMyCertificates() {
    const res = await fetch(`${BASE}/certificates/mine`, { headers: authHeaders() });
    return handle(res);
}
export async function uploadCertificate({ file, title }) {
    const fd = new FormData();
    fd.append("file", file);
    if (title) fd.append("title", title);

    const res = await fetch(`${BASE}/certificates`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
    });
    return handle(res);
}
export async function deleteCertificate(id) {
    const res = await fetch(`${BASE}/certificates/${id}`, { method: "DELETE", headers: authHeaders() });
    return handle(res);
}

/* Summary */
export async function getProgressionsSummary() {
    const res = await fetch(`${BASE}/summary`, { headers: authHeaders() });
    return handle(res);
}
