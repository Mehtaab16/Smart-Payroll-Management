// client/src/api/leaveApi.js
import { offlineGetJson } from "../utils/offlineFetch.js";
import { enqueueRequest } from "../utils/offlineQueue.js";

const BASE = "http://localhost:5000/api/leave";

/* ---------- auth ---------- */
function authHeaders(isJson = true) {
    const token = localStorage.getItem("token") || "";
    const h = {};
    if (isJson) h["Content-Type"] = "application/json";
    if (token) h.Authorization = `Bearer ${token}`;
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

/* =========================
   EMPLOYEE READ (OFFLINE SAFE)
========================= */

export async function getMyLeave() {
    return offlineGetJson(`${BASE}/mine`, authHeaders(false), "leave:mine");
}

export async function getLeaveBalance() {
    return offlineGetJson(`${BASE}/balance`, authHeaders(false), "leave:balance");
}

/* =========================
   WRITE OPS (OFFLINE QUEUE)
========================= */

export async function createLeave(payload) {
    const url = `${BASE}`;

    // offline: queue
    if (!navigator.onLine) {
        const qid = await enqueueRequest({
            url,
            method: "POST",
            headers: authHeaders(true),
            body: payload, // ✅ FIX: pass object so queue replays as JSON
            tag: "leave:create",
        });
        return { queued: true, queueId: qid };
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        });
        return await handle(res);
    } catch (e) {
        // network error -> queue as fallback
        const qid = await enqueueRequest({
            url,
            method: "POST",
            headers: authHeaders(true),
            body: payload, // ✅ FIX
            tag: "leave:create",
        });
        return { queued: true, queueId: qid };
    }
}

export async function updateLeave(id, payload) {
    const url = `${BASE}/${id}`;

    if (!navigator.onLine) {
        const qid = await enqueueRequest({
            url,
            method: "PUT",
            headers: authHeaders(true),
            body: payload, // ✅ FIX
            tag: "leave:update",
        });
        return { queued: true, queueId: qid };
    }

    try {
        const res = await fetch(url, {
            method: "PUT",
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        });
        return await handle(res);
    } catch (e) {
        const qid = await enqueueRequest({
            url,
            method: "PUT",
            headers: authHeaders(true),
            body: payload, // ✅ FIX
            tag: "leave:update",
        });
        return { queued: true, queueId: qid };
    }
}

export async function deleteLeave(id) {
    const url = `${BASE}/${id}`;

    if (!navigator.onLine) {
        const qid = await enqueueRequest({
            url,
            method: "DELETE",
            headers: authHeaders(false),
            body: null,
            tag: "leave:delete",
        });
        return { queued: true, queueId: qid };
    }

    try {
        const res = await fetch(url, {
            method: "DELETE",
            headers: authHeaders(false),
        });
        return await handle(res);
    } catch (e) {
        const qid = await enqueueRequest({
            url,
            method: "DELETE",
            headers: authHeaders(false),
            body: null,
            tag: "leave:delete",
        });
        return { queued: true, queueId: qid };
    }
}

/* =========================
   BACK OFFICE READ (OFFLINE SAFE)
========================= */

export async function getLeaveApprovals({ status = "inprogress" } = {}) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);

    return offlineGetJson(
        `${BASE}/approvals?${qs.toString()}`,
        authHeaders(false),
        `leave:approvals:${status}`
    );
}

/* =========================
   BACK OFFICE WRITE (OFFLINE QUEUE)
========================= */

export async function decideLeave(id, { status, note = "" }) {
    const url = `${BASE}/${id}/decision`;
    const payload = { status, note };

    if (!navigator.onLine) {
        const qid = await enqueueRequest({
            url,
            method: "PATCH",
            headers: authHeaders(true),
            body: payload, // ✅ FIX
            tag: "leave:decision",
        });
        return { queued: true, queueId: qid };
    }

    try {
        const res = await fetch(url, {
            method: "PATCH",
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        });
        return await handle(res);
    } catch (e) {
        const qid = await enqueueRequest({
            url,
            method: "PATCH",
            headers: authHeaders(true),
            body: payload, // ✅ FIX
            tag: "leave:decision",
        });
        return { queued: true, queueId: qid };
    }
}