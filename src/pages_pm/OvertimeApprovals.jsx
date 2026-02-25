// src/pages_pm/OvertimeApprovals.jsx
import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { getOvertimeApprovals, decideOvertimeApproval } from "../api/overtimePmApi.js";

/* utils */
function cn(...s) {
    return s.filter(Boolean).join(" ");
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function ymFromDate(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function monthLabelFromYm(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function ymdPretty(ymd) {
    if (!ymd) return "-";
    const d = new Date(ymd);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString();
}
function getRoleSafe() {
    try {
        const u = JSON.parse(localStorage.getItem("user") || "{}") || {};
        return u?.role || "";
    } catch {
        return "";
    }
}

/* UI */
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

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[980px]" }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className={cn("absolute left-1/2 top-1/2 w-[94vw] -translate-x-1/2 -translate-y-1/2", widthClass)}>
                <div
                    className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
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

                    <div className="max-h-[78vh] overflow-auto p-6 text-slate-900 [&_select]:text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusPill({ status }) {
    const map = {
        inprogress: "bg-sky-50 text-sky-700 border-sky-100",
        accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
        rejected: "bg-rose-50 text-rose-700 border-rose-100",
        cancelled: "bg-slate-100 text-slate-700 border-slate-200",
    };
    const label = {
        inprogress: "In progress",
        accepted: "Accepted",
        rejected: "Rejected",
        cancelled: "Cancelled",
    };

    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[status] || map.inprogress)}>
            {label[status] || "In progress"}
        </span>
    );
}

