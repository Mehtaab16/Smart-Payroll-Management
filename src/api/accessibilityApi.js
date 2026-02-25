// client/src/api/accessibilityApi.js
const BASE = "http://localhost:5000";

async function jfetch(path, { method = "GET", body } = {}) {
    const token = localStorage.getItem("token");
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Request failed (${r.status})`);
    return j;
}

// ✅ Matches server/routes/users.js
export function getMyAccessibilityPrefs() {
    return jfetch("/api/users/me/accessibility");
}

// ✅ Server uses PUT (not PATCH)
export function updateMyAccessibilityPrefs(prefs) {
    return jfetch("/api/users/me/accessibility", { method: "PUT", body: prefs });
}
