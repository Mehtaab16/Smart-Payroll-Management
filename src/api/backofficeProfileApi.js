// client/src/api/backofficeProfileApi.js
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

export async function getMyProfileBO() {
    const r = await fetch(`${API}/api/users/me`, {
        headers: authHeaders(true),
    });
    return readJson(r);
}

// ✅ PM/Admin direct edit (PATCH /api/users/me)
export async function updateMyProfileBO(patch) {
    const r = await fetch(`${API}/api/users/me`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(patch || {}),
    });
    return readJson(r);
}

export async function uploadAvatarBO(file) {
    const token = localStorage.getItem("token") || "";
    const fd = new FormData();
    fd.append("avatar", file);

    const r = await fetch(`${API}/api/users/me/avatar`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
    });

    return readJson(r);
}

export async function deleteAvatarBO() {
    const r = await fetch(`${API}/api/users/me/avatar`, {
        method: "DELETE",
        headers: authHeaders(true),
    });
    return readJson(r);
}
