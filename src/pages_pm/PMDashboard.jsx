import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { getSupportTickets } from "../api/supportApi.js";
import { getMyActionLogs } from "../api/auditApi.js";

import { getLeaveApprovals } from "../api/leaveApi.js";
import { getOvertimeApprovals } from "../api/overtimeApi.js";
import { getProfileChangeApprovals } from "../api/profileApi.js";
import { listAnomalies } from "../api/payrollAnomaliesApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function fmtDateTime(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
}

function getUserSafe() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}") || {};
    } catch {
        return {};
    }
}

function Card({ title, children, className = "" }) {
    return (
        <div className={cn("rounded-3xl bg-white border border-slate-200 p-5 shadow-sm", className)}>
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

function MiniStat({ title, value, subtitle, variant = "slate" }) {
    const v = {
        slate: "bg-white border-slate-200",
        green: "bg-emerald-50 border-emerald-100",
        blue: "bg-sky-50 border-sky-100",
        amber: "bg-amber-50 border-amber-100",
        violet: "bg-violet-50 border-violet-100",
    }[variant];

    return (
        <div className={cn("rounded-3xl border p-5 shadow-sm", v)}>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-4xl font-semibold text-slate-900 mt-3">{value}</div>
            {subtitle ? <div className="text-sm text-slate-700/80 mt-2">{subtitle}</div> : null}
        </div>
    );
}

function TicketsTrendChart({ tickets = [], days = 14 }) {
    const points = useMemo(() => {
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const start = new Date(end);
        start.setDate(start.getDate() - (days - 1));
        start.setHours(0, 0, 0, 0);

        const buckets = Array.from({ length: days }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return { day: d, count: 0 };
        });

        for (const t of tickets) {
            const dt = new Date(t.createdAt || t.lastActionAt || 0);
            if (Number.isNaN(dt.getTime())) continue;
            if (dt < start || dt > end) continue;

            const idx = Math.floor((dt - start) / (24 * 60 * 60 * 1000));
            if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
        }

        return buckets;
    }, [tickets, days]);

    const maxY = Math.max(1, ...points.map(p => p.count));
    const w = 520, h = 160, pad = 18;

    const toXY = (i, v) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
        const y = h - pad - (v * (h - pad * 2)) / maxY;
        return [x, y];
    };

    const d = points.map((p, i) => {
        const [x, y] = toXY(i, p.count);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");

    const last = points[points.length - 1]?.count ?? 0;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-slate-900">Support tickets trend</div>
                    <div className="text-xs text-slate-600 mt-0.5">Last {days} days • Today: <b>{last}</b></div>
                </div>
            </div>

            <div className="mt-3 overflow-x-auto">
                <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
                    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-900" />
                    {points.map((p, i) => {
                        const [x, y] = toXY(i, p.count);
                        return <circle key={i} cx={x} cy={y} r="2.6" className="fill-slate-900" />;
                    })}
                </svg>
            </div>
        </div>
    );
}



function Pill({ children, kind = "default" }) {
    const map = {
        default: "bg-slate-50 text-slate-700 border-slate-200",
        info: "bg-sky-50 text-sky-700 border-sky-100",
        ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
        warn: "bg-amber-50 text-amber-700 border-amber-100",
        danger: "bg-rose-50 text-rose-700 border-rose-100",
        violet: "bg-violet-50 text-violet-700 border-violet-100",
        indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[kind] || map.default)}>
            {children}
        </span>
    );
}

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[980px]" }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className={cn("absolute left-1/2 top-1/2 w-[94vw] -translate-x-1/2 -translate-y-1/2", widthClass)}>
                <div className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                        <div className="text-xl font-semibold text-slate-900">{title}</div>
                        <button onClick={onClose} className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700" aria-label="Close" type="button">
                            ✕
                        </button>
                    </div>
                    <div className="p-6 text-slate-900 max-h-[78vh] overflow-y-auto">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default function PMDashboard() {
    const user = useMemo(() => getUserSafe(), []);
    const role = user?.role || "";
    const isAdmin = role === "admin";

    const [loading, setLoading] = useState(true);

    const [tickets, setTickets] = useState([]);
    const [totalAssigned, setTotalAssigned] = useState(0);
    const [openCount, setOpenCount] = useState(0);
    const [resolvedCount, setResolvedCount] = useState(0);

    const [anomaliesCount, setAnomaliesCount] = useState(0);

    const [pendingLeave, setPendingLeave] = useState(0);
    const [pendingOvertime, setPendingOvertime] = useState(0);
    const [pendingProfileReq, setPendingProfileReq] = useState(0);

    const [openLog, setOpenLog] = useState(false);
    const [logLoading, setLogLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logErr, setLogErr] = useState("");

    async function loadDashboard() {
        setLoading(true);
        try {
            const [supportList, anoms, leaveList, otList, profList] = await Promise.all([
                getSupportTickets().catch(() => []),
                listAnomalies({ status: "open" }).catch(() => []),
                getLeaveApprovals({ status: "pending" }).catch(() => []),
                getOvertimeApprovals({ status: "pending" }).catch(() => []),
                getProfileChangeApprovals({ status: "pending" }).catch(() => []),
            ]);

            const arr = Array.isArray(supportList) ? supportList : [];
            const scoped = arr.filter((t) => (isAdmin ? t.type === "technical" : t.type === "payroll"));

            const open = scoped.filter((t) => t.status === "not_started" || t.status === "in_progress").length;
            const resolved = scoped.filter((t) => t.status === "resolved" || t.status === "closed").length;

            setTickets(scoped);
            setTotalAssigned(scoped.length);
            setOpenCount(open);
            setResolvedCount(resolved);

            setAnomaliesCount(Array.isArray(anoms) ? anoms.length : 0);
            setPendingLeave(Array.isArray(leaveList) ? leaveList.length : 0);
            setPendingOvertime(Array.isArray(otList) ? otList.length : 0);
            setPendingProfileReq(Array.isArray(profList) ? profList.length : 0);
        } catch {
            setTickets([]);
            setTotalAssigned(0);
            setOpenCount(0);
            setResolvedCount(0);
            setAnomaliesCount(0);
            setPendingLeave(0);
            setPendingOvertime(0);
            setPendingProfileReq(0);
        } finally {
            setLoading(false);
        }
    }

    async function loadMyLogs() {
        setLogLoading(true);
        setLogErr("");
        try {
            const list = await getMyActionLogs({ limit: 80 });
            setLogs(Array.isArray(list) ? list : []);
        } catch (e) {
            setLogs([]);
            setLogErr(e.message || "Failed to load logs.");
        } finally {
            setLogLoading(false);
        }
    }

    useEffect(() => {
        loadDashboard();

        const t = setInterval(loadDashboard, 15000);
        function onFocus() {
            loadDashboard();
        }
        window.addEventListener("focus", onFocus);

        return () => {
            clearInterval(t);
            window.removeEventListener("focus", onFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const latestTicket = useMemo(() => {
        if (!tickets.length) return null;
        const sorted = [...tickets].sort((a, b) => {
            const da = new Date(a.lastActionAt || a.createdAt || 0).getTime();
            const db = new Date(b.lastActionAt || b.createdAt || 0).getTime();
            return db - da;
        });
        return sorted[0] || null;
    }, [tickets]);

    function openActivityLog() {
        setOpenLog(true);
        loadMyLogs();
    }

    return (
        <BackOfficeLayout title="Dashboard">
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">Dashboard</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={openActivityLog}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950 inline-flex items-center gap-2"
                        >
                            <span aria-hidden>🕘</span> Activity Log
                        </button>

                        <button
                            type="button"
                            onClick={loadDashboard}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950"
                            disabled={loading}
                        >
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                    </div>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    <MiniStat
                        variant="violet"
                        title={isAdmin ? "Support tickets (Admin)" : "Support tickets (PM)"}
                        value={totalAssigned}
                        subtitle="Assigned to your queue"
                    />
                    <MiniStat variant="amber" title="Open tickets" value={openCount} subtitle="Not started + In progress" />
                    <MiniStat variant="green" title="Resolved tickets" value={resolvedCount} subtitle="Resolved + Closed" />
                    <MiniStat variant="blue" title="Open anomalies" value={anomaliesCount} subtitle="Needs review in payroll control" />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 mt-6">
                    <Card title="Approvals overview">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900">Leave approvals</div>
                                <div className="text-3xl font-semibold text-slate-900 mt-2">{pendingLeave}</div>
                                <div className="text-xs text-slate-600 mt-1">Pending</div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900">Overtime approvals</div>
                                <div className="text-3xl font-semibold text-slate-900 mt-2">{pendingOvertime}</div>
                                <div className="text-xs text-slate-600 mt-1">Pending</div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900">Profile requests</div>
                                <div className="text-3xl font-semibold text-slate-900 mt-2">{pendingProfileReq}</div>
                                <div className="text-xs text-slate-600 mt-1">Pending</div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-sm font-semibold text-slate-900">Anomaly queue</div>
                            <div className="text-sm text-slate-600 mt-1">
                                {anomaliesCount ? (
                                    <span>
                                        <Pill kind="warn">Needs review</Pill> <span className="ml-2">You have {anomaliesCount} open anomaly(ies).</span>
                                    </span>
                                ) : (
                                    "No anomalies right now."
                                )}
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-6">
                        <Card title="Latest Support Activity">
                            {!latestTicket ? (
                                <div className="text-sm text-slate-600">No tickets yet.</div>
                            ) : (
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="text-sm font-semibold text-slate-900 truncate">{latestTicket.title}</div>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Pill kind={latestTicket.type === "technical" ? "violet" : "indigo"}>
                                            {String(latestTicket.type || "").toUpperCase()}
                                        </Pill>
                                        <Pill kind="info">{String(latestTicket.status || "").replaceAll("_", " ")}</Pill>
                                        <Pill kind="warn">{latestTicket.priority}</Pill>
                                    </div>

                                    <div className="text-xs text-slate-500 mt-2">
                                        Last action: {fmtDateTime(latestTicket.lastActionAt || latestTicket.createdAt)}
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card title="Monitoring">
                            <TicketsTrendChart tickets={tickets} days={14} />
                        </Card>

                    </div>
                </div>

                <ModalShell open={openLog} title="Activity Log" onClose={() => setOpenLog(false)} widthClass="sm:w-[980px]">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <button
                            type="button"
                            onClick={loadMyLogs}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            disabled={logLoading}
                        >
                            {logLoading ? "Refreshing..." : "Refresh"}
                        </button>
                        {logErr ? <div className="text-sm text-rose-600">{logErr}</div> : null}
                    </div>

                    <div className="space-y-3">
                        {logLoading ? (
                            <div className="text-sm text-slate-600">Loading…</div>
                        ) : logs.length === 0 ? (
                            <div className="text-sm text-slate-600">No activity yet.</div>
                        ) : (
                            logs.map((l) => (
                                <div key={l._id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-900">
                                                {(l.module || "").toUpperCase()} • {(l.action || "").toUpperCase()}
                                            </div>
                                            {l.message ? <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{l.message}</div> : null}
                                            {l.actorRole ? <div className="text-xs text-slate-500 mt-2">By: {l.actorRole}</div> : null}
                                        </div>

                                        <div className="text-xs text-slate-500 shrink-0">{fmtDateTime(l.createdAt)}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ModalShell>
            </div>
        </BackOfficeLayout>
    );
}
