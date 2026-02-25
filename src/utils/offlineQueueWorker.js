// client/src/utils/offlineQueueWorker.js
import { listQueue, syncQueue } from "./offlineQueue.js";
import { flushOutbox, listOutboxItems } from "./offlineOutbox.js";

let started = false;

function getModulesFromQueue(items) {
    const mods = new Set();
    for (const it of items || []) {
        const tag = String(it?.tag || "");
        const mod = tag.split(":")[0];
        if (mod) mods.add(mod);
    }
    return Array.from(mods);
}

function getModulesFromOutbox(items) {
    const mods = new Set();
    for (const it of items || []) {
        const mod = String(it?.module || "").trim();
        if (mod) mods.add(mod);
    }
    return Array.from(mods);
}

export function startOfflineQueueWorker({ intervalMs = 8000 } = {}) {
    if (started) return;
    started = true;

    async function flushNow() {
        if (!navigator.onLine) return;

        // ✅ gather modules BEFORE flushing (so we know what to refresh)
        const qItems = await listQueue();
        const oItems = await listOutboxItems();

        const modules = Array.from(
            new Set([
                ...getModulesFromQueue(qItems),
                ...getModulesFromOutbox(oItems),
            ])
        );

        // ✅ flush both systems
        const { synced } = await syncQueue({ max: 50 });
        const out = await flushOutbox({ max: 25 });

        const didFlush = (synced || 0) > 0 || (out?.flushed || 0) > 0;
        if (didFlush) {
            window.dispatchEvent(new CustomEvent("outbox:flushed", { detail: { modules } }));
        }
    }

    window.addEventListener("online", flushNow);
    setInterval(flushNow, intervalMs);
    flushNow();
}