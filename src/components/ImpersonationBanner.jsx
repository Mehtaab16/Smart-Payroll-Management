// src/components/ImpersonationBanner.jsx
import { useEffect, useState } from "react";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function readUser() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
        return {};
    }
}

export default function ImpersonationBanner({ className = "" }) {
    const [user, setUser] = useState(() => readUser());

    useEffect(() => {
        function sync() {
            setUser(readUser());
        }
        window.addEventListener("storage", sync);
        window.addEventListener("user:updated", sync);
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("user:updated", sync);
        };
    }, []);

    const isImpersonating = !!user?.impersonating;
    if (!isImpersonating) return null;

    function stop() {
        const adminToken = localStorage.getItem("imp_admin_token");
        const adminUserRaw = localStorage.getItem("imp_admin_user");

        if (adminToken && adminUserRaw) {
            localStorage.setItem("token", adminToken);
            localStorage.setItem("user", adminUserRaw);
        }

        localStorage.removeItem("imp_admin_token");
        localStorage.removeItem("imp_admin_user");

        // ✅ dispatch update event so layouts re-render if needed
        window.dispatchEvent(new Event("user:updated"));

        // ✅ redirect back to correct home based on restored admin user
        let home = "/dashboard";
        try {
            const adminUser = adminUserRaw ? JSON.parse(adminUserRaw) : {};
            const r = adminUser?.role;
            if (r === "admin" || r === "payroll_manager") home = "/pm/dashboard";
        } catch { }

        window.location.href = home;
    }

    return (
        <div
            className={cn(
                "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3",
                className
            )}
        >
            <div className="min-w-0">
                <div className="font-semibold">Impersonation mode is ON</div>
                <div className="text-xs text-amber-800 truncate">
                    You are viewing as <span className="font-semibold">{user?.role}</span> • {user?.email}
                </div>
            </div>

            <button
                type="button"
                onClick={stop}
                className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold border border-amber-300 bg-white hover:bg-amber-100"
            >
                Stop
            </button>
        </div>
    );
}
