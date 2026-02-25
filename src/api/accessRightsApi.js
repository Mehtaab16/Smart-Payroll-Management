const BASE = "http://localhost:5000/api/access-rights";

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

export async function listAccessRights() {
  const res = await fetch(`${BASE}`, { headers: authHeaders() });
  return handle(res);
}

export async function createAccessRight(payload) {
  const res = await fetch(`${BASE}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function updateAccessRight(id, payload) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function resendAccessEmail(id) {
    const res = await fetch(`${BASE}/${id}/resend`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handle(res);
}


export async function deleteAccessRight(id) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}
