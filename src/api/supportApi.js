// client/src/api/supportApi.js
import { loadSnapshot, saveSnapshot } from "../utils/offlineStore.js";
import { enqueueOutboxItem } from "../utils/offlineOutbox.js";

const BASE = "http://localhost:5000/api/support";

/* ---------- auth ---------- */
function authHeaders() {
    const token = localStorage.getItem("token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
}

/* ---------- cache helpers ---------- */
async function setCache(key, value) {
    try {
        await saveSnapshot(key, value);
    } catch { }
}
async function getCache(key) {
    try {
        return await loadSnapshot(key);
    } catch {
        return null;
    }
}

function listCacheKey({ q = "", type = "", status = "" } = {}) {
    return `support_tickets:${q || "-"}:${type || "-"}:${status || "-"}`;
}

/* ---------- LIST ---------- */
export async function getSupportTickets({ q = "", type = "", status = "" } = {}) {
    const url = new URL(`${BASE}/tickets`);
    if (q) url.searchParams.set("q", q);
    if (type) url.searchParams.set("type", type);
    if (status) url.searchParams.set("status", status);

    const CACHE_KEY = listCacheKey({ q, type, status });

    try {
        const res = await fetch(url.toString(), { headers: authHeaders() });
        const data = await parse(res);
        await setCache(CACHE_KEY, data);
        return data;
    } catch (e) {
        const cached = await getCache(CACHE_KEY);
        if (cached) return cached;
        throw e;
    }
}

/* ---------- SINGLE ---------- */
export async function getSupportTicketById(id) {
    const CACHE_KEY = `support_ticket:${id}`;

    try {
        const res = await fetch(`${BASE}/tickets/${id}`, { headers: authHeaders() });
        const data = await parse(res);
        await setCache(CACHE_KEY, data);
        return data;
    } catch (e) {
        const cached = await getCache(CACHE_KEY);
        if (cached) return cached;
        throw e;
    }
}

export async function updateSupportTicket(id, payload) {
    const res = await fetch(`${BASE}/tickets/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return parse(res);
}

/* ---------- CREATE (queued offline) ---------- */
export async function createSupportTicket(payload) {
    const { type, title, description, priority, dueDate, files = [] } = payload;

    // backend ignores employeeNumber/email (it reads from token user), so no need to send them
    const fields = {
        type,
        title,
        description: description || "",
        priority: priority || "low",
        dueDate: dueDate || "",
    };

    const url = `${BASE}/tickets`;

    // ✅ offline => queue + return queued
    if (!navigator.onLine) {
        const row = await enqueueOutboxItem({
            module: "support",
            url,
            method: "POST",
            headers: authHeaders(),
            bodyType: "form",
            fields,
            files, // can be []
        });
        return { queued: true, queueId: row.id };
    }

    // online send now
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        fd.append(k, String(v));
    });
    for (const f of files) fd.append("files", f);

    try {
        const res = await fetch(url, { method: "POST", headers: authHeaders(), body: fd });
        return await parse(res);
    } catch (e) {
        // network error => queue fallback
        const row = await enqueueOutboxItem({
            module: "support",
            url,
            method: "POST",
            headers: authHeaders(),
            bodyType: "form",
            fields,
            files,
        });
        return { queued: true, queueId: row.id };
    }
}

/* ---------- MESSAGE (queued offline) ---------- */
export async function sendSupportMessage(id, { text = "", files = [] }) {
    const url = `${BASE}/tickets/${id}/messages`;

    const fields = { text };

    if (!navigator.onLine) {
        const row = await enqueueOutboxItem({
            module: "support",
            url,
            method: "POST",
            headers: authHeaders(),
            bodyType: "form",
            fields,
            files,
        });
        return { queued: true, queueId: row.id };
    }

    const fd = new FormData();
    fd.append("text", text || "");
    for (const f of files) fd.append("files", f);

    try {
        const res = await fetch(url, { method: "POST", headers: authHeaders(), body: fd });
        return await parse(res);
    } catch (e) {
        const row = await enqueueOutboxItem({
            module: "support",
            url,
            method: "POST",
            headers: authHeaders(),
            bodyType: "form",
            fields,
            files,
        });
        return { queued: true, queueId: row.id };
    }
}

/* ---------- DELETE (queued offline) ---------- */
export async function deleteSupportTicket(id) {
    const url = `${BASE}/tickets/${id}`;

    if (!navigator.onLine) {
        const row = await enqueueOutboxItem({
            module: "support",
            url,
            method: "DELETE",
            headers: authHeaders(),
            bodyType: "raw",
            body: null,
        });
        return { queued: true, queueId: row.id };
    }

    try {
        const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
        return await parse(res);
    } catch (e) {
        const row = await enqueueOutboxItem({
            module: "support",
            url,
            method: "DELETE",
            headers: authHeaders(),
            bodyType: "raw",
            body: null,
        });
        return { queued: true, queueId: row.id };
    }
}