export default function OvertimeApprovals() {
    const role = getRoleSafe();
    const roleLabel = role === "admin" ? "Admin" : "Payroll Manager";

    const [month, setMonth] = useState(() => ymFromDate(new Date()));
    const [status, setStatus] = useState("inprogress");
    const [q, setQ] = useState("");

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [openView, setOpenView] = useState(false);
    const [active, setActive] = useState(null);
    const [managerNote, setManagerNote] = useState("");

    function prevMonth() {
        const [y, m] = month.split("-").map(Number);
        const d = new Date(y, m - 2, 1);
        setMonth(ymFromDate(d));
    }

    function nextMonth() {
        const [y, m] = month.split("-").map(Number);
        const d = new Date(y, m, 1);
        setMonth(ymFromDate(d));
    }

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const list = await getOvertimeApprovals({ status, month });
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load overtime approvals." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, month]);

    const filtered = useMemo(() => {
        const key = q.trim().toLowerCase();
        if (!key) return items;

        return items.filter((r) => {
            const emp = r.employee || {};
            return (
                String(emp.name || "").toLowerCase().includes(key) ||
                String(emp.email || "").toLowerCase().includes(key) ||
                String(emp.employeeNumber || "").toLowerCase().includes(key) ||
                String(r.reason || "").toLowerCase().includes(key) ||
                String(r.date || "").toLowerCase().includes(key)
            );
        });
    }, [items, q]);

    function openRow(r) {
        setActive(r);
        setManagerNote(r.managerNote || "");
        setModalMsg({ kind: "info", text: "" });
        setOpenView(true);
    }

    async function decide(nextStatus) {
        if (!active?.id || busy) return;
        if (active.status !== "inprogress") {
            setModalMsg({ kind: "error", text: "Only in-progress requests can be decided." });
            return;
        }

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            await decideOvertimeApproval(active.id, { status: nextStatus, managerNote });
            setOpenView(false);
            setPageMsg({ kind: "success", text: nextStatus === "accepted" ? "Approved." : "Rejected." });
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save decision." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <BackOfficeLayout title="Overtime Approvals">
            <MessageBox
                kind={pageMsg.kind}
                message={pageMsg.text}
                onClose={() => setPageMsg({ kind: "info", text: "" })}
            />

            {/* Match Support/ProfileChange layout */}
            <div className="rounded-[28px] bg-slate-50 border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                            <div className="text-2xl font-semibold text-slate-900">Overtime Approvals</div>
                            <div className="text-sm text-slate-600">
                                Reviewing as: <span className="font-semibold">{roleLabel}</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={loadAll}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950"
                            disabled={busy}
                        >
                            Refresh
                        </button>
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                        <div className="flex flex-col lg:flex-row gap-3">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search employee / email / reason / date..."
                                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white"
                            />

                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white text-slate-900"
                                disabled={busy}
                            >
                                <option value="inprogress">In progress (to review)</option>
                                <option value="accepted">Accepted</option>
                                <option value="rejected">Rejected</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="all">All</option>
                            </select>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={prevMonth}
                                    className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold"
                                    disabled={busy}
                                >
                                    ‹
                                </button>
                                <div className="text-sm font-semibold text-slate-800 min-w-[160px] text-center">
                                    {monthLabelFromYm(month)}
                                </div>
                                <button
                                    type="button"
                                    onClick={nextMonth}
                                    className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold"
                                    disabled={busy}
                                >
                                    ›
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="text-sm text-slate-600">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-sm text-slate-700">No overtime requests found.</div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map((r) => {
                                const emp = r.employee || {};
                                return (
                                    <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-slate-900 truncate">
                                                    {emp.name || "Employee"} • {ymdPretty(r.date)} • {r.hours} hour(s)
                                                </div>

                                                <div className="text-xs text-slate-600 mt-1">
                                                    {emp.employeeNumber ? `Employee: ${emp.employeeNumber}` : "Employee: -"}
                                                    {emp.email ? ` • Email: ${emp.email}` : ""}
                                                </div>

                                                <div className="text-xs text-slate-700 mt-2 break-words">{r.reason}</div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <StatusPill status={r.status} />
                                                    {r.startTime && r.endTime ? (
                                                        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                                                            {r.startTime} → {r.endTime}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                                                            Manual hours
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => openRow(r)}
                                                    className="text-sm font-semibold text-slate-700 hover:underline"
                                                    disabled={busy}
                                                >
                                                    View
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <ModalShell
                open={openView}
                title={active ? `Overtime • ${active.employee?.name || "Employee"}` : "Overtime"}
                onClose={() => !busy && setOpenView(false)}
            >
                <MessageBox
                    kind={modalMsg.kind}
                    message={modalMsg.text}
                    onClose={() => setModalMsg({ kind: "info", text: "" })}
                />

                {active ? (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusPill status={active.status} />
                                <span className="text-xs text-slate-600 ml-auto">
                                    Date {ymdPretty(active.date)} • {active.hours} hour(s)
                                </span>
                            </div>

                            <div className="text-xs text-slate-600 mt-2">
                                {active.employee?.employeeNumber ? (
                                    <>
                                        Employee: <span className="font-semibold">{active.employee.employeeNumber}</span>
                                    </>
                                ) : null}
                                {active.employee?.employeeNumber && active.employee?.email ? <span> • </span> : null}
                                {active.employee?.email ? (
                                    <>
                                        Email: <span className="font-semibold">{active.employee.email}</span>
                                    </>
                                ) : null}
                            </div>

                            <div className="text-sm text-slate-800 mt-3">
                                <div className="font-semibold">Time</div>
                                <div>
                                    {active.startTime && active.endTime ? `${active.startTime} → ${active.endTime}` : "Manual hours"}
                                </div>
                            </div>

                            <div className="text-sm text-slate-800 mt-3 whitespace-pre-wrap">
                                <div className="font-semibold">Reason</div>
                                <div>{active.reason}</div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-sm font-semibold text-slate-900 mb-2">Decision</div>
                            <div className="text-xs text-slate-600 mb-2">Optional manager note (visible to employee).</div>

                            <textarea
                                value={managerNote}
                                onChange={(e) => setManagerNote(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[110px] bg-white"
                                placeholder="Write a note… (optional)"
                                disabled={busy}
                            />

                            <div className="pt-3 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOpenView(false)}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950"
                                    disabled={busy}
                                >
                                    Close
                                </button>

                                <button
                                    type="button"
                                    onClick={() => decide("rejected")}
                                    className={cn(
                                        "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                        busy
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-rose-50 text-rose-700 border-rose-200 hover:opacity-90"
                                    )}
                                    disabled={busy || active.status !== "inprogress"}
                                    title={active.status !== "inprogress" ? "Already decided" : "Reject"}
                                >
                                    {busy ? "Saving..." : "Reject"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => decide("accepted")}
                                    className={cn(
                                        "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                        busy
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                    )}
                                    disabled={busy || active.status !== "inprogress"}
                                    title={active.status !== "inprogress" ? "Already decided" : "Approve"}
                                >
                                    {busy ? "Saving..." : "Approve"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </ModalShell>
        </BackOfficeLayout>
    );
}
