import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// A tiny Google endpoint that returns 204 when internet works.
// We use mode:"no-cors" so CORS doesn't block it.
// If fetch RESOLVES => internet ok. If it REJECTS => no internet.
const INTERNET_PROBE_URL = "https://www.gstatic.com/generate_204";

function fetchWithTimeout(url, opts = {}, ms = 2500) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export default function OfflineBanner() {
    const [offline, setOffline] = useState(false);
    const timerRef = useRef(null);

    async function checkInternet() {
        try {
            // If there is no network at all, this will reject quickly
            await fetchWithTimeout(
                `${INTERNET_PROBE_URL}?t=${Date.now()}`,
                { mode: "no-cors", cache: "no-store" },
                2500
            );
            return true;
        } catch {
            return false;
        }
    }

    async function checkBackend() {
        try {
            const res = await fetchWithTimeout(
                `${API_BASE}/ping?t=${Date.now()}`,
                { cache: "no-store" },
                2500
            );
            return !!res && res.ok;
        } catch {
            return false;
        }
    }

    async function checkAll() {
        // quick path: browser says offline
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            setOffline(true);
            return;
        }

        const [internetOk, backendOk] = await Promise.all([checkInternet(), checkBackend()]);

        // show banner if EITHER internet is down OR backend is unreachable
        setOffline(!internetOk || !backendOk);
    }

    useEffect(() => {
        checkAll();

        const onFocus = () => checkAll();
        window.addEventListener("focus", onFocus);

        timerRef.current = setInterval(checkAll, 4000);

        return () => {
            window.removeEventListener("focus", onFocus);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    if (!offline) return null;

    // Small pill banner (aesthetic)
    return (
        <div className="fixed top-2 left-1/2 z-[99999] -translate-x-1/2">
            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900 shadow-sm">
                <div className="text-xs font-semibold leading-none">You’re offline.</div>
            </div>
        </div>
    );
}