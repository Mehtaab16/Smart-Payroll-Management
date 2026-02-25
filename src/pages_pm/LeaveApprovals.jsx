// src/pages_pm/LeaveApprovals.jsx
import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { getLeaveApprovals, decideLeave } from "../api/leaveApi.js";

/* utils */
function cn(...s) {
    return s.filter(Boolean).join(" ");
}
function fmtDate(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleDateString();
}
function rangeLabel(a, b) {
    const s = fmtDate(a);
    const e = fmtDate(b);
    return `${s} – ${e}`;
}

/* UI bits */
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

function TypePill({ type }) {
    const map = {
        "Annual Leave": "bg-violet-50 text-violet-700 border-violet-100",
        "Sick Leave": "bg-amber-50 text-amber-700 border-amber-100",
        "Wedding Leave": "bg-emerald-50 text-emerald-700 border-emerald-100",
        "Unpaid Leave": "bg-slate-100 text-slate-700 border-slate-200",
        "Work From Home": "bg-sky-50 text-sky-700 border-sky-100",
    };

    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[type] || "bg-slate-100 text-slate-700 border-slate-200")}>
            {type}
        </span>
    );
}

function getRoleSafe() {
    try {
        const u = JSON.parse(localStorage.getItem("user") || "{}") || {};
        return u?.role || "";
    } catch {
        return "";
    }
}

export default function LeaveApprovals() {
    const role = getRoleSafe(); // admin | payroll_manager
    const roleLabel = role === "admin" ? "Admin" : "Payroll Manager";

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [q, setQ] = useState("");
    const [status, setStatus] = useState("inprogress");
    const [items, setItems] = useState([]);

    const [openView, setOpenView] = useState(false);
    const [active, setActive] = useState(null);

    const [note, setNote] = useState("");

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const list = await getLeaveApprovals({ status });
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load approvals." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    const filtered = useMemo(() => {
        const key = q.trim().toLowerCase();
        if (!key) return items;
        return items.filter((r) => {
            const emp = r.employee || {};
            return (
                String(r.type || "").toLowerCase().includes(key) ||
                String(emp.name || "").toLowerCase().includes(key) ||
                String(emp.email || "").toLowerCase().includes(key) ||
                String(emp.employeeNumber || "").toLowerCase().includes(key)
            );
        });
    }, [items, q]);

    function openRow(r) {
        setActive(r);
        setNote("");
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
            await decideLeave(active.id, { status: nextStatus, note });
            setModalMsg({ kind: "success", text: nextStatus === "accepted" ? "Approved." : "Rejected." });
            setOpenView(false);
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save decision." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <BackOfficeLayout title="Leave Approvals">
            <MessageBox
                kind={pageMsg.kind}
                message={pageMsg.text}
                onClose={() => setPageMsg({ kind: "info", text: "" })}
            />

            {/* ✅ Match Profile Change layout: header INSIDE the white panel */}
            <div className="rounded-[28px] bg-slate-50 border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                            <div className="text-2xl font-semibold text-slate-900">Leave Approvals</div>
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
                                placeholder="Search employee / email / type..."
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
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="text-sm text-slate-600">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-sm text-slate-700">No leave requests found.</div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map((r) => {
                                const emp = r.employee || {};
                                return (
                                    <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-slate-900 truncate">
                                                    {emp.name || "Employee"} • {rangeLabel(r.start, r.end)}
                                                </div>

                                                <div className="text-xs text-slate-600 mt-1">
                                                    {emp.employeeNumber ? `Employee: ${emp.employeeNumber}` : "Employee: -"}
                                                    {emp.email ? ` • Email: ${emp.email}` : ""}
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <TypePill type={r.type} />
                                                    <StatusPill status={r.status} />
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
                title={active ? `Leave Request • ${active.type}` : "Leave Request"}
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
                                <TypePill type={active.type} />
                                <StatusPill status={active.status} />
                                <span className="text-xs text-slate-600 ml-auto">Created {fmtDate(active.createdAt)}</span>
                            </div>

                            {active.employee ? (
                                <div className="text-xs text-slate-600 mt-2">
                                    {active.employee.employeeNumber ? (
                                        <>
                                            Employee: <span className="font-semibold">{active.employee.employeeNumber}</span>
                                        </>
                                    ) : null}
                                    {active.employee.employeeNumber && active.employee.email ? <span> • </span> : null}
                                    {active.employee.email ? (
                                        <>
                                            Email: <span className="font-semibold">{active.employee.email}</span>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}

                            <div className="text-sm text-slate-800 mt-3">
                                <div className="font-semibold">Date range</div>
                                <div>{rangeLabel(active.start, active.end)}</div>
                            </div>

                            {active.delegate ? (
                                <div className="text-sm text-slate-800 mt-3">
                                    <div className="font-semibold">Delegate</div>
                                    <div>{active.delegate}</div>
                                </div>
                            ) : null}

                            {active.comments ? (
                                <div className="text-sm text-slate-800 mt-3 whitespace-pre-wrap">
                                    <div className="font-semibold">Employee comments</div>
                                    <div>{active.comments}</div>
                                </div>
                            ) : null}

                            {active.decisionNote ? (
                                <div className="text-sm text-slate-800 mt-3 whitespace-pre-wrap">
                                    <div className="font-semibold">Decision note</div>
                                    <div>{active.decisionNote}</div>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-sm font-semibold text-slate-900 mb-2">Decision</div>

                            <div className="text-xs text-slate-600 mb-2">Optional note.</div>

                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
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
