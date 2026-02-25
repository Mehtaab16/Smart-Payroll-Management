// client/src/pages/LeaveModule.jsx ✅ Offline queue + optimistic pending + auto refresh on outbox flush
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SideBarLayout from "../components/SideBarLayout.jsx";
import { listDelegates } from "../api/employeesApi.js";
import { getMyLeave, getLeaveBalance, createLeave, updateLeave, deleteLeave } from "../api/leaveApi.js";

/* ----------------- config ----------------- */
const API_BASE = "http://localhost:5000";

/* ----------------- utils ----------------- */
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
function isInProgress(status) {
    return status === "inprogress" || status === "pending";
}
function normalizeType(t) {
    const x = (t || "").toLowerCase();
    if (x.includes("sick")) return "Sick Leave";
    if (x.includes("annual")) return "Annual Leave";
    if (x.includes("wedding")) return "Wedding Leave";
    if (x.includes("unpaid")) return "Unpaid Leave";
    if (x.includes("work")) return "Work From Home";
    return t || "Annual Leave";
}
function formatRange(start, end) {
    const s = parseYmd(start);
    const e = parseYmd(end);
    if (!s || !e) return "-";
    const opts = { day: "2-digit", month: "short", year: "numeric" };
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}
function toYmdFromApiDate(v) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return ymd(d);
}
function fmtIsoDate(v) {
    try {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 10);
    } catch {
        return "";
    }
}

/**
 * Mauritius Public Holidays map (starter).
 */
function getMauritiusPublicHolidaysMap(year) {
    const map = {};
    const fixed = [
        { md: "01-01", label: "New Year’s Day" },
        { md: "01-02", label: "New Year Holiday" },
        { md: "02-01", label: "Abolition of Slavery" },
        { md: "03-12", label: "Independence Day" },
        { md: "05-01", label: "Labour Day" },
        { md: "11-02", label: "Arrival of Indentured Labourers" },
        { md: "12-25", label: "Christmas Day" },
    ];
    fixed.forEach((h) => {
        map[`${year}-${h.md}`] = h.label;
    });
    return map;
}

