// client/src/utils/offlineFetch.js
import { saveSnapshot, loadSnapshot } from "../utils/offlineStore.js";

// ✅ supports BOTH call styles:
// 1) offlineGetJson({ url, headers, cacheKey })
// 2) offlineGetJson(url, headers, cacheKey)
export async function offlineGetJson(a, b, c) {
    const opts =
        typeof a === "string"
            ? { url: a, headers: b || {}, cacheKey: c }
            : (a || {});

    const { url, headers = {}, cacheKey } = opts;

    if (!url) throw new Error("offlineGetJson: url is required");
    if (!cacheKey) throw new Error("offlineGetJson: cacheKey is required");

    try {
        const r = await fetch(url, { headers });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.message || "Request failed");

        await saveSnapshot(cacheKey, data);
        return data;
    } catch (e) {
        const cached = await loadSnapshot(cacheKey);
        if (cached) return cached; // ✅ offline fallback
        throw e;
    }
}