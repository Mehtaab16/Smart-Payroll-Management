import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import {
    getSupportTickets,
    getSupportTicketById,
    sendSupportMessage,
    updateSupportTicket,
} from "../api/supportApi.js";

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
function fmtDateTime(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
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

/**
 * ✅ Scroll-safe modal:
 * - fixed height (vh)
 * - header stays visible
 * - body scrolls
 */
function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[980px]" }) {
    // lock background scroll
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev || "";
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />

            <div className={cn("absolute left-1/2 top-1/2 w-[94vw] -translate-x-1/2 -translate-y-1/2", widthClass)}>
                <div
                    className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* header */}
                    <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
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

                    {/* body scroll */}
                    <div className="p-6 text-slate-900 overflow-auto flex-1 [&_select]:text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusPill({ status }) {
    const map = {
        not_started: "bg-slate-50 text-slate-700 border-slate-200",
        in_progress: "bg-sky-50 text-sky-700 border-sky-100",
        resolved: "bg-emerald-50 text-emerald-700 border-emerald-100",
        closed: "bg-slate-100 text-slate-700 border-slate-200",
    };
    const label = {
        not_started: "Not started",
        in_progress: "In progress",
        resolved: "Resolved",
        closed: "Closed",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[status] || map.not_started)}>
            {label[status] || "Not started"}
        </span>
    );
}

function PriorityPill({ priority }) {
    const map = {
        low: "bg-emerald-50 text-emerald-700 border-emerald-100",
        medium: "bg-amber-50 text-amber-700 border-amber-100",
        high: "bg-rose-50 text-rose-700 border-rose-100",
    };
    const label = { low: "Low", medium: "Medium", high: "High" };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[priority] || map.low)}>
            {label[priority] || "Low"}
        </span>
    );
}

function TypePill({ type }) {
    const map = {
        technical: "bg-violet-50 text-violet-700 border-violet-100",
        payroll: "bg-indigo-50 text-indigo-700 border-indigo-100",
    };
    const label = { technical: "Technical", payroll: "Payroll" };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[type] || map.technical)}>
            {label[type] || "Technical"}
        </span>
    );
}

const UPLOAD_NOTE = "Allowed: PDF, PNG, JPG, DOC, DOCX, TXT • Max 5MB (up to 5 files)";

function getRoleSafe() {
    try {
        const u = JSON.parse(localStorage.getItem("user") || "{}") || {};
        return u?.role || "";
    } catch {
        return "";
    }
}

