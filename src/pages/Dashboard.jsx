import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SidebarLayout from "../components/SidebarLayout.jsx";

// ✅ overtime
import { getMyOvertime, getOvertimeSummary } from "../api/overtimeApi.js";

// ✅ support requests
import { getSupportTickets } from "../api/supportApi.js";

// ✅ audit log (NEW)
import { getMyAuditLogs } from "../api/auditApi.js";

// ✅ offline helpers
import { useOnline } from "../hooks/useOnline.js";
import { loadSnapshot, saveSnapshot } from "../utils/offlineStore.js";

/* ---------- helpers ---------- */
function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function monthLabel(d) {
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function ymd(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function parseYmd(s) {
    const [y, m, d] = (s || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function buildBadgesFromRequests(requests) {
    const b = {};
    for (const r of requests) {
        const s = parseYmd(r.start);
        const e = parseYmd(r.end);
        if (!s || !e) continue;

        const cur = new Date(s);
        while (cur <= e) {
            const key = ymd(cur);
            b[key] = b[key] || [];
            b[key].push({
                kind:
                    r.status === "accepted"
                        ? "accepted"
                        : r.status === "cancelled"
                            ? "cancelled"
                            : "inprogress",
                text: r.type || "Leave",
            });
            cur.setDate(cur.getDate() + 1);
        }
    }
    return b;
}

/* ✅ overtime month format: YYYY-MM */
function pad2(n) {
    return String(n).padStart(2, "0");
}
function ymFromDate(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function fmtDateTime(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
}

/* ---------- UI bits ---------- */
function Card({ title, children, className = "" }) {
    return (
        <div className={`rounded-3xl bg-white border border-slate-200 p-5 ${className}`}>
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

function Tile({ label, sub, onClick, tone = "" }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-2xl border border-slate-200 p-4 text-left transition hover:brightness-105 ${tone}`}
            type="button"
        >
            <div className="text-sm font-semibold text-slate-900">{label}</div>
            {sub ? <div className="text-xs text-slate-600 mt-1">{sub}</div> : null}
        </button>
    );
}

function MiniLeaveCalendar({ requests, onOpenLeave }) {
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const badges = useMemo(() => buildBadgesFromRequests(requests), [requests]);

    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const firstDow = first.getDay();
    const daysInMonth = last.getDate();

    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const week = ["S", "M", "T", "W", "T", "F", "S"];

    return (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Leave Calendar</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setMonth((m) => addMonths(m, -1));
                        }}
                        className="h-8 w-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                        aria-label="Prev month"
                        type="button"
                    >
                        ‹
                    </button>
                    <div className="text-xs text-slate-600 min-w-[120px] text-center">{monthLabel(month)}</div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setMonth((m) => addMonths(m, 1));
                        }}
                        className="h-8 w-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
                        aria-label="Next month"
                        type="button"
                    >
                        ›
                    </button>
                </div>
            </div>

            <button onClick={onOpenLeave} className="mt-3 w-full text-left" type="button">
                <div className="grid grid-cols-7 gap-1.5">
                    {week.map((w) => (
                        <div key={w} className="text-[10px] text-slate-500 font-semibold text-center py-0.5">
                            {w}
                        </div>
                    ))}

                    {cells.map((d, idx) => {
                        if (!d) return <div key={idx} className="h-9 rounded-lg bg-transparent" />;

                        const key = ymd(d);
                        const dayBadges = badges[key] || [];
                        const hasAccepted = dayBadges.some((x) => x.kind === "accepted");
                        const hasInProgress = dayBadges.some((x) => x.kind === "inprogress");
                        const hasCancelled = dayBadges.some((x) => x.kind === "cancelled");

                        return (
                            <div key={idx} className="h-9 rounded-xl border border-slate-200 bg-white px-1 py-1">
                                <div className="text-[11px] font-semibold text-slate-800 leading-none">{d.getDate()}</div>

                                {hasAccepted || hasInProgress || hasCancelled ? (
                                    <div className="mt-1 flex gap-1">
                                        {hasAccepted ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> : null}
                                        {hasInProgress ? <span className="h-1.5 w-1.5 rounded-full bg-sky-300" /> : null}
                                        {hasCancelled ? <span className="h-1.5 w-1.5 rounded-full bg-rose-300" /> : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-300" /> Accepted
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-sky-300" /> In progress
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-rose-300" /> Cancelled
                        </span>
                    </div>
                    <span className="text-slate-500">Click to open Leave Module</span>
                </div>
            </button>
        </div>
    );
}

export default function Dashboard() {
    const nav = useNavigate();
    const online = useOnline();

    const SNAPSHOT_KEY = "dashboard:v1";

    const initialUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("user") || "{}");
        } catch {
            return {};
        }
    }, []);

    const [user, setUser] = useState(initialUser);

    const displayName = user?.fullName || user?.name || (user?.email ? user.email.split("@")[0] : "Employee");

    const profilePhoto =
        user?.profilePhotoUrl ||
        user?.avatarUrl ||
        user?.photoUrl ||
        "";

    const [leaveRequests, setLeaveRequests] = useState(() => {
        try {
            const raw = localStorage.getItem("leave_requests");
            if (raw) return JSON.parse(raw);
        } catch { }
        return [];
    });

    /* ✅ overtime state */
    const [otLoading, setOtLoading] = useState(false);
    const [otSummary, setOtSummary] = useState({ totalHours: 0, pendingCount: 0 });
    const [otLatest, setOtLatest] = useState(null);

    /* ✅ support request overview */
    const [srLoading, setSrLoading] = useState(false);
    const [srStats, setSrStats] = useState({ total: 0, open: 0, resolved: 0 });
    const [srLatest, setSrLatest] = useState([]);

    /* ✅ audit log (NEW) */
    const [logOpen, setLogOpen] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsErr, setLogsErr] = useState("");
    const [logs, setLogs] = useState([]);

    async function loadOvertimeCard() {
        const m = ymFromDate(new Date());
        setOtLoading(true);
        try {
            const [sum, list] = await Promise.all([getOvertimeSummary(m), getMyOvertime(m)]);

            setOtSummary({
                totalHours: sum?.totalHours ?? 0,
                pendingCount: sum?.pendingCount ?? 0,
            });

            const arr = Array.isArray(list) ? list : [];
            setOtLatest(arr.length > 0 ? arr[0] : null);
        } catch {
            setOtSummary({ totalHours: 0, pendingCount: 0 });
            setOtLatest(null);
        } finally {
            setOtLoading(false);
        }
    }

    async function loadSupportCard() {
        setSrLoading(true);
        try {
            const list = await getSupportTickets();
            const arr = Array.isArray(list) ? list : [];

            const openCount = arr.filter((t) => !["resolved", "closed"].includes(t.status)).length;
            const resolvedCount = arr.filter((t) => ["resolved", "closed"].includes(t.status)).length;

            setSrStats({
                total: arr.length,
                open: openCount,
                resolved: resolvedCount,
            });

            setSrLatest(arr.slice(0, 3));
        } catch {
            setSrStats({ total: 0, open: 0, resolved: 0 });
            setSrLatest([]);
        } finally {
            setSrLoading(false);
        }
    }

    async function openLogs() {
        setLogOpen(true);
        setLogsLoading(true);
        setLogsErr("");
        try {
            const list = await getMyAuditLogs({ limit: 80 });
            setLogs(Array.isArray(list) ? list : []);
        } catch (e) {
            setLogsErr(e.message || "Failed to load logs.");
            setLogs([]);
        } finally {
            setLogsLoading(false);
        }
    }

    async function refreshLogs() {
        setLogsLoading(true);
        setLogsErr("");
        try {
            const list = await getMyAuditLogs({ limit: 80 });
            setLogs(Array.isArray(list) ? list : []);
        } catch (e) {
            setLogsErr(e.message || "Failed to load logs.");
            setLogs([]);
        } finally {
            setLogsLoading(false);
        }
    }

    /* keep dashboard reactive if leave_requests changes */
    useEffect(() => {
        function onStorage(e) {
            if (e.key === "leave_requests") {
                try {
                    const next = JSON.parse(e.newValue || "[]");
                    setLeaveRequests(Array.isArray(next) ? next : []);
                } catch { }
            }
            if (e.key === "user") {
                try {
                    const nextUser = JSON.parse(e.newValue || "{}");
                    setUser(nextUser || {});
                } catch { }
            }
        }
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    /* same-tab updates */
    useEffect(() => {
        const t = setInterval(() => {
            try {
                const raw = localStorage.getItem("leave_requests");
                const next = raw ? JSON.parse(raw) : [];
                if (Array.isArray(next)) setLeaveRequests(next);
            } catch { }

            try {
                const rawUser = localStorage.getItem("user");
                const nextUser = rawUser ? JSON.parse(rawUser) : {};
                setUser(nextUser || {});
            } catch { }
        }, 1200);

        return () => clearInterval(t);
    }, []);

    // ✅ Offline-first: if offline, load last snapshot once
    useEffect(() => {
        if (online) return;

        (async () => {
            try {
                const snap = await loadSnapshot(SNAPSHOT_KEY);
                if (!snap) return;

                if (snap.otSummary) setOtSummary(snap.otSummary);
                if ("otLatest" in snap) setOtLatest(snap.otLatest);

                if (snap.srStats) setSrStats(snap.srStats);
                if (Array.isArray(snap.srLatest)) setSrLatest(snap.srLatest);
            } catch { }
        })();
    }, [online]);

    // ✅ When online, fetch and save snapshot
    useEffect(() => {
        if (!online) return;

        (async () => {
            await Promise.all([loadOvertimeCard(), loadSupportCard()]);

            // save snapshot after load (use current state values)
            // small delay ensures state settled
            setTimeout(async () => {
                try {
                    await saveSnapshot(SNAPSHOT_KEY, {
                        otSummary,
                        otLatest,
                        srStats,
                        srLatest,
                        savedAt: Date.now(),
                    });
                } catch { }
            }, 250);
        })();

        function onFocus() {
            loadOvertimeCard();
            loadSupportCard();
        }

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                loadOvertimeCard();
                loadSupportCard();
            }
        });

        return () => {
            window.removeEventListener("focus", onFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online]);

    // ✅ Also snapshot when data changes (online only)
    useEffect(() => {
        if (!online) return;
        const t = setTimeout(async () => {
            try {
                await saveSnapshot(SNAPSHOT_KEY, {
                    otSummary,
                    otLatest,
                    srStats,
                    srLatest,
                    savedAt: Date.now(),
                });
            } catch { }
        }, 350);

        return () => clearTimeout(t);
    }, [online, otSummary, otLatest, srStats, srLatest]);

    return (
        <SidebarLayout title="">
            <div className="rounded-[28px] bg-slate-100/90 p-6">
                <div className="space-y-4">
                    {/* ✅ dashboard-only log button */}
                    <div className="flex items-center justify-end">
                        <button
                            onClick={openLogs}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                            type="button"
                        >
                            🕘 Activity Log
                        </button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Card title="My Documents" className="border-indigo-500/20">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Tile
                                    label="Payslips"
                                    sub="View, preview & download"
                                    tone="bg-gradient-to-br from-indigo-500/15 to-sky-500/10"
                                    onClick={() => nav("/documents")}
                                />
                                <Tile
                                    label="Documents"
                                    sub="Documents one click away"
                                    tone="bg-gradient-to-br from-emerald-500/15 to-lime-500/10"
                                    onClick={() => nav("/documents")}
                                />
                            </div>
                        </Card>

                        <Card title="Support Requests" className="border-sky-500/20">
                            <button
                                onClick={() => nav("/support")}
                                className="w-full rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 p-4 text-left transition"
                                type="button"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">Overview</div>
                                        <div className="text-xs text-slate-600 mt-1">Track your tickets, messages, and status updates</div>
                                    </div>

                                    {srLoading ? (
                                        <div className="text-xs text-slate-500">Loading…</div>
                                    ) : (
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <span className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                                                Total: {srStats.total}
                                            </span>
                                            <span className="text-xs rounded-full border border-sky-100 bg-sky-50 px-3 py-1 font-semibold text-sky-700">
                                                Open: {srStats.open}
                                            </span>
                                            <span className="text-xs rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                                                Resolved: {srStats.resolved}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {srLatest.length ? (
                                    <div className="mt-3 space-y-2">
                                        {srLatest.map((t) => (
                                            <div key={t._id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                <div className="text-xs font-semibold text-slate-900 truncate">{t.title}</div>
                                                <div className="text-[11px] text-slate-600 mt-0.5">
                                                    {(t.type || "").toUpperCase()} • {(t.status || "").replaceAll("_", " ")} •{" "}
                                                    {t.lastActionAt ? new Date(t.lastActionAt).toLocaleString() : ""}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : !srLoading ? (
                                    <div className="mt-3 text-xs text-slate-600">No support tickets yet.</div>
                                ) : null}
                            </button>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={() => nav("/support?type=payroll")}
                                    className="rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 p-4 text-left transition"
                                    type="button"
                                >
                                    <div className="text-sm font-semibold text-slate-900">Payroll Support</div>
                                    <div className="text-xs text-slate-600 mt-1">Go with payroll filter</div>
                                </button>

                                <button
                                    onClick={() => nav("/support?type=technical")}
                                    className="rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 p-4 text-left transition"
                                    type="button"
                                >
                                    <div className="text-sm font-semibold text-slate-900">Technical Support</div>
                                    <div className="text-xs text-slate-600 mt-1">Go with technical filter</div>
                                </button>
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
                        <div className="space-y-6">
                            <Card title="My Profile" className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    {profilePhoto ? (
                                        <img
                                            src={profilePhoto.startsWith("http") ? profilePhoto : `http://localhost:5000${profilePhoto}`}
                                            alt="Profile"
                                            className="h-12 w-12 rounded-full object-cover border border-slate-200"
                                        />
                                    ) : (
                                        <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200" />
                                    )}

                                    <div>
                                        <div className="text-lg font-semibold text-slate-900">{displayName}</div>
                                        <div className="text-xs text-slate-600">{user?.email || "employee@test.com"}</div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                            Employee No: <span className="font-semibold text-slate-700">{user?.employeeId || "—"}</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => nav("/profile")}
                                    className="rounded-xl px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 border border-slate-900 text-sm"
                                    type="button"
                                >
                                    Edit
                                </button>
                            </Card>

                            <Card title="Leave Module">
                                <MiniLeaveCalendar requests={leaveRequests} onOpenLeave={() => nav("/leave")} />
                            </Card>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <Card>
                                    <button
                                        onClick={() => nav("/knowledge")}
                                        className="w-full rounded-2xl bg-blue-500/15 hover:bg-blue-500/20 border border-slate-200 p-6 text-left"
                                        type="button"
                                    >
                                        <div className="text-sm font-semibold text-slate-900">Knowledge Hub</div>
                                        <div className="text-xs text-slate-600 mt-1">Guides, policies, FAQs</div>
                                    </button>
                                </Card>

                                <Card>
                                    <button
                                        onClick={() => nav("/progressions")}
                                        className="w-full rounded-2xl bg-yellow-500/15 hover:bg-yellow-500/20 border border-slate-200 p-6 text-left"
                                        type="button"
                                    >
                                        <div className="text-sm font-semibold text-slate-900">My Progressions</div>
                                        <div className="text-xs text-slate-600 mt-1">Training & milestones</div>
                                    </button>
                                </Card>
                            </div>
                        </div>

                        <Card title="Overtime">
                            {otLoading ? (
                                <div className="text-sm text-slate-600">Loading…</div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl bg-violet-50 border border-violet-100 p-3">
                                            <div className="text-[11px] text-slate-600">Total hours (this month)</div>
                                            <div className="text-xl font-semibold text-slate-900 mt-0.5">{otSummary.totalHours ?? 0}</div>
                                        </div>

                                        <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                                            <div className="text-[11px] text-slate-600">In progress</div>
                                            <div className="text-xl font-semibold text-slate-900 mt-0.5">{otSummary.pendingCount ?? 0}</div>
                                        </div>
                                    </div>

                                    {otLatest ? (
                                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                                            <div className="text-xs text-slate-600">Latest log</div>
                                            <div className="text-sm font-semibold text-slate-900 mt-1">
                                                {otLatest.date} • {otLatest.hours} hour(s)
                                            </div>
                                            <div className="text-xs text-slate-600 mt-1 line-clamp-2">{otLatest.reason}</div>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-700">No overtime logged for this month.</div>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={() => nav("/overtime")}
                                className="mt-4 rounded-xl px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 border border-slate-900 text-sm"
                                type="button"
                            >
                                Log Overtime
                            </button>
                        </Card>
                    </div>
                </div>
            </div>

            {/* ✅ Log Modal */}
            {logOpen ? (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setLogOpen(false)} />
                    <div className="absolute left-1/2 top-1/2 w-[94vw] sm:w-[980px] -translate-x-1/2 -translate-y-1/2">
                        <div className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                                <div className="text-xl font-semibold text-slate-900">Activity Log</div>
                                <button
                                    onClick={() => setLogOpen(false)}
                                    className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                                    type="button"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-6">
                                {logsErr ? (
                                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                        {logsErr}
                                    </div>
                                ) : null}

                                <button
                                    onClick={refreshLogs}
                                    className="mb-3 rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                    type="button"
                                    disabled={logsLoading}
                                >
                                    {logsLoading ? "Refreshing..." : "Refresh"}
                                </button>

                                <div className="max-h-[520px] overflow-auto space-y-2 pr-2">
                                    {logsLoading ? (
                                        <div className="text-sm text-slate-600">Loading…</div>
                                    ) : logs.length === 0 ? (
                                        <div className="text-sm text-slate-700">
                                            No logs yet. (If you *just* created a request and still see nothing, the backend filter is wrong — it must use <b>subjectId</b>.)
                                        </div>
                                    ) : (
                                        logs.map((l) => (
                                            <div key={l._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-slate-900">
                                                            {String(l.module || "").toUpperCase()} • {l.action}
                                                        </div>
                                                        <div className="text-xs text-slate-600 mt-1">{l.message || "-"}</div>
                                                        <div className="text-[11px] text-slate-500 mt-1">
                                                            By: {l.actorRole || "user"}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-slate-500 shrink-0">{fmtDateTime(l.createdAt)}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </SidebarLayout>
    );
}