const BASE = "http://localhost:5000";

function authHeaders() {
    const token = localStorage.getItem("token");
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

// ✅ logs ABOUT me (subjectId = me)
export async function getMyAuditLogs({ limit = 50, module = "" } = {}) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    if (module) qs.set("module", module);

    const r = await fetch(`${BASE}/api/audit/mine?${qs.toString()}`, {
        headers: authHeaders(),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Failed to load logs (${r.status})`);
    return j;
}

// ✅ NEW: logs DONE BY me (actorId = me)
export async function getMyActionLogs({ limit = 80, module = "" } = {}) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    if (module) qs.set("module", module);

    const r = await fetch(`${BASE}/api/audit/my-actions?${qs.toString()}`, {
        headers: authHeaders(),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Failed to load logs (${r.status})`);
    return j;
}
