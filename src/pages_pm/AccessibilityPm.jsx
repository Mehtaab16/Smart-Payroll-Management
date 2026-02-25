import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { getMyAccessibilityPrefs, updateMyAccessibilityPrefs } from "../api/accessibilityApi.js";

const DEFAULT_PREFS = {
    darkMode: true,
    largeText: false,
    notifications: true,
    highContrast: false,
};

function normalize(p) {
    const obj = p && typeof p === "object" ? p : {};
    return {
        darkMode: obj.darkMode === false ? false : true,
        largeText: obj.largeText === true,
        notifications: obj.notifications === false ? false : true,
        highContrast: obj.highContrast === true,
    };
}

function readLocal() {
    try {
        const raw = localStorage.getItem("accessibility_prefs");
        if (!raw) return null;
        return normalize(JSON.parse(raw));
    } catch {
        return null;
    }
}

function writeLocal(prefs) {
    const safe = normalize(prefs);
    localStorage.setItem("accessibility_prefs", JSON.stringify(safe));

    try {
        const u = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...(u || {}), accessibilityPrefs: safe }));
    } catch { }

    window.dispatchEvent(new Event("user:updated"));
}

export default function AccessibilityPm() {
    const initial = useMemo(() => {
        try {
            const u = JSON.parse(localStorage.getItem("user") || "{}");
            if (u?.accessibilityPrefs) return normalize(u.accessibilityPrefs);
        } catch { }
        return readLocal() || DEFAULT_PREFS;
    }, []);

    const [prefs, setPrefs] = useState(normalize(initial));
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        document.documentElement.style.fontSize = prefs.largeText ? "18px" : "16px";
        document.documentElement.style.filter = prefs.highContrast ? "contrast(1.15)" : "";

        if (prefs.darkMode) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }, [prefs.largeText, prefs.highContrast, prefs.darkMode]);

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const db = await getMyAccessibilityPrefs();
                if (!alive) return;
                const safe = normalize(db);
                setPrefs(safe);
                writeLocal(safe);
            } catch {
                // keep local
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    async function toggle(key) {
        const next = normalize({ ...prefs, [key]: !prefs[key] });

        setPrefs(next);
        writeLocal(next);

        setSaving(true);
        setErr("");
        try {
            const saved = await updateMyAccessibilityPrefs(next);
            const safe = normalize(saved);
            setPrefs(safe);
            writeLocal(safe);
        } catch (e) {
            setErr(e?.message || "Failed to update accessibility");
        } finally {
            setSaving(false);
        }
    }

    return (
        <BackOfficeLayout title="Accessibility">
            <div className="rounded-[28px] bg-white border border-slate-200 p-6 space-y-6">
                <div>
                    <div className="text-2xl font-semibold text-slate-900">Preferences</div>
                    <div className="text-sm text-slate-600 mt-1">
                        These settings are saved to your account and will apply across Back Office.
                    </div>
                </div>

                {err ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                        {err}
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                    <Toggle title="Dark Mode" desc="Turn off to use Light Mode." value={prefs.darkMode} onClick={() => toggle("darkMode")} disabled={saving} />
                    <Toggle title="Large Text" desc="Increase text size for readability." value={prefs.largeText} onClick={() => toggle("largeText")} disabled={saving} />
                    <Toggle title="Notifications" desc="Enable payslip and support updates." value={prefs.notifications} onClick={() => toggle("notifications")} disabled={saving} />
                    <Toggle title="High Contrast" desc="Improve contrast for better visibility." value={prefs.highContrast} onClick={() => toggle("highContrast")} disabled={saving} />
                </div>
            </div>
        </BackOfficeLayout>
    );
}

function Toggle({ title, desc, value, onClick, disabled }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-start justify-between gap-4 shadow-sm">
            <div>
                <div className="font-semibold text-slate-900">{title}</div>
                <div className="text-sm text-slate-600 mt-1">{desc}</div>
            </div>

            <button
                onClick={onClick}
                disabled={disabled}
                className={[
                    "shrink-0 rounded-full w-12 h-7 border relative transition",
                    value ? "bg-slate-900 border-slate-900" : "bg-slate-200 border-slate-200",
                    disabled ? "opacity-60 cursor-not-allowed" : "hover:opacity-95",
                ].join(" ")}
                type="button"
                aria-pressed={value}
            >
                <span
                    className={[
                        "absolute top-1 h-5 w-5 rounded-full transition bg-white shadow",
                        value ? "left-6" : "left-1",
                    ].join(" ")}
                />
            </button>
        </div>
    );
}
