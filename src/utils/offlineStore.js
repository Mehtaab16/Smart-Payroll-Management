import { openDB } from "idb";

const DB_NAME = "autopay_offline_v2"; // ✅ NEW DB (avoid old broken schema)
const STORE = "snapshots";
const DB_VERSION = 1;

const dbp = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
        // ✅ snapshots is a KEY-VALUE store (string key -> any value)
        if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
        }

        // ✅ also ensure queue exists (so whichever file opens first, DB is correct)
        if (!db.objectStoreNames.contains("queue")) {
            db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
        }
    },
});

function assertKey(key) {
    return typeof key === "string" && key.trim().length > 0;
}

export async function saveSnapshot(key, value) {
    if (!assertKey(key)) return;
    const db = await dbp;
    // store wrapper for meta
    await db.put(STORE, { value, savedAt: Date.now() }, key);
}

export async function loadSnapshot(key) {
    if (!assertKey(key)) return null;
    const db = await dbp;
    const row = await db.get(STORE, key);
    return row ? row.value : null;
}

export async function loadSnapshotMeta(key) {
    if (!assertKey(key)) return null;
    const db = await dbp;
    return (await db.get(STORE, key)) || null;
}