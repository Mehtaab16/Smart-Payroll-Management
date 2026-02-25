// client/src/utils/offlineOutbox.js
import { loadSnapshot, saveSnapshot } from "./offlineStore.js";

const INDEX_KEY = "outbox:index:v1";

function makeId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function getIndex() {
    const idx = await loadSnapshot(INDEX_KEY);
    return Array.isArray(idx) ? idx : [];
}

async function setIndex(next) {
    await saveSnapshot(INDEX_KEY, next);
}

export async function enqueueOutboxItem(item) {
    const id = makeId();
    const row = { id, createdAt: Date.now(), tries: 0, ...item };

    await saveSnapshot(`outbox:item:${id}`, row);

    const idx = await getIndex();
    idx.push(id);
    await setIndex(idx);

    // ✅ notify UI
    try {
        window.dispatchEvent(new CustomEvent("outbox:queued", { detail: { module: item.module || "", id } }));
    } catch { }

    return row;
}

export async function listOutboxItems() {
    const idx = await getIndex();
    const rows = [];
    for (const id of idx) {
        const row = await loadSnapshot(`outbox:item:${id}`);
        if (row) rows.push(row);
    }
    rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return rows;
}

export async function removeOutboxItem(id) {
    const idx = await getIndex();
    const next = idx.filter((x) => x !== id);
    await setIndex(next);
}

function buildBody(it) {
    // JSON / raw
    if (!it.bodyType || it.bodyType === "raw") {
        return it.body || undefined;
    }

    // ✅ Form replay
    if (it.bodyType === "form") {
        const fd = new FormData();
        const fields = it.fields || {};
        for (const [k, v] of Object.entries(fields)) {
            if (v === undefined || v === null) continue;
            fd.append(k, String(v));
        }

        const files = Array.isArray(it.files) ? it.files : [];
        for (const f of files) {
            // f can be File/Blob (structured clone via IndexedDB is ok)
            // If it’s a Blob, filename may be missing — still uploads fine.
            fd.append("files", f, f?.name || f?.originalName || "upload");
        }

        return fd;
    }

    return it.body || undefined;
}

function buildHeaders(it) {
    const h = { ...(it.headers || {}) };

    // ✅ IMPORTANT: when using FormData, DO NOT set Content-Type
    if (it.bodyType === "form") {
        delete h["Content-Type"];
        delete h["content-type"];
    }

    return h;
}

export async function flushOutbox({ max = 25 } = {}) {
    const items = await listOutboxItems();
    const batch = items.slice(0, max);

    let done = 0;
    const modulesFlushed = new Set();

    for (const it of batch) {
        if (!navigator.onLine) break;

        try {
            const res = await fetch(it.url, {
                method: it.method,
                headers: buildHeaders(it),
                body: buildBody(it),
            });

            // 4xx => drop
            if (res.status >= 400 && res.status < 500) {
                await removeOutboxItem(it.id);
                done++;
                if (it.module) modulesFlushed.add(it.module);
                continue;
            }

            if (res.ok) {
                await removeOutboxItem(it.id);
                done++;
                if (it.module) modulesFlushed.add(it.module);
                continue;
            }

            // 5xx => stop and retry later
            break;
        } catch {
            break;
        }
    }

    if (done > 0 && typeof window !== "undefined") {
        const mods = Array.from(modulesFlushed);
        window.dispatchEvent(new CustomEvent("outbox:flushed", { detail: { flushed: done, modules: mods } }));
        for (const m of mods) {
            window.dispatchEvent(new CustomEvent(`outbox:flushed:${m}`, { detail: { flushed: done } }));
        }
    }

    return { flushed: done };
}