// ✅ NEW indicator logic (same as dashboard)
function isNewResponseTicket(t) {
    if (!t) return false;
    if (!["not_started", "in_progress"].includes(t.status)) return false;
    const msgs = Array.isArray(t.messages) ? t.messages : [];
    if (msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    return String(last?.senderRole || "") === "employee";
}

export default function PMSupportTickets() {
    const role = getRoleSafe(); // admin | payroll_manager
    const isAdmin = role === "admin";
    const roleLabel = isAdmin ? "Admin" : "Payroll Manager";

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);

    const [filterStatus, setFilterStatus] = useState("all");
    const [filterPriority, setFilterPriority] = useState("all");

    const [openView, setOpenView] = useState(false);
    const [active, setActive] = useState(null);

    const [replyText, setReplyText] = useState("");
    const [replyFiles, setReplyFiles] = useState([]);

    const [patch, setPatch] = useState({ status: "", priority: "" });

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const list = await getSupportTickets({
                q,
                status: filterStatus === "all" ? "" : filterStatus,
            });

            let arr = Array.isArray(list) ? list : [];

            // keep strict separation (admin sees technical, pm sees payroll)
            arr = arr.filter((t) => (isAdmin ? t.type === "technical" : t.type === "payroll"));

            if (filterPriority !== "all") arr = arr.filter((t) => t.priority === filterPriority);

            setItems(arr);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load tickets." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterStatus, filterPriority]);

    async function openTicket(id) {
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            const t = await getSupportTicketById(id);
            setActive(t);
            setPatch({ status: t.status || "not_started", priority: t.priority || "low" });
            setReplyText("");
            setReplyFiles([]);
            setOpenView(true);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to open ticket." });
        } finally {
            setBusy(false);
        }
    }

    async function saveTicketUpdate() {
        if (!active?._id || busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            const nextPatch = {};
            if (patch.status && patch.status !== active.status) nextPatch.status = patch.status;
            if (patch.priority && patch.priority !== active.priority) nextPatch.priority = patch.priority;

            if (Object.keys(nextPatch).length === 0) {
                setModalMsg({ kind: "info", text: "No changes to save." });
                return;
            }

            const updated = await updateSupportTicket(active._id, nextPatch);
            setActive(updated);
            setModalMsg({ kind: "success", text: "Ticket updated." });
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to update ticket." });
        } finally {
            setBusy(false);
        }
    }

    async function sendReply() {
        if (!active?._id || busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            const updated = await sendSupportMessage(active._id, { text: replyText, files: replyFiles });
            setActive(updated);
            setReplyText("");
            setReplyFiles([]);
            await loadAll(); // ✅ updates NEW badge + dashboard counts when you go back
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to send message." });
        } finally {
            setBusy(false);
        }
    }

    const filtered = useMemo(() => {
        const key = q.trim().toLowerCase();
        if (!key) return items;
        return items.filter((t) => String(t.title || "").toLowerCase().includes(key));
    }, [items, q]);

    const emptyText = isAdmin
        ? "No technical tickets assigned to Admin yet."
        : "No payroll tickets assigned to Payroll Manager yet.";

    return (
        <BackOfficeLayout title="Support Tickets">
            {/* employee-like inner surface */}
            <div className="bg-slate-100 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">Support Tickets</div>
                        <div className="text-sm text-slate-600">
                            Viewing tickets assigned to: <span className="font-semibold">{roleLabel}</span>
                            {isAdmin ? " (Technical)" : " (Payroll)"}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={loadAll}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
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
                                placeholder="Search tickets..."
                                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white"
                            />

                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white text-slate-900"
                                disabled={busy}
                            >
                                <option value="all">All status</option>
                                <option value="not_started">Not started</option>
                                <option value="in_progress">In progress</option>
                                <option value="resolved">Resolved</option>
                                <option value="closed">Closed</option>
                            </select>

                            <select
                                value={filterPriority}
                                onChange={(e) => setFilterPriority(e.target.value)}
                                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white text-slate-900"
                                disabled={busy}
                            >
                                <option value="all">All priority</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>

                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                            <span className="font-semibold">Uploads:</span> {UPLOAD_NOTE}
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-sm text-slate-600">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-sm text-slate-700">{emptyText}</div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map((t) => {
                                const isNew = isNewResponseTicket(t);
                                return (
                                    <div key={t._id} className={cn("rounded-2xl border bg-white px-4 py-3", isNew ? "border-amber-200" : "border-slate-200")}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-semibold text-slate-900 truncate">{t.title}</div>
                                                    {isNew ? (
                                                        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800">
                                                            New
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="text-xs text-slate-600 mt-1">
                                                    Last action: {fmtDateTime(t.lastActionAt)} • Created: {fmtDate(t.createdAt)}
                                                </div>

                                                {(t.employeeNumber || t.employeeEmail) ? (
                                                    <div className="text-xs text-slate-600 mt-1">
                                                        {t.employeeNumber ? (
                                                            <>
                                                                Employee: <span className="font-semibold">{t.employeeNumber}</span>
                                                            </>
                                                        ) : null}
                                                        {t.employeeNumber && t.employeeEmail ? <span> • </span> : null}
                                                        {t.employeeEmail ? (
                                                            <>
                                                                Email: <span className="font-semibold">{t.employeeEmail}</span>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ) : null}

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <TypePill type={t.type} />
                                                    <StatusPill status={t.status} />
                                                    <PriorityPill priority={t.priority} />
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => openTicket(t._id)}
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

                {/* View Modal */}
                <ModalShell
                    open={openView}
                    title={active ? `Ticket: ${active.title}` : "Ticket"}
                    onClose={() => !busy && setOpenView(false)}
                >
                    <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                    {active ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <TypePill type={active.type} />
                                    <StatusPill status={active.status} />
                                    <PriorityPill priority={active.priority} />
                                    <span className="text-xs text-slate-600 ml-auto">Created {fmtDateTime(active.createdAt)}</span>
                                </div>

                                {(active.employeeNumber || active.employeeEmail) ? (
                                    <div className="text-xs text-slate-600 mt-2">
                                        {active.employeeNumber ? (
                                            <>
                                                Employee: <span className="font-semibold">{active.employeeNumber}</span>
                                            </>
                                        ) : null}
                                        {active.employeeNumber && active.employeeEmail ? <span> • </span> : null}
                                        {active.employeeEmail ? (
                                            <>
                                                Email: <span className="font-semibold">{active.employeeEmail}</span>
                                            </>
                                        ) : null}
                                    </div>
                                ) : null}

                                {active.description ? (
                                    <div className="text-sm text-slate-800 mt-3 whitespace-pre-wrap">{active.description}</div>
                                ) : null}

                                {active.attachments?.length ? (
                                    <div className="mt-3">
                                        <div className="text-xs font-semibold text-slate-700 mb-1">Attachments</div>
                                        <div className="flex flex-wrap gap-2">
                                            {active.attachments.map((a, i) => (
                                                <a
                                                    key={i}
                                                    href={`http://localhost:5000${a.url}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 text-indigo-950"
                                                >
                                                    {a.originalName}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {/* Update controls */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900 mb-3">Update ticket</div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Status</div>
                                        <select
                                            value={patch.status || "not_started"}
                                            onChange={(e) => setPatch((p) => ({ ...p, status: e.target.value }))}
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            disabled={busy}
                                        >
                                            <option value="not_started">Not started</option>
                                            <option value="in_progress">In progress</option>
                                            <option value="resolved">Resolved</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>

                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Priority</div>
                                        <select
                                            value={patch.priority || "low"}
                                            onChange={(e) => setPatch((p) => ({ ...p, priority: e.target.value }))}
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            disabled={busy}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="pt-3 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={saveTicketUpdate}
                                        className={cn(
                                            "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                            busy
                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                        )}
                                        disabled={busy}
                                    >
                                        {busy ? "Saving..." : "Save changes"}
                                    </button>
                                </div>
                            </div>

                            {/* Discussion */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900 mb-3">Discussion</div>

                                <div className="space-y-3 max-h-[320px] overflow-auto pr-2">
                                    {active.messages?.length ? (
                                        active.messages.map((m) => (
                                            <div key={m._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-xs font-semibold text-slate-700">{m.senderRole}</div>
                                                    <div className="text-[11px] text-slate-500">{fmtDateTime(m.createdAt)}</div>
                                                </div>

                                                {m.text ? <div className="text-sm text-slate-800 mt-2 whitespace-pre-wrap">{m.text}</div> : null}

                                                {m.attachments?.length ? (
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {m.attachments.map((a, i) => (
                                                            <a
                                                                key={i}
                                                                href={`http://localhost:5000${a.url}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 text-indigo-950"
                                                            >
                                                                {a.originalName}
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm text-slate-600">No messages yet.</div>
                                    )}
                                </div>

                                <div className="mt-4 rounded-2xl border border-slate-200 p-3 bg-white">
                                    <div className="text-xs text-slate-500 mb-1">Reply</div>
                                    <textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[100px] bg-white"
                                        placeholder="Write a message..."
                                    />

                                    <div className="mt-2">
                                        <div className="text-[11px] text-slate-500 mb-1">{UPLOAD_NOTE}</div>
                                        <input
                                            type="file"
                                            multiple
                                            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
                                            onChange={(e) => setReplyFiles(Array.from(e.target.files || []))}
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                        />
                                    </div>

                                    <div className="pt-3 flex items-center justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setOpenView(false)}
                                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                            disabled={busy}
                                        >
                                            Close
                                        </button>

                                        <button
                                            type="button"
                                            onClick={sendReply}
                                            className={cn(
                                                "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                                busy
                                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                            )}
                                            disabled={busy}
                                        >
                                            {busy ? "Sending..." : "Send"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </ModalShell>
            </div>
        </BackOfficeLayout>
    );
}
