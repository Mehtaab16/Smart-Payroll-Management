// src/components/BackOfficeLayout.jsx
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import logo from "../assets/logo.png";

/* ✅ APIs for badges */
import { getSupportTickets } from "../api/supportApi.js";
import { getProfileChangeApprovals } from "../api/profileApi.js";
import { getLeaveApprovals } from "../api/leaveApi.js";
import { getOvertimeApprovals } from "../api/overtimeApi.js";
import { listAnomalies } from "../api/payrollAnomaliesApi.js";

import ImpersonationBanner from "./ImpersonationBanner.jsx";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function readUserSafe() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}") || {};
    } catch {
        return {};
    }
}

function readPrefsSafe() {
    try {
        const raw = localStorage.getItem("accessibility_prefs");
        const p = raw ? JSON.parse(raw) : {};
        return { darkMode: p?.darkMode !== false };
    } catch {
        return { darkMode: true };
    }
}

function roleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "payroll_manager") return "Payroll Manager";
    return "User";
}

/* ---------------- badge ui ---------------- */
function BadgeCount({ count, dark }) {
    const n = Number(count || 0);
    if (!n || n <= 0) return null;

    return (
        <span
            className={cn(
                "ml-2 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold leading-none",
                dark ? "bg-rose-300 text-slate-900" : "bg-rose-600 text-white"
            )}
            aria-label={`${n} pending`}
            title={`${n} pending`}
        >
            {n > 99 ? "99+" : n}
        </span>
    );
}

function asArray(x) {
    if (Array.isArray(x)) return x;
    // in case backend returns {items: []}
    if (x && Array.isArray(x.items)) return x.items;
    return [];
}

