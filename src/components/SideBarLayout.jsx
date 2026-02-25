// src/components/SideBarLayout.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import OfflineBanner from "./OfflineBanner.jsx"; // ✅ keep only this (no duplicate function)

/* ✅ APIs for employee badges */
import { getSupportTickets } from "../api/supportApi.js";
import { getMyLeave } from "../api/leaveApi.js";
import { getMyOvertime } from "../api/overtimeApi.js";

import ImpersonationBanner from "./ImpersonationBanner.jsx";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function normalizePrefs(p) {
    const obj = p && typeof p === "object" ? p : {};
    return {
        darkMode: obj.darkMode === false ? false : true,
        largeText: obj.largeText === true,
        notifications: obj.notifications === false ? false : true,
        highContrast: obj.highContrast === true,
    };
}

function readUserSafe() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}") || {};
    } catch {
        return {};
    }
}

function readPrefsSafe() {
    // user first
    try {
        const u = readUserSafe();
        if (u?.accessibilityPrefs) return normalizePrefs(u.accessibilityPrefs);
    } catch { }

    // fallback local key
    try {
        const raw = localStorage.getItem("accessibility_prefs");
        if (!raw) return null;
        return normalizePrefs(JSON.parse(raw));
    } catch {
        return null;
    }
}

/* ---------------- badge helpers ---------------- */
function asArray(x) {
    if (Array.isArray(x)) return x;
    if (Array.isArray(x?.items)) return x.items;
    if (Array.isArray(x?.data)) return x.data;
    if (Array.isArray(x?.tickets)) return x.tickets;
    if (Array.isArray(x?.results)) return x.results;
    return [];
}

function isFinalStatus(s) {
    const v = String(s || "").toLowerCase().trim();
    return [
        "closed",
        "resolved",
        "completed",
        "done",
        "cancelled",
        "canceled",
        "rejected",
        "declined",
        "accepted",
        "approved",
        "archived",
    ].includes(v);
}

function CountBadge({ count, isDark }) {
    const n = Number(count || 0) || 0;
    if (n <= 0) return null;

    const label = n > 99 ? "99+" : String(n);

    return (
        <span
            className={cn(
                "ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                isDark ? "bg-rose-300 text-slate-900" : "bg-rose-600 text-white"
            )}
            aria-label={`${n} pending`}
            title={`${n} pending`}
        >
            {label}
        </span>
    );
}