/* ----------------- UI bits ----------------- */
function MessageBox({ kind = "info", message, onClose }) {
    if (!message) return null;
    const styles =
        kind === "error"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700";

    return (
        <div className={cn("mb-4 rounded-2xl border px-4 py-3 shadow-sm", styles)}>
            <div className="flex items-start justify-between gap-3">
                <div className="text-sm">{message}</div>
                <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
                    aria-label="Close message"
                    type="button"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

function Pill({ status }) {
    const map = {
        inprogress: "bg-sky-50 text-sky-700 border-sky-100",
        accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
        cancelled: "bg-rose-50 text-rose-700 border-rose-100",
        pending: "bg-amber-50 text-amber-700 border-amber-100",
        rejected: "bg-rose-50 text-rose-700 border-rose-100",
    };
    const label = {
        inprogress: "In progress",
        accepted: "Accepted",
        cancelled: "Cancelled",
        pending: "Pending sync",
        rejected: "Rejected",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[status] || map.inprogress)}>
            {label[status] || "In progress"}
        </span>
    );
}

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[900px]", zClass = "z-50" }) {
    if (!open) return null;

    return (
        <div className={cn("fixed inset-0", zClass)}>
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className={cn("absolute left-1/2 top-1/2 w-[94vw] -translate-x-1/2 -translate-y-1/2", widthClass)}>
                <div
                    className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                        <div className="text-xl font-semibold text-slate-900">{title}</div>
                        <button
                            onClick={onClose}
                            className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                            aria-label="Close"
                            type="button"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="p-6 text-slate-900 [&_select]:text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900 [&_option]:text-slate-900">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Box({ label, value }) {
    return (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-slate-500 text-xs">{label}</div>
            <div className="font-semibold text-slate-900">{value}</div>
        </div>
    );
}

function Calendar({ valueMonth, selectedDates = [], onToggleDate, dayBadges = {}, holidaysMap = {}, readOnly = false }) {
    const first = startOfMonth(valueMonth);
    const last = endOfMonth(valueMonth);
    const firstDow = first.getDay();
    const daysInMonth = last.getDate();

    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(valueMonth.getFullYear(), valueMonth.getMonth(), day));
    while (cells.length % 7 !== 0) cells.push(null);

    const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);
    const weekDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    return (
        <div className="rounded-3xl bg-white border border-slate-200 p-5">
            <div className="grid grid-cols-7 gap-2">
                {weekDays.map((w) => (
                    <div key={w} className="text-[11px] text-slate-500 font-semibold text-center py-1">
                        {w}
                    </div>
                ))}

                {cells.map((d, idx) => {
                    if (!d) return <div key={idx} className="h-16 rounded-xl bg-transparent" />;

                    const key = ymd(d);
                    const selected = selectedSet.has(key);
                    const badges = dayBadges[key] || [];
                    const holiday = holidaysMap[key];

                    return (
                        <button
                            key={idx}
                            type="button"
                            disabled={readOnly}
                            onClick={() => onToggleDate?.(key)}
                            className={cn(
                                "h-16 rounded-2xl border text-left px-2 py-2 transition",
                                selected ? "border-slate-900 bg-slate-900/5" : "border-slate-100 bg-white hover:bg-slate-50",
                                readOnly ? "cursor-default hover:bg-white" : ""
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold text-slate-900">{d.getDate()}</div>
                                {holiday ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 truncate max-w-[72px]">
                                        Holiday
                                    </span>
                                ) : null}
                            </div>

                            {holiday ? <div className="mt-1 text-[10px] text-amber-700 truncate">{holiday}</div> : null}

                            {badges.length > 0 ? (
                                <div className={cn("mt-1 space-y-1", holiday ? "mt-0.5" : "")}>
                                    {badges.slice(0, 2).map((b, i) => (
                                        <div key={i} className="flex items-center gap-1">
                                            <span
                                                className={cn(
                                                    "inline-block h-2 w-2 rounded-full",
                                                    b.kind === "accepted" ? "bg-emerald-300" : b.kind === "cancelled" ? "bg-rose-300" : b.kind === "pending" ? "bg-amber-300" : "bg-sky-300"
                                                )}
                                            />
                                            <span className="text-[10px] text-slate-600 truncate">{b.text}</span>
                                        </div>
                                    ))}
                                    {badges.length > 2 ? <div className="text-[10px] text-slate-500">+ {badges.length - 2} more</div> : null}
                                </div>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ----------------- main page ----------------- */
export default function LeaveModule() {
    const nav = useNavigate();
    const [month, setMonth] = useState(() => startOfMonth(new Date()));

    const [requests, setRequests] = useState([]);
    const [balances, setBalances] = useState({
        annualTotal: 0,
        sickTotal: 0,
        weddingTotal: 0,
        annualUsed: 0,
        sickUsed: 0,
        weddingUsed: 0,
        annualRemaining: 0,
        sickRemaining: 0,
        weddingRemaining: 0,
    });

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [msg, setMsg] = useState({ kind: "info", text: "" });

    // employees for delegate dropdown
    const [employees, setEmployees] = useState([]); // [{id,label}]
    const [employeesLoading, setEmployeesLoading] = useState(false);

    // request delegate validation
    const [delegateWarning, setDelegateWarning] = useState({ ok: true, text: "" });
    const delegateReqSeq = useRef(0);

    // modals
    const [openRequest, setOpenRequest] = useState(false);
    const [openStatus, setOpenStatus] = useState(false);
    const [openBalance, setOpenBalance] = useState(false);

    // confirm delete modal
    const [confirmDelete, setConfirmDelete] = useState(null);

    // request form
    const [selectedDates, setSelectedDates] = useState([]);
    const [leaveType, setLeaveType] = useState("Annual Leave");
    const [delegate, setDelegate] = useState("");
    const [comments, setComments] = useState("");

    const holidaysMap = useMemo(() => getMauritiusPublicHolidaysMap(month.getFullYear()), [month]);

    const dayBadges = useMemo(() => {
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
                    kind: r.status === "accepted" ? "accepted" : r.status === "cancelled" ? "cancelled" : r.status === "pending" ? "pending" : "inprogress",
                    text: normalizeType(r.type),
                });
                cur.setDate(cur.getDate() + 1);
            }
        }
        return b;
    }, [requests]);

    function mapApiRequestToUi(r) {
        const start = toYmdFromApiDate(r.start) || r.start;
        const end = toYmdFromApiDate(r.end) || r.end;

        return {
            id: r.id || r._id,
            type: normalizeType(r.type),
            start,
            end,
            status: r.status || "inprogress",
            delegate: r.delegate || "",
            comments: r.comments || "",
            decisionNote: r.decisionNote || "",
            decidedByRole: r.decidedByRole || "",
            decidedAt: r.decidedAt || "",
            createdAt: r.createdAt || "",
        };
    }

    async function loadAll() {
        setLoading(true);
        setMsg({ kind: "info", text: "" });

        try {
            const [mine, bal] = await Promise.all([getMyLeave(), getLeaveBalance()]);

            setRequests(Array.isArray(mine) ? mine.map(mapApiRequestToUi) : []);

            setBalances({
                annualTotal: bal?.annualTotal ?? 0,
                sickTotal: bal?.sickTotal ?? 0,
                weddingTotal: bal?.weddingTotal ?? 0,
                annualUsed: bal?.annualUsed ?? 0,
                sickUsed: bal?.sickUsed ?? 0,
                weddingUsed: bal?.weddingUsed ?? 0,
                annualRemaining: bal?.annualRemaining ?? 0,
                sickRemaining: bal?.sickRemaining ?? 0,
                weddingRemaining: bal?.weddingRemaining ?? 0,
            });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to load leave data." });
        } finally {
            setLoading(false);
        }
    }

    async function loadEmployees() {
        setEmployeesLoading(true);
        try {
            const arr = await listDelegates();
            const mapped = (Array.isArray(arr) ? arr : [])
                .map((e) => {
                    const id = String(e?.id || e?._id || "").trim();
                    if (!id) return null;

                    const name = String(e?.fullName || e?.name || e?.email || "Employee").trim();
                    const num = String(e?.employeeNumber || e?.employeeId || "").trim();
                    const email = String(e?.email || "").trim();

                    const label = `${name}${num ? ` • ${num}` : ""}${email ? ` • ${email}` : ""}`;
                    return { id, label };
                })
                .filter(Boolean);

            mapped.sort((a, b) => a.label.localeCompare(b.label));
            setEmployees(mapped);
        } catch (e) {
            setEmployees([]);
        } finally {
            setEmployeesLoading(false);
        }
    }

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            nav("/login");
            return;
        }
        loadAll();
        loadEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ auto refresh when outbox flushes (leave)
    useEffect(() => {
        async function onFlushed(e) {
            const mods = e?.detail?.modules || [];
            if (!mods.includes("leave")) return;
            await loadAll();
            setMsg({ kind: "success", text: "Synced leave changes." });
        }
        window.addEventListener("outbox:flushed", onFlushed);
        return () => window.removeEventListener("outbox:flushed", onFlushed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function toggleDate(key) {
        setSelectedDates((prev) => {
            const set = new Set(prev);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            return Array.from(set).sort();
        });
    }

    function openRequestAbsence() {
        setSelectedDates([]);
        setLeaveType("Annual Leave");
        setDelegate("");
        setComments("");
        setDelegateWarning({ ok: true, text: "" });
        setOpenRequest(true);
    }

    const selectedDays = selectedDates.length;
    const remainingForSelectedType =
        leaveType === "Sick Leave" ? balances.sickRemaining : leaveType === "Wedding Leave" ? balances.weddingRemaining : balances.annualRemaining;

    const needsBalanceCheck = leaveType === "Annual Leave" || leaveType === "Sick Leave" || leaveType === "Wedding Leave";
    const baseCanSubmitRequest = selectedDays > 0 && (!needsBalanceCheck || selectedDays <= remainingForSelectedType);
    const canSubmitRequest = baseCanSubmitRequest && (!delegate || delegateWarning.ok);

    async function apiFetch(path) {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(`${API_BASE}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
            localStorage.removeItem("token");
            nav("/login");
            throw new Error("Session expired. Please login again.");
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.message || "Request failed");
        return payload;
    }

    async function checkDelegateAvailability({ delegateId, startDate, endDate, setWarning }) {
        const seq = ++delegateReqSeq.current;

        try {
            const qs = new URLSearchParams();
            qs.set("employeeId", delegateId);
            qs.set("startDate", startDate);
            qs.set("endDate", endDate);

            const out = await apiFetch(`/api/leave/delegate-availability?${qs.toString()}`);

            if (seq !== delegateReqSeq.current) return;

            if (out?.available) {
                setWarning({ ok: true, text: "" });
            } else {
                const c = out?.conflict || null;
                const cStart = c?.start ? fmtIsoDate(c.start) : "";
                const cEnd = c?.end ? fmtIsoDate(c.end) : "";
                const cType = c?.type || "leave";
                setWarning({
                    ok: false,
                    text: `Delegate is not available (already has ${cType}${cStart && cEnd ? `: ${cStart} to ${cEnd}` : ""}). Please choose someone else.`,
                });
            }
        } catch (e) {
            if (seq !== delegateReqSeq.current) return;
            setWarning({ ok: true, text: "" }); // don’t block if check fails/offline
        }
    }

    useEffect(() => {
        const startDate = selectedDates[0];
        const endDate = selectedDates[selectedDates.length - 1];

        if (!openRequest) return;

        if (!delegate || !startDate || !endDate) {
            setDelegateWarning({ ok: true, text: "" });
            return;
        }

        checkDelegateAvailability({ delegateId: delegate, startDate, endDate, setWarning: setDelegateWarning });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openRequest, delegate, selectedDates.join("|")]);

    function delegateLabelById(id) {
        const key = String(id || "").trim();
        if (!key) return "";
        const found = employees.find((e) => e.id === key);
        return found?.label || "Selected delegate";
    }

    async function submitRequest() {
        if (!canSubmitRequest || busy) return;

        const startDate = selectedDates[0];
        const endDate = selectedDates[selectedDates.length - 1];

        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            const res = await createLeave({
                type: leaveType,
                startDate,
                endDate,
                delegate,
                comments,
            });

            setOpenRequest(false);

            if (res?.queued) {
                const localId = `local_${res.queueId}`;
                const optimistic = {
                    id: localId,
                    type: leaveType,
                    start: startDate,
                    end: endDate,
                    status: "pending",
                    delegate,
                    comments,
                    createdAt: new Date().toISOString(),
                };
                setRequests((prev) => [optimistic, ...(prev || [])]);
                setMsg({ kind: "success", text: "You are offline. Leave request queued and will send when online." });
                return;
            }

            setMsg({ kind: "success", text: "Leave request submitted." });
            await loadAll();
        } catch (e) {
            setMsg({ kind: "error", text: e.message });
        } finally {
            setBusy(false);
        }
    }

    async function deleteRequest(id) {
        if (busy) return;

        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            // local pending delete just removes it
            if (String(id).startsWith("local_")) {
                setRequests((prev) => prev.filter((r) => String(r.id) !== String(id)));
                setMsg({ kind: "success", text: "Pending request removed locally." });
                return;
            }

            const res = await deleteLeave(id);

            if (res?.queued) {
                setRequests((prev) => prev.filter((r) => String(r.id) !== String(id)));
                setMsg({ kind: "success", text: "You are offline. Delete queued and will apply when online." });
                return;
            }

            setMsg({ kind: "success", text: "Request deleted." });
            await loadAll();
        } catch (e) {
            setMsg({ kind: "error", text: e.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <SideBarLayout title="Leave Module" hideWelcome={true}>
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                {/* Action tiles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <button
                        type="button"
                        onClick={openRequestAbsence}
                        className="rounded-3xl bg-violet-50 border border-violet-100 p-5 text-left hover:opacity-95 transition"
                        disabled={loading || busy}
                    >
                        <div className="inline-flex rounded-2xl bg-violet-600 text-white px-4 py-3 font-semibold">Request Absence</div>
                        <div className="mt-3 text-xs text-slate-600">
                            Remaining: AL {balances.annualRemaining} • SL {balances.sickRemaining} • WL {balances.weddingRemaining}
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setOpenStatus(true)}
                        className="rounded-3xl bg-rose-50 border border-rose-100 p-5 text-left hover:opacity-95 transition"
                        disabled={loading}
                    >
                        <div className="inline-flex rounded-2xl bg-rose-600 text-white px-4 py-3 font-semibold">Absence Status</div>
                        <div className="mt-3 text-xs text-slate-600">
                            In progress: {requests.filter((r) => isInProgress(r.status)).length}
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setOpenBalance(true)}
                        className="rounded-3xl bg-sky-50 border border-sky-100 p-5 text-left hover:opacity-95 transition"
                        disabled={loading}
                    >
                        <div className="inline-flex rounded-2xl bg-sky-700 text-white px-4 py-3 font-semibold">Leave Balance</div>
                        <div className="mt-3 text-xs text-slate-600">
                            Used: AL {balances.annualUsed} • SL {balances.sickUsed} • WL {balances.weddingUsed}
                        </div>
                    </button>
                </div>

                {/* Main calendar */}
                <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-center gap-6 mb-4">
                        <button
                            type="button"
                            onClick={() => setMonth((m) => addMonths(m, -1))}
                            className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
                            disabled={loading}
                        >
                            ‹
                        </button>
                        <div className="text-2xl font-semibold text-slate-900">{monthLabel(month)}</div>
                        <button
                            type="button"
                            onClick={() => setMonth((m) => addMonths(m, 1))}
                            className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
                            disabled={loading}
                        >
                            ›
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-sm text-slate-600">Loading…</div>
                    ) : (
                        <Calendar valueMonth={month} dayBadges={dayBadges} holidaysMap={holidaysMap} readOnly={true} />
                    )}
                </div>

                {/* Request Absence Modal */}
                <ModalShell open={openRequest} title="Request Absence" onClose={() => !busy && setOpenRequest(false)} widthClass="sm:w-[980px]">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-sm text-slate-600">Select your date(s)</div>
                                <div className="text-xs text-slate-500">
                                    Selected: <span className="font-semibold">{selectedDates.length}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-6 mb-4">
                                <button
                                    type="button"
                                    onClick={() => setMonth((m) => addMonths(m, -1))}
                                    className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
                                >
                                    ‹
                                </button>
                                <div className="text-xl font-semibold text-slate-900">{monthLabel(month)}</div>
                                <button
                                    type="button"
                                    onClick={() => setMonth((m) => addMonths(m, 1))}
                                    className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold"
                                >
                                    ›
                                </button>
                            </div>

                            <Calendar valueMonth={month} selectedDates={selectedDates} onToggleDate={toggleDate} dayBadges={dayBadges} holidaysMap={holidaysMap} />
                        </div>

                        <div className="rounded-3xl border border-slate-200 p-5 bg-white">
                            <div className="text-sm font-semibold text-slate-900 mb-3">Request details</div>

                            <div className="space-y-3">
                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-600">Annual remaining</span>
                                        <span className="font-semibold text-slate-900">{balances.annualRemaining}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-slate-600">Sick remaining</span>
                                        <span className="font-semibold text-slate-900">{balances.sickRemaining}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-slate-600">Wedding remaining</span>
                                        <span className="font-semibold text-slate-900">{balances.weddingRemaining}</span>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Type of leave</div>
                                    <select
                                        value={leaveType}
                                        onChange={(e) => setLeaveType(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                    >
                                        <option value="Annual Leave">Annual Leave</option>
                                        <option value="Sick Leave">Sick Leave</option>
                                        <option value="Wedding Leave">Wedding Leave</option>
                                        <option value="Unpaid Leave">Unpaid Leave</option>
                                        <option value="Work From Home">Work From Home</option>
                                    </select>
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Delegate (optional)</div>
                                    <select
                                        value={delegate}
                                        onChange={(e) => setDelegate(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                        disabled={employeesLoading || busy}
                                    >
                                        <option value="">No delegate</option>
                                        {employees.map((emp) => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.label}
                                            </option>
                                        ))}
                                    </select>

                                    {!delegateWarning.ok && delegate ? (
                                        <div className="mt-2 text-xs font-semibold text-rose-600">{delegateWarning.text}</div>
                                    ) : null}

                                    {delegateWarning.ok && delegate ? (
                                        <div className="mt-2 text-[11px] text-slate-500">
                                            Selected: <span className="font-semibold text-slate-700">{delegateLabelById(delegate)}</span>
                                        </div>
                                    ) : null}
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Comments</div>
                                    <textarea
                                        value={comments}
                                        onChange={(e) => setComments(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[120px] bg-white text-slate-900 placeholder:text-slate-400"
                                        placeholder="Optional"
                                    />
                                </div>

                                {needsBalanceCheck && selectedDays > remainingForSelectedType ? (
                                    <div className="text-xs text-rose-600 font-semibold">Not enough balance for {leaveType}.</div>
                                ) : null}

                                <div className="pt-2 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setOpenRequest(false)}
                                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-rose-50 text-rose-600 hover:opacity-90"
                                        disabled={busy}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        disabled={!canSubmitRequest || busy}
                                        onClick={submitRequest}
                                        className={cn(
                                            "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                            !canSubmitRequest || busy
                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                        )}
                                        title={!delegateWarning.ok ? "Delegate is not available for selected dates" : ""}
                                    >
                                        {busy ? "Submitting..." : "Submit"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </ModalShell>

                {/* Absence Status Modal */}
                <ModalShell open={openStatus} title="Absence Status" onClose={() => setOpenStatus(false)} widthClass="sm:w-[900px]">
                    <div className="space-y-3">
                        {requests.length === 0 ? (
                            <div className="text-sm text-slate-600">No requests yet.</div>
                        ) : (
                            requests.map((r) => {
                                const canDelete = isInProgress(r.status);

                                return (
                                    <div
                                        key={r.id}
                                        className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-3 w-3 rounded-full",
                                                r.status === "accepted" ? "bg-emerald-300" : r.status === "cancelled" ? "bg-rose-300" : r.status === "pending" ? "bg-amber-300" : "bg-sky-300"
                                            )}
                                        />
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 truncate">{formatRange(r.start, r.end)}</div>
                                            <div className="text-xs text-slate-600 mt-0.5">{normalizeType(r.type)}</div>

                                            {r.delegate ? (
                                                <div className="mt-1 text-xs text-slate-600 truncate">
                                                    <span className="font-semibold">Delegate:</span> {delegateLabelById(r.delegate)}
                                                </div>
                                            ) : null}
                                        </div>

                                        <Pill status={r.status} />

                                        <div className="flex items-center gap-4 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!canDelete || busy) return;
                                                    setOpenStatus(false);
                                                    setConfirmDelete(r);
                                                }}
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    canDelete && !busy ? "text-slate-400 hover:text-slate-600" : "text-slate-300 cursor-not-allowed"
                                                )}
                                                title={!canDelete ? "Only In progress / pending can be deleted" : "Delete"}
                                                disabled={!canDelete || busy}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </ModalShell>

                {/* Leave Balance Modal */}
                <ModalShell open={openBalance} title="Leave Balance" onClose={() => setOpenBalance(false)} widthClass="sm:w-[760px]">
                    <div className="space-y-5">
                        <div className="text-sm text-slate-600">Your current balance</div>

                        <div className="rounded-3xl border border-slate-200 p-5">
                            <div className="text-lg font-semibold text-slate-900 mb-3">Annual Leave</div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                                <Box label="Total" value={balances.annualTotal} />
                                <Box label="Used (Accepted)" value={balances.annualUsed} />
                                <Box label="Remaining" value={balances.annualRemaining} />
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 p-5">
                            <div className="text-lg font-semibold text-slate-900 mb-3">Sick Leave</div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                                <Box label="Total" value={balances.sickTotal} />
                                <Box label="Used (Accepted)" value={balances.sickUsed} />
                                <Box label="Remaining" value={balances.sickRemaining} />
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 p-5">
                            <div className="text-lg font-semibold text-slate-900 mb-3">Wedding Leave</div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                                <Box label="Total" value={balances.weddingTotal} />
                                <Box label="Used (Accepted)" value={balances.weddingUsed} />
                                <Box label="Remaining" value={balances.weddingRemaining} />
                            </div>
                        </div>
                    </div>
                </ModalShell>

                {/* Confirm Delete Modal */}
                <ModalShell
                    open={!!confirmDelete}
                    title="Delete request?"
                    onClose={() => !busy && setConfirmDelete(null)}
                    widthClass="sm:w-[520px]"
                    zClass="z-[9999]"
                >
                    {confirmDelete ? (
                        <div className="space-y-4">
                            <div className="text-sm text-slate-700">Are you sure you want to delete this leave request?</div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-900">{formatRange(confirmDelete.start, confirmDelete.end)}</div>
                                <div className="text-xs text-slate-600 mt-1">{normalizeType(confirmDelete.type)}</div>
                                <div className="mt-2">
                                    <Pill status={confirmDelete.status} />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(null)}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    disabled={busy}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const id = confirmDelete.id;
                                        setConfirmDelete(null);
                                        await deleteRequest(id);
                                    }}
                                    className={cn(
                                        "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                        busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-rose-50 text-rose-700 border-rose-200 hover:opacity-90"
                                    )}
                                    disabled={busy}
                                >
                                    {busy ? "Deleting..." : "Delete"}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </ModalShell>
            </div>
        </SideBarLayout>
    );
}