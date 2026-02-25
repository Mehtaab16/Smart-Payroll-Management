// client/src/api/overtimeApi.js
import { offlineGetJson } from "../utils/offlineFetch.js";
import { loadSnapshot, saveSnapshot } from "../utils/offlineStore.js";
import { enqueueOutboxItem } from "../utils/offlineOutbox.js";

const BASE = "http://localhost:5000/api/overtime";

/* ---------- auth ---------- */
function authHeaders(json = true) {
    const token = localStorage.getItem("token") || "";
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
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

/* ---------- cache helpers ---------- */
async function readCache(key, fallback) {
    try {
        const v = await loadSnapshot(key);
        return v ?? fallback;
    } catch {
        return fallback;
    }
}

async function writeCache(key, value) {
    try {
        await saveSnapshot(key, value);
    } catch {
        // ignore cache errors
    }
}

function listKey(month) {
    return `overtime:mine:${month || "all"}`;
}
function summaryKey(month) {
    return `overtime:summary:${month || "all"}`;
}

function makeLocalId() {
    return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/* =========================
   READ (OFFLINE SAFE)
========================= */

export async function getMyOvertime(month) {
    const q = month ? `?month=${encodeURIComponent(month)}` : "";
    const url = `${BASE}/mine${q}`;
    const key = listKey(month);
    return offlineGetJson(url, authHeaders(false), key);
}

export async function getOvertimeSummary(month) {
    const q = month ? `?month=${encodeURIComponent(month)}` : "";
    const url = `${BASE}/summary${q}`;
    const key = summaryKey(month);
    return offlineGetJson(url, authHeaders(false), key);
}

/* =========================
   WRITE OPS (QUEUE WHEN OFFLINE)
   ✅ FIXED: if fetch fails (DevTools offline / network error), we ALSO queue
========================= */

async function queueCreateOvertime(payload) {
    const month = String(payload?.date || "").slice(0, 7) || "all";
    const key = listKey(month);
    const sumKey = summaryKey(month);

    const localRow = {
        id: makeLocalId(),
        date: payload.date,
        startTime: payload.startTime || "",
        endTime: payload.endTime || "",
        hours: Number(payload.hours) || 0,
        reason: String(payload.reason || ""),
        status: "inprogress",
        managerNote: "",
        createdAt: new Date().toISOString(),
        _pending: true,
        _pendingAction: "create",
    };

    await enqueueOutboxItem({
        module: "overtime",
        action: "create",
        url: `${BASE}`,
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
        meta: { localId: localRow.id, month },
    });

    const existing = await readCache(key, []);
    const next = Array.isArray(existing) ? [localRow, ...existing] : [localRow];
    await writeCache(key, next);

    const s = await readCache(sumKey, { totalHours: 0, pendingCount: 0 });
    await writeCache(sumKey, {
        totalHours: Math.round(((Number(s.totalHours) || 0) + (Number(localRow.hours) || 0)) * 100) / 100,
        pendingCount: (Number(s.pendingCount) || 0) + 1,
    });

    return { queued: true, item: localRow };
}

export async function createOvertime(payload) {
    // If definitely offline -> queue
    if (!navigator.onLine) {
        return queueCreateOvertime(payload);
    }

    // Try online fetch. If NETWORK fails -> queue. (Do NOT queue on 400/validation)
    let res;
    try {
        res = await fetch(`${BASE}`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        });
    } catch {
        return queueCreateOvertime(payload);
    }

    return handle(res);
}

async function queueUpdateOvertime(id, payload) {
    const month = String(payload?.date || "").slice(0, 7) || "all";
    const key = listKey(month);

    await enqueueOutboxItem({
        module: "overtime",
        action: "update",
        url: `${BASE}/${id}`,
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
        meta: { id, month },
    });

    const existing = await readCache(key, []);
    const next = (Array.isArray(existing) ? existing : []).map((r) => {
        if (String(r.id) !== String(id)) return r;
        return {
            ...r,
            ...payload,
            hours: payload.hours != null ? Number(payload.hours) : r.hours,
            _pending: true,
            _pendingAction: "update",
        };
    });

    await writeCache(key, next);
    const updated = next.find((r) => String(r.id) === String(id)) || { ok: true, _pending: true };
    return { queued: true, item: updated };
}

export async function updateOvertime(id, payload) {
    if (!navigator.onLine) {
        return queueUpdateOvertime(id, payload);
    }

    let res;
    try {
        res = await fetch(`${BASE}/${id}`, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        });
    } catch {
        return queueUpdateOvertime(id, payload);
    }

    return handle(res);
}

async function queueDeleteOvertime(id, { month } = {}) {
    const key = listKey(month || "all");
    const sumKey = summaryKey(month || "all");

    await enqueueOutboxItem({
        module: "overtime",
        action: "delete",
        url: `${BASE}/${id}`,
        method: "DELETE",
        headers: authHeaders(false),
        meta: { id, month: month || "all" },
    });

    const existing = await readCache(key, []);
    const arr = Array.isArray(existing) ? existing : [];
    const removed = arr.find((r) => String(r.id) === String(id));
    const next = arr.filter((r) => String(r.id) !== String(id));
    await writeCache(key, next);

    if (removed) {
        const s = await readCache(sumKey, { totalHours: 0, pendingCount: 0 });
        const hours = Number(removed.hours) || 0;

        await writeCache(sumKey, {
            totalHours: Math.round(((Number(s.totalHours) || 0) - hours) * 100) / 100,
            pendingCount: Math.max(0, (Number(s.pendingCount) || 0) - 1),
        });
    }

    return { queued: true };
}

export async function deleteOvertime(id, { month } = {}) {
    if (!navigator.onLine) {
        return queueDeleteOvertime(id, { month });
    }

    let res;
    try {
        res = await fetch(`${BASE}/${id}`, {
            method: "DELETE",
            headers: authHeaders(false),
        });
    } catch {
        return queueDeleteOvertime(id, { month });
    }

    return handle(res);
}

/* =========================
   PM/ADMIN READ (OFFLINE SAFE)
========================= */

export async function getOvertimeApprovals({ status = "pending" } = {}) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);

    const url = `${BASE}/approvals?${qs.toString()}`;
    const key = `overtime:approvals:${status || "all"}`;
    return offlineGetJson(url, authHeaders(false), key);
}