import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { getProfileChangeApprovals, decideProfileChangeRequest } from "../api/profileApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

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

function Pill({ tone = "slate", children }) {
    const map = {
        slate: "bg-slate-100 text-slate-700 border-slate-200",
        amber: "bg-amber-50 text-amber-700 border-amber-100",
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
        rose: "bg-rose-50 text-rose-700 border-rose-100",
        sky: "bg-sky-50 text-sky-700 border-sky-100",
        violet: "bg-violet-50 text-violet-700 border-violet-100",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[tone] || map.slate)}>
            {children}
        </span>
    );
}

function fmtDate(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
}

function prettyCategory(c) {
    return c === "bank" ? "Bank" : "Personal";
}

function statusTone(s) {
    if (s === "pending") return "amber";
    if (s === "approved") return "emerald";
    if (s === "rejected") return "rose";
    return "slate";
}

export default function ProfileChangeApprovals() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [q, setQ] = useState("");
    const [status, setStatus] = useState("pending");
    const [items, setItems] = useState([]);

    const [openView, setOpenView] = useState(false);
    const [active, setActive] = useState(null);

    const [reviewNote, setReviewNote] = useState("");

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const list = await getProfileChangeApprovals({ status });
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load requests." });
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
                String(r.category || "").toLowerCase().includes(key) ||
                String(emp.fullName || "").toLowerCase().includes(key) ||
                String(emp.email || "").toLowerCase().includes(key) ||
                String(emp.employeeNumber || "").toLowerCase().includes(key)
            );
        });
    }, [items, q]);

    function openRow(r) {
        setActive(r);
        setReviewNote("");
        setModalMsg({ kind: "info", text: "" });
        setOpenView(true);
    }

    async function decide(nextStatus) {
        if (!active?.id || busy) return;
        if (active.status !== "pending") {
            setModalMsg({ kind: "error", text: "Only pending requests can be decided." });
            return;
        }

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            await decideProfileChangeRequest(active.id, { status: nextStatus, reviewNote });
            setModalMsg({ kind: "success", text: nextStatus === "approved" ? "Approved." : "Rejected." });
            setOpenView(false);
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save decision." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <BackOfficeLayout title="Profile Change Requests" hideWelcome={true}>
            {/* ✅ Same light container + white card as Support */}
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox
                    kind={pageMsg.kind}
                    message={pageMsg.text}
                    onClose={() => setPageMsg({ kind: "info", text: "" })}
                />

                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">Profile Change Requests</div>
                        <div className="text-sm text-slate-600">
                            Review employee requests and approve/reject.
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

                <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
                    <div className="flex flex-col gap-3 mb-4">
                        <div className="flex flex-col lg:flex-row gap-3">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search employee / email / category..."
                                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white"
                            />

                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white text-slate-900"
                                disabled={busy}
                            >
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-sm text-slate-600">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-sm text-slate-700">No requests found.</div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map((r) => {
                                const emp = r.employee || {};
                                const keys = Object.keys(r.payload || {});
                                return (
                                    <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-slate-900 truncate">
                                                    {emp.fullName || "Employee"} • {prettyCategory(r.category)} change
                                                </div>

                                                <div className="text-xs text-slate-600 mt-1">
                                                    {emp.employeeNumber ? `Employee: ${emp.employeeNumber}` : "Employee: -"}
                                                    {emp.email ? ` • Email: ${emp.email}` : ""}
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <Pill tone="violet">{prettyCategory(r.category)}</Pill>
                                                    <Pill tone={statusTone(r.status)}>{String(r.status || "").toUpperCase()}</Pill>
                                                    <Pill tone="slate">{keys.length ? `${keys.length} field(s)` : "No fields"}</Pill>
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

                <ModalShell
                    open={openView}
                    title={active ? `Profile Change • ${prettyCategory(active.category)}` : "Profile Change"}
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
                                    <Pill tone="violet">{prettyCategory(active.category)}</Pill>
                                    <Pill tone={statusTone(active.status)}>{String(active.status || "").toUpperCase()}</Pill>
                                    <span className="text-xs text-slate-600 ml-auto">Submitted {fmtDate(active.createdAt)}</span>
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

                                {active.note ? (
                                    <div className="mt-3 text-sm text-slate-800 whitespace-pre-wrap">
                                        <div className="font-semibold">Employee note</div>
                                        <div>{active.note}</div>
                                    </div>
                                ) : null}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900 mb-2">Requested changes</div>

                                <div className="space-y-2">
                                    {Object.keys(active.payload || {}).length === 0 ? (
                                        <div className="text-sm text-slate-600">No payload.</div>
                                    ) : (
                                        Object.entries(active.payload || {}).map(([k, v]) => (
                                            <div key={k} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                                <div className="text-xs text-slate-500">{k}</div>
                                                <div className="text-sm font-semibold text-slate-900 break-words">{String(v)}</div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {active.reviewNote ? (
                                    <div className="mt-4 text-sm text-slate-800 whitespace-pre-wrap">
                                        <div className="font-semibold">Previous reviewer note</div>
                                        <div>{active.reviewNote}</div>
                                    </div>
                                ) : null}

                                <div className="mt-4">
                                    <div className="text-xs text-slate-500 mb-1">Reviewer note (optional)</div>
                                    <textarea
                                        value={reviewNote}
                                        onChange={(e) => setReviewNote(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[110px] bg-white"
                                        placeholder="Write a short reason (optional)…"
                                        disabled={busy}
                                    />
                                </div>

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
                                        disabled={busy || active.status !== "pending"}
                                        title={active.status !== "pending" ? "Already decided" : "Reject"}
                                    >
                                        {busy ? "Saving..." : "Reject"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => decide("approved")}
                                        className={cn(
                                            "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                            busy
                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                        )}
                                        disabled={busy || active.status !== "pending"}
                                        title={active.status !== "pending" ? "Already decided" : "Approve (applies changes)"}
                                    >
                                        {busy ? "Saving..." : "Approve"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </ModalShell>
            </div>
        </BackOfficeLayout>
    );
}