export default function SideBarLayout({ title, children, noScroll = false, hideWelcome = false }) {
    const navigate = useNavigate();

    const [user, setUser] = useState(() => readUserSafe());
    const [prefs, setPrefs] = useState(() => readPrefsSafe() || normalizePrefs(null));

    const displayName =
        user?.fullName || user?.name || (user?.email ? user.email.split("@")[0] : "Employee");

    const email = user?.email || "employee@test.com";
    const photo = user?.profilePhotoUrl || user?.avatarUrl || "";

    const [confirmLogout, setConfirmLogout] = useState(false);

    const [badgeCounts, setBadgeCounts] = useState({
        support: 0,
        leave: 0,
        overtime: 0,
    });

    function doLogout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("accessibility_prefs");
        navigate("/login");
    }

    useEffect(() => {
        function syncFromStorage() {
            setUser(readUserSafe());
            const nextPrefs = readPrefsSafe();
            setPrefs(nextPrefs || normalizePrefs(null));
        }

        syncFromStorage();

        window.addEventListener("storage", syncFromStorage);
        window.addEventListener("accessibility:prefs", syncFromStorage);
        window.addEventListener("user:updated", syncFromStorage);

        return () => {
            window.removeEventListener("storage", syncFromStorage);
            window.removeEventListener("accessibility:prefs", syncFromStorage);
            window.removeEventListener("user:updated", syncFromStorage);
        };
    }, []);

    useEffect(() => {
        document.documentElement.style.fontSize = prefs.largeText ? "18px" : "16px";
        document.documentElement.style.filter = prefs.highContrast ? "contrast(1.15)" : "";

        if (prefs.darkMode) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }, [prefs.largeText, prefs.highContrast, prefs.darkMode]);

    const isDark = !!prefs.darkMode;
    const largeText = !!prefs.largeText;
    const highContrast = !!prefs.highContrast;

    const shellClass = cn(
        "min-h-screen",
        isDark
            ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
            : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900",
        largeText ? "text-[115%]" : "",
        highContrast ? "contrast-125" : ""
    );

    const panelClass = isDark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white";
    const mainClass = isDark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white";

    const navInactive = isDark ? "text-white/80 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100";
    const navActive = isDark ? "bg-white/15 text-white" : "bg-slate-100 text-slate-900";

    async function refreshBadges() {
        try {
            const [ticketsRaw, leaveRaw, overtimeRaw] = await Promise.all([
                getSupportTickets().catch(() => []),
                getMyLeave().catch(() => []),
                getMyOvertime().catch(() => []),
            ]);

            const tickets = asArray(ticketsRaw);
            const leaves = asArray(leaveRaw);
            const overtime = asArray(overtimeRaw);

            const supportCount = tickets.filter((t) => !isFinalStatus(t?.status)).length;
            const leaveCount = leaves.filter((r) => !isFinalStatus(r?.status)).length;
            const overtimeCount = overtime.filter((r) => !isFinalStatus(r?.status)).length;

            setBadgeCounts({
                support: supportCount,
                leave: leaveCount,
                overtime: overtimeCount,
            });
        } catch { }
    }

    useEffect(() => {
        refreshBadges();

        const t = setInterval(refreshBadges, 15000);
        function onFocus() {
            refreshBadges();
        }
        window.addEventListener("focus", onFocus);

        return () => {
            clearInterval(t);
            window.removeEventListener("focus", onFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <OfflineBanner />
                <div className={shellClass}>
                    <div className="mx-auto max-w-7xl px-4 py-4 min-h-screen">
                        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 min-h-[calc(100vh-2rem)]">
                            {/* Sidebar */}
                            <aside className={cn("rounded-[28px] p-4 flex flex-col", panelClass)}>
                                <div className="mb-3 flex items-center gap-3 px-2 min-w-0">
                                    <div className="h-20 w-20 shrink-0 flex items-center justify-center">
                                        <img src={logo} alt="AutoPay" className="max-h-16 max-w-16 object-contain" />
                                    </div>

                                    <div className="min-w-0">
                                        <div className={cn("font-semibold leading-tight truncate", isDark ? "text-white" : "text-slate-900")}>
                                            AutoPay
                                        </div>
                                        <div className={cn("text-xs truncate", isDark ? "text-white/60" : "text-slate-500")}>
                                            Employee Portal
                                        </div>
                                    </div>
                                </div>

                                <nav className="space-y-1">
                                    <NavLink
                                        to="/dashboard"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        Home
                                    </NavLink>

                                    <NavLink
                                        to="/documents"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        My Documents
                                    </NavLink>

                                    <NavLink
                                        to="/leave"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        <span className="inline-flex items-center">
                                            Leave Module
                                            <CountBadge count={badgeCounts.leave} isDark={isDark} />
                                        </span>
                                    </NavLink>

                                    <NavLink
                                        to="/overtime"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        <span className="inline-flex items-center">
                                            Overtime
                                            <CountBadge count={badgeCounts.overtime} isDark={isDark} />
                                        </span>
                                    </NavLink>

                                    <NavLink
                                        to="/progressions"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        Progressions
                                    </NavLink>

                                    <NavLink
                                        to="/support"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        <span className="inline-flex items-center">
                                            Support Requests
                                            <CountBadge count={badgeCounts.support} isDark={isDark} />
                                        </span>
                                    </NavLink>
                                </nav>

                                <div className={cn("my-4", isDark ? "border-t border-white/10" : "border-t border-slate-200")} />

                                <nav className="space-y-1">
                                    <NavLink
                                        to="/knowledge"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        Knowledge Hub
                                    </NavLink>

                                    <NavLink
                                        to="/accessibility"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        Accessibility
                                    </NavLink>
                                </nav>

                                <div className="mt-auto pt-4">
                                    <button
                                        onClick={() => setConfirmLogout(true)}
                                        className={cn(
                                            "w-full rounded-xl border px-4 py-2 text-sm transition",
                                            isDark
                                                ? "bg-white/10 hover:bg-white/15 border-white/10 text-white"
                                                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900"
                                        )}
                                        type="button"
                                    >
                                        Log Out
                                    </button>
                                </div>
                            </aside>

                            {/* Main */}
                            <main
                                className={cn(
                                    "rounded-[28px] p-5",
                                    mainClass,
                                    noScroll ? "h-[calc(100vh-2rem)] overflow-hidden" : ""
                                )}
                            >
                                {!hideWelcome && (
                                    <div className="mb-6 flex items-center justify-between gap-6">
                                        <div>
                                            <div className={cn("text-2xl font-semibold tracking-tight", isDark ? "text-white" : "text-slate-900")}>
                                                Welcome, {displayName}!
                                            </div>
                                            <div className={cn("text-sm", isDark ? "text-white/60" : "text-slate-500")}>
                                                Quick access to your documents and modules
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => navigate("/profile")}
                                            className={cn(
                                                "flex items-center gap-3 rounded-2xl border px-3 py-2 transition text-left",
                                                isDark
                                                    ? "border-white/10 bg-white/5 hover:bg-white/10"
                                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                            )}
                                            type="button"
                                            title="Open Profile"
                                        >
                                            {photo ? (
                                                <img
                                                    src={photo.startsWith("http") ? photo : `http://localhost:5000${photo}`}
                                                    alt="Profile"
                                                    className={cn(
                                                        "h-10 w-10 rounded-full object-cover border",
                                                        isDark ? "border-white/10 bg-white/10" : "border-slate-200 bg-slate-100"
                                                    )}
                                                />
                                            ) : (
                                                <div
                                                    className={cn(
                                                        "h-10 w-10 rounded-full border",
                                                        isDark ? "border-white/10 bg-white/10" : "border-slate-200 bg-slate-100"
                                                    )}
                                                />
                                            )}

                                            <div className="leading-tight">
                                                <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
                                                    {displayName}
                                                </div>
                                                <div className={cn("text-xs", isDark ? "text-white/60" : "text-slate-500")}>
                                                    {email}
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {title ? (
                                    <div className={cn("mb-4 text-lg font-semibold tracking-wide", isDark ? "text-white" : "text-slate-900")}>
                                        {title}
                                    </div>
                                ) : null}

                                {/* ✅ impersonation banner */}
                                <ImpersonationBanner className="mb-4" />

                                <div className={noScroll ? "h-full overflow-hidden" : ""}>{children}</div>
                            </main>
                        </div>
                    </div>

                    {/* Logout Confirmation Modal */}
                    {confirmLogout ? (
                        <div className="fixed inset-0 z-50">
                            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmLogout(false)} />

                            <div className="absolute left-1/2 top-1/2 w-[94vw] sm:w-[520px] -translate-x-1/2 -translate-y-1/2">
                                <div
                                    className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-lg font-semibold text-slate-900">Log out?</div>
                                            <div className="text-sm text-slate-600 mt-1">
                                                Are you sure you want to end your session?
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setConfirmLogout(false)}
                                            className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                                            type="button"
                                            aria-label="Close"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="p-6 flex items-center justify-end gap-3">
                                        <button
                                            onClick={() => setConfirmLogout(false)}
                                            className="rounded-xl px-4 py-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold"
                                            type="button"
                                        >
                                            Stay
                                        </button>

                                        <button
                                            onClick={doLogout}
                                            className="rounded-xl px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold"
                                            type="button"
                                        >
                                            Log out
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
        </>
    );
}