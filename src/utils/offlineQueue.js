import { openDB } from "idb";

const DB_NAME = "autopay_offline_v2"; // ✅ MUST MATCH offlineStore.js
const STORE = "queue";
const DB_VERSION = 1;

const dbp = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
        // ✅ queue store
        if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }

        // ✅ snapshots store (key-value)
        if (!db.objectStoreNames.contains("snapshots")) {
            db.createObjectStore("snapshots");
        }
    },
});

function isOnlineNow() {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function serializeBody(body) {
    if (body == null) return { bodyType: "none", bodyData: null };

    // ✅ if you pass object => store as json object (not string)
    if (typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
        return { bodyType: "json", bodyData: body };
    }

    if (body instanceof FormData) {
        const entries = [];
        for (const [k, v] of body.entries()) entries.push([k, v]);
        return { bodyType: "formdata", bodyData: entries };
    }

    if (typeof body === "string") {
        // if someone sends JSON string, store it as text
        return { bodyType: "text", bodyData: body };
    }

    return { bodyType: "unknown", bodyData: null };
}

function rebuildBody(item) {
    const { bodyType, bodyData } = item || {};
    if (bodyType === "none") return null;
    if (bodyType === "json") return JSON.stringify(bodyData || {});
    if (bodyType === "text") return String(bodyData ?? "");
    if (bodyType === "formdata") {
        const fd = new FormData();
        for (const [k, v] of bodyData || []) fd.append(k, v);
        return fd;
    }
    return null;
}

function cleanHeadersForQueue(headers) {
    const h = { ...(headers || {}) };
    for (const k of Object.keys(h)) {
        if (h[k] == null || h[k] === "") delete h[k];
    }
    return h;
}

function bodyTypeHasBody(t) {
    return t === "json" || t === "text" || t === "formdata";
}

export async function enqueueRequest({ url, method = "POST", headers = {}, body = null, tag = "" }) {
    const db = await dbp;

    const { bodyType, bodyData } = serializeBody(body);

    const item = {
        url,
        method,
        headers: cleanHeadersForQueue(headers),
        bodyType,
        bodyData,
        tag,
        createdAt: Date.now(),
        attempts: 0,
        lastError: "",
    };

    const id = await db.add(STORE, item);

    try {
        window.dispatchEvent(new CustomEvent("outbox:queued", { detail: { tag, id } }));
    } catch { }

    return id;
}

export async function listQueue() {
    const db = await dbp;
    return await db.getAll(STORE);
}

export async function removeQueued(id) {
    const db = await dbp;
    await db.delete(STORE, id);
}

export async function syncQueue({ max = 50 } = {}) {
    if (!isOnlineNow()) return { synced: 0, remaining: 0 };

    const db = await dbp;
    const all = await db.getAll(STORE);
    all.sort((a, b) => (a.id || 0) - (b.id || 0));

    let synced = 0;

    for (const item of all.slice(0, max)) {
        if (!isOnlineNow()) break;

        try {
            const body = rebuildBody(item);
            const headers = { ...(item.headers || {}) };

            if (item.bodyType === "json") headers["Content-Type"] = "application/json";
            if (item.bodyType === "formdata" && "Content-Type" in headers) delete headers["Content-Type"];

            const res = await fetch(item.url, {
                method: item.method,
                headers,
                body: bodyTypeHasBody(item.bodyType) ? body : undefined,
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                item.attempts = (item.attempts || 0) + 1;
                item.lastError = `HTTP ${res.status} ${txt}`.slice(0, 500);
                await db.put(STORE, item);
                continue;
            }

            await db.delete(STORE, item.id);
            synced++;
        } catch (e) {
            item.attempts = (item.attempts || 0) + 1;
            item.lastError = String(e?.message || e).slice(0, 500);
            await db.put(STORE, item);
            break;
        }
    }

    const remaining = (await db.getAllKeys(STORE)).length;

    if (synced > 0) {
        const modules = Array.from(
            new Set(
                all
                    .slice(0, max)
                    .map((x) => String(x.tag || "").split(":")[0])
                    .filter(Boolean)
            )
        );

        try {
            window.dispatchEvent(new CustomEvent("outbox:flushed", { detail: { modules } }));
        } catch { }
    }

    return { synced, remaining };
}