export default function BackOfficeLayout({ title, children, noScroll = false }) {
    const navigate = useNavigate();
    const location = useLocation();

    const [user, setUser] = useState(() => readUserSafe());
    const [prefs, setPrefs] = useState(() => readPrefsSafe());
    const [confirmLogout, setConfirmLogout] = useState(false);

    /* ✅ badge counts (count-based so persists across refresh/login) */
    const [badgeCounts, setBadgeCounts] = useState({
        support: 0,
        profileReq: 0,
        leave: 0,
        overtime: 0,
        payrollControl: 0, // anomaly-only
    });

    const displayName =
        user?.fullName || user?.name || (user?.email ? user.email.split("@")[0] : "Back Office");

    const email = user?.email || "";
    const photo = user?.profilePhotoUrl || user?.avatarUrl || "";
    const role = user?.role || "";
    const isAdmin = role === "admin";

    const isDashboard = location.pathname === "/pm/dashboard";

    function doLogout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("accessibility_prefs");
        navigate("/login");
    }

    useEffect(() => {
        function syncAll() {
            setUser(readUserSafe());
            setPrefs(readPrefsSafe());
        }
        syncAll();

        window.addEventListener("storage", syncAll);
        window.addEventListener("user:updated", syncAll);

        return () => {
            window.removeEventListener("storage", syncAll);
            window.removeEventListener("user:updated", syncAll);
        };
    }, []);

    const dark = prefs?.darkMode !== false;

    const shellClass = dark
        ? "min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
        : "min-h-screen text-slate-900";

    const shellStyle = useMemo(() => {
        return dark ? undefined : { background: "linear-gradient(to bottom right, #f8fafc, #eef2ff, #f1f5f9)" };
    }, [dark]);

    const panelClass = dark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white";
    const mainClass = dark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-white";

    const navInactive = dark ? "text-white/80 hover:bg-white/10" : "text-slate-700 hover:bg-slate-100";
    const navActive = dark ? "bg-white/15 text-white" : "bg-slate-900 text-white";

    /* ---------------- auto refresh badges (COUNT based) ---------------- */
    async function refreshBadges() {
        try {
            const [supportRes, profileRes, leaveRes, overtimeRes, anomRes] = await Promise.all([
                getSupportTickets({ status: "" }).catch(() => []),
                getProfileChangeApprovals({ status: "pending" }).catch(() => []),
                getLeaveApprovals({ status: "inprogress" }).catch(() => []),
                getOvertimeApprovals({ status: "pending" }).catch(() => []),
                listAnomalies({ status: "open" }).catch(() => []),
            ]);

            const supportArrRaw = asArray(supportRes);
            const profileArr = asArray(profileRes);
            const leaveArr = asArray(leaveRes);
            const overtimeArr = asArray(overtimeRes);
            const anomArr = asArray(anomRes);

            const supportArr = supportArrRaw.filter((t) => {
                const s = String(t.status || "").toLowerCase();
                return s === "open" || s === "in_progress" || s === "inprogress" || s === "pending";
            });

            setBadgeCounts({
                support: supportArr.length,
                profileReq: profileArr.length,
                leave: leaveArr.length,
                overtime: overtimeArr.length,
                payrollControl: anomArr.length,
            });
        } catch {
            // keep old badgeCounts
        }
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
        <div className={shellClass} style={shellStyle}>
            {/* ✅ banner sits above everything */}
            <ImpersonationBanner />

            {/* ✅ IMPORTANT: pt-16 so content doesn't hide under fixed banner */}
            <div className="mx-auto max-w-7xl px-4 pt-16 pb-4 min-h-screen">
                <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 min-h-[calc(100vh-2rem)]">
                    {/* Sidebar */}
                    <aside className={cn("rounded-[28px] p-4 flex flex-col", panelClass)}>
                        <div className="mb-3 flex items-center gap-3 px-2 min-w-0">
                            <div className="h-20 w-20 shrink-0 flex items-center justify-center">
                                <img src={logo} alt="AutoPay" className="max-h-16 max-w-16 object-contain" />
                            </div>

                            <div className="min-w-0">
                                <div className={cn("font-semibold leading-tight truncate", dark ? "text-white" : "text-slate-900")}>
                                    AutoPay
                                </div>
                                <div className={cn("text-xs truncate", dark ? "text-white/60" : "text-slate-500")}>Back Office</div>
                            </div>
                        </div>

                        <nav className="space-y-1">
                            <NavLink
                                to="/pm/dashboard"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Dashboard
                            </NavLink>

                            <NavLink
                                to="/pm/support"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                <span className="inline-flex items-center">
                                    Support Tickets
                                    <BadgeCount count={badgeCounts.support} dark={dark} />
                                </span>
                            </NavLink>

                            <NavLink
                                to="/pm/profile-requests"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                <span className="inline-flex items-center">
                                    Profile Change Requests
                                    <BadgeCount count={badgeCounts.profileReq} dark={dark} />
                                </span>
                            </NavLink>

                            <NavLink
                                to="/pm/leave-approvals"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                <span className="inline-flex items-center">
                                    Leave Approvals
                                    <BadgeCount count={badgeCounts.leave} dark={dark} />
                                </span>
                            </NavLink>

                            <NavLink
                                to="/pm/overtime-approvals"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                <span className="inline-flex items-center">
                                    Overtime Approvals
                                    <BadgeCount count={badgeCounts.overtime} dark={dark} />
                                </span>
                            </NavLink>

                            <NavLink
                                to="/pm/progressions"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Progressions
                            </NavLink>

                            <NavLink
                                to="/pm/employees"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Employee Setup
                            </NavLink>

                            <NavLink
                                to="/pm/access-rights"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Access Rights
                            </NavLink>

                            <NavLink
                                to="/pm/employee-documents"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Employee Documents
                            </NavLink>

                            <NavLink
                                to="/pm/paycodes"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Paycodes
                            </NavLink>

                            <NavLink
                                to="/pm/adjustments"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                <span className="inline-flex items-center">
                                    Payroll Control Center
                                    <BadgeCount count={badgeCounts.payrollControl} dark={dark} />
                                </span>
                            </NavLink>

                            <NavLink
                                to="/pm/reports"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Reports
                            </NavLink>

                            <NavLink
                                to="/pm/accessibility"
                                className={({ isActive }) =>
                                    `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                }
                            >
                                Accessibility
                            </NavLink>

                            <div className={cn("my-4 border-t", dark ? "border-white/10" : "border-slate-200")} />

                            <nav className="space-y-1">
                                <div className={cn("px-4 pt-2 text-xs font-semibold uppercase tracking-wider", dark ? "text-white/50" : "text-slate-500")}>
                                    Knowledge Hub
                                </div>

                                <NavLink
                                    to="/pm/knowledge/documents"
                                    className={({ isActive }) =>
                                        `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                    }
                                >
                                    Documents
                                </NavLink>

                                {isAdmin ? (
                                    <NavLink
                                        to="/admin/knowledge/settings"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        Knowledge Hub Settings
                                    </NavLink>
                                ) : null}
                            </nav>

                        </nav>

                        {isAdmin ? (
                            <>
                                <div className={cn("my-4 border-t", dark ? "border-white/10" : "border-slate-200")} />
                                <nav className="space-y-1">
                                    <NavLink
                                        to="/admin/impersonate"
                                        className={({ isActive }) =>
                                            `block rounded-xl px-4 py-2 text-sm transition ${isActive ? navActive : navInactive}`
                                        }
                                    >
                                        Impersonation
                                    </NavLink>
                                </nav>
                            </>
                        ) : null}

                        <div className="mt-auto pt-4">
                            <button
                                onClick={() => setConfirmLogout(true)}
                                className={cn(
                                    "w-full rounded-xl border px-4 py-2 text-sm transition",
                                    dark
                                        ? "bg-white/10 hover:bg-white/15 border-white/10 text-white"
                                        : "bg-slate-900 hover:bg-slate-800 border-slate-900 text-white"
                                )}
                                type="button"
                            >
                                Log Out
                            </button>
                        </div>
                    </aside>

                    {/* Main */}
                    <main className={cn("rounded-[28px] p-5", mainClass, noScroll ? "h-[calc(100vh-2rem)] overflow-hidden" : "")}>
                        {isDashboard ? (
                            <div className="mb-6 flex items-center justify-between gap-6">
                                <div>
                                    <div className={cn("text-2xl font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>
                                        Welcome, {displayName}!
                                    </div>
                                    <div className={cn("text-sm", dark ? "text-white/60" : "text-slate-600")}>
                                        {role ? `${roleLabel(role)} access` : "Back office access"}
                                    </div>
                                </div>

                                <button
                                    onClick={() => navigate("/pm/profile")}
                                    className={cn(
                                        "flex items-center gap-3 rounded-2xl border px-3 py-2 transition text-left",
                                        dark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"
                                    )}
                                    type="button"
                                    title="Edit profile"
                                >
                                    {photo ? (
                                        <img
                                            src={photo.startsWith("http") ? photo : `http://localhost:5000${photo}`}
                                            alt="Profile"
                                            className={cn("h-10 w-10 rounded-full object-cover border", dark ? "border-white/10 bg-white/10" : "border-slate-200 bg-slate-100")}
                                        />
                                    ) : (
                                        <div className={cn("h-10 w-10 rounded-full border", dark ? "border-white/10 bg-white/10" : "border-slate-200 bg-slate-100")} />
                                    )}

                                    <div className="leading-tight">
                                        <div className={cn("text-sm font-semibold", dark ? "text-white" : "text-slate-900")}>{displayName}</div>
                                        <div className={cn("text-xs", dark ? "text-white/60" : "text-slate-600")}>{email}</div>
                                    </div>
                                </button>
                            </div>
                        ) : title ? (
                            <div className={cn("mb-4 text-xl font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>{title}</div>
                        ) : null}

                        {isDashboard && title ? (
                            <div className={cn("mb-4 text-lg font-semibold tracking-wide", dark ? "text-white" : "text-slate-900")}>{title}</div>
                        ) : null}

                        <div className={noScroll ? "h-full overflow-hidden" : ""}>{children}</div>
                    </main>
                </div>
            </div>

            {/* Logout Confirmation Modal (kept as-is) */}
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
                                    <div className="text-sm text-slate-600 mt-1">Are you sure you want to end your session?</div>
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
    );
}
