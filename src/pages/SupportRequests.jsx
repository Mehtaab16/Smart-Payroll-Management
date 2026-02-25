// client/src/pages/SupportRequests.jsx ✅ FULL FILE
import { useEffect, useMemo, useState } from "react";
import SideBarLayout from "../components/SideBarLayout.jsx";
import {
    getSupportTickets,
    createSupportTicket,
    getSupportTicketById,
    sendSupportMessage,
    deleteSupportTicket,
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
function Card({ title, children, className = "" }) {
    return (
        <div className={cn("rounded-3xl bg-white border border-slate-200 p-5 shadow-sm", className)}>
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
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

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[860px]", zClass = "z-50" }) {
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

                    <div className="p-6 text-slate-900 max-h-[78vh] overflow-y-auto [&_select]:text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900">
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

function PendingPill() {
    return (
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-100">
            Pending sync
        </span>
    );
}

export default function SupportRequests() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);

    // Filters
    const [filterType, setFilterType] = useState("all"); // all | payroll | technical
    const [filterStatus, setFilterStatus] = useState("all"); // all | not_started | in_progress | resolved | closed

    const [openCreate, setOpenCreate] = useState(false);
    const [createType, setCreateType] = useState("technical");

    const [form, setForm] = useState({
        title: "",
        priority: "low",
        dueDate: "",
        description: "",
    });
    const [files, setFiles] = useState([]);

    const [openView, setOpenView] = useState(false);
    const [active, setActive] = useState(null);

    const [replyText, setReplyText] = useState("");
    const [replyFiles, setReplyFiles] = useState([]);

    const UPLOAD_NOTE = "Allowed: PDF, PNG, JPG, DOC, DOCX, TXT • Max 5MB (up to 5 files)";

    const modalOpen = openCreate || openView;

    // Prefill user
    const user = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("user") || "{}");
        } catch {
            return {};
        }
    }, []);

    // ✅ resolve employee info cleanly (NO N/A)
    const employeeNumberPrefill = String(user.employeeId || user.employeeNumber || "").trim();
    const employeeEmailPrefill = String(user.email || "").trim();

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const list = await getSupportTickets({
                q,
                type: filterType === "all" ? "" : filterType,
                status: filterStatus === "all" ? "" : filterStatus,
            });

            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load support tickets." });
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
    }, [filterType, filterStatus]);

    // ✅ auto refresh when outbox flushes (support)
    useEffect(() => {
        async function onFlushed(e) {
            const mods = e?.detail?.modules || [];
            if (!mods.includes("support")) return;

            await loadAll();

            // refresh the opened ticket if it’s a real mongo id
            if (active?._id && !String(active._id).startsWith("local_")) {
                try {
                    const t = await getSupportTicketById(active._id);
                    setActive(t);
                } catch { }
            }

            setPageMsg({ kind: "success", text: "Synced support changes." });
        }

        window.addEventListener("outbox:flushed", onFlushed);
        return () => window.removeEventListener("outbox:flushed", onFlushed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active?._id, filterType, filterStatus, q]);

    function openCreateTicket(type) {
        setCreateType(type);
        setModalMsg({ kind: "info", text: "" });

        setForm({
            title: type === "technical" ? "Login / Access issue" : "Payroll question",
            priority: type === "technical" ? "medium" : "low",
            dueDate: "",
            description: "",
        });

        setFiles([]);
        setOpenCreate(true);
    }

    async function submitCreate() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(form.title).trim()) throw new Error("Title is required.");

            // ✅ these must be prefilled
            if (!employeeNumberPrefill) throw new Error("Employee number is missing. Please update your profile.");
            if (!employeeEmailPrefill) throw new Error("Email is missing. Please log in again or update your profile.");

            const res = await createSupportTicket({
                type: createType,
                title: form.title,
                description: form.description,
                priority: form.priority,
                dueDate: form.dueDate || null,
                employeeNumber: employeeNumberPrefill,
                employeeEmail: employeeEmailPrefill,
                files,
            });

            setOpenCreate(false);

            // ✅ offline queued => optimistic ticket
            if (res?.queued) {
                const localId = `local_${res.queueId}`;
                const optimistic = {
                    _id: localId,
                    _pending: true,
                    type: createType,
                    title: form.title,
                    description: form.description || "",
                    priority: form.priority || "low",
                    dueDate: form.dueDate || null,
                    status: "not_started",
                    assignedToRole: createType === "technical" ? "admin" : "payroll_manager",
                    attachments: [],
                    messages: [],
                    employeeNumber: employeeNumberPrefill,
                    employeeEmail: employeeEmailPrefill,
                    createdAt: new Date().toISOString(),
                    lastActionAt: new Date().toISOString(),
                };

                setItems((prev) => [optimistic, ...(prev || [])]);
                setPageMsg({ kind: "success", text: "You are offline. Ticket queued and will send automatically when online." });
                return;
            }

            setPageMsg({ kind: "success", text: "Ticket created." });
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to create ticket." });
        } finally {
            setBusy(false);
        }
    }

    async function openTicket(id) {
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            // local (queued) tickets cannot be opened (no backend yet)
            if (String(id).startsWith("local_")) {
                const local = items.find((x) => String(x._id) === String(id));
                setActive(local || null);
                setReplyText("");
                setReplyFiles([]);
                setModalMsg({ kind: "success", text: "This ticket is pending sync. It will appear fully once online." });
                setOpenView(true);
                return;
            }

            const t = await getSupportTicketById(id);
            setActive(t);
            setReplyText("");
            setReplyFiles([]);
            setModalMsg({ kind: "info", text: "" });
            setOpenView(true);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to open ticket." });
        } finally {
            setBusy(false);
        }
    }

    async function sendReply() {
        if (!active?._id || busy) return;

        // cannot reply to local pending ticket
        if (String(active._id).startsWith("local_")) {
            setModalMsg({ kind: "error", text: "This ticket is pending sync. Go online to send messages." });
            return;
        }

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            const updated = await sendSupportMessage(active._id, { text: replyText, files: replyFiles });

            // ✅ offline queued => optimistic message in UI
            if (updated?.queued) {
                const optimisticMsg = {
                    _id: `local_${updated.queueId}`,
                    _pending: true,
                    senderRole: "employee",
                    text: replyText,
                    attachments: [],
                    createdAt: new Date().toISOString(),
                };

                setActive((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        messages: [...(prev.messages || []), optimisticMsg],
                        lastActionAt: new Date().toISOString(),
                        status: prev.status === "not_started" ? "in_progress" : prev.status,
                    };
                });

                setModalMsg({ kind: "success", text: "You are offline. Message queued and will send when online." });
                setReplyText("");
                setReplyFiles([]);
                return;
            }

            setActive(updated);
            setReplyText("");
            setReplyFiles([]);
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to send message." });
        } finally {
            setBusy(false);
        }
    }

    async function removeTicket(id) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const res = await deleteSupportTicket(id);

            // ✅ offline queued (+ optimistic UI)
            if (res?.queued) {
                setItems((prev) => prev.filter((x) => x._id !== id));
                if (active?._id === id) {
                    setOpenView(false);
                    setActive(null);
                }
                setPageMsg({ kind: "success", text: "You are offline. Delete queued and will apply when online." });
                return;
            }

            setPageMsg({ kind: "success", text: "Ticket deleted." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to delete ticket." });
        } finally {
            setBusy(false);
        }
    }

    const filtered = useMemo(() => {
        const key = q.trim().toLowerCase();
        if (!key) return items;
        return items.filter((t) => String(t.title || "").toLowerCase().includes(key));
    }, [items, q]);

    return (
        <SideBarLayout title="Support Requests" hideWelcome={true}>
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                {!modalOpen ? (
                    <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />
                ) : null}

                {/* Top actions */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">Support Requests</div>
                        <div className="text-sm text-slate-600">Create a ticket and discuss with the assigned team.</div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            type="button"
                            onClick={() => openCreateTicket("payroll")}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            disabled={loading}
                        >
                            Payroll Support
                        </button>

                        <button
                            type="button"
                            onClick={() => openCreateTicket("technical")}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950"
                            disabled={loading}
                        >
                            Technical Support
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
                    <Card title="Support Request List">
                        <div className="flex flex-col gap-3 mb-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search tickets..."
                                    className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white"
                                />

                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white text-slate-900"
                                    disabled={busy}
                                >
                                    <option value="all">All types</option>
                                    <option value="payroll">Payroll</option>
                                    <option value="technical">Technical</option>
                                </select>

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
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-sm text-slate-600">Loading…</div>
                        ) : filtered.length === 0 ? (
                            <div className="text-sm text-slate-700">No tickets yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {filtered.map((t) => (
                                    <div key={t._id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-slate-900 truncate">{t.title}</div>
                                                <div className="text-xs text-slate-600 mt-1">
                                                    Last action: {fmtDateTime(t.lastActionAt)} • Created: {fmtDate(t.createdAt)}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {t._pending ? <PendingPill /> : null}
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
                                                <button
                                                    type="button"
                                                    onClick={() => removeTicket(t._id)}
                                                    className="text-sm font-semibold text-slate-400 hover:text-slate-600"
                                                    disabled={busy}
                                                    title="You can delete only if not resolved/closed (employee)."
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card title="Quick Tips" className="border-indigo-500/20">
                        <div className="text-sm text-slate-700">
                            Choose <span className="font-semibold">Payroll Support</span> for payslips/tax/salary questions (routes to Payroll Manager).
                            Choose <span className="font-semibold">Technical Support</span> for login/access/system issues (routes to Admin).
                        </div>

                        <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                            <span className="font-semibold">Uploads:</span> {UPLOAD_NOTE}
                        </div>
                    </Card>
                </div>

                {/* Create Ticket Modal */}
                <ModalShell
                    open={openCreate}
                    title={createType === "technical" ? "New Technical Ticket" : "New Payroll Ticket"}
                    onClose={() => !busy && setOpenCreate(false)}
                    widthClass="sm:w-[860px]"
                >
                    <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                    <div className="space-y-4">
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                            <span className="font-semibold">Assigned to:</span>{" "}
                            {createType === "technical" ? "Admin (Technical Support)" : "Payroll Manager (Payroll Support)"}
                            <div className="text-[11px] text-slate-500 mt-1">{UPLOAD_NOTE}</div>
                        </div>

                        {/* Prefilled identity fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Employee Number</div>
                                <input
                                    value={employeeNumberPrefill}
                                    disabled
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-700 cursor-not-allowed"
                                    placeholder="(missing)"
                                />
                                {!employeeNumberPrefill ? (
                                    <div className="text-[11px] text-rose-600 mt-1">Missing employee number (update profile).</div>
                                ) : null}
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Email</div>
                                <input
                                    value={employeeEmailPrefill}
                                    disabled
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-700 cursor-not-allowed"
                                    placeholder="(missing)"
                                />
                                {!employeeEmailPrefill ? (
                                    <div className="text-[11px] text-rose-600 mt-1">Missing email (log in again / update profile).</div>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Title *</div>
                                <input
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    placeholder="Short title..."
                                />
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Priority</div>
                                <select
                                    value={form.priority}
                                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Due date (optional)</div>
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Description</div>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[140px] bg-white"
                                placeholder="Describe the issue..."
                            />
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Upload documents (optional)</div>
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
                                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenCreate(false)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-rose-50 text-rose-600 hover:opacity-90"
                                disabled={busy}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={submitCreate}
                                className={cn(
                                    "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                    busy
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                )}
                                disabled={busy}
                            >
                                {busy ? "Submitting..." : "Submit"}
                            </button>
                        </div>
                    </div>
                </ModalShell>

                {/* View Ticket Modal (Chat) */}
                <ModalShell
                    open={openView}
                    title={active ? `Ticket: ${active.title}` : "Ticket"}
                    onClose={() => !busy && setOpenView(false)}
                    widthClass="sm:w-[980px]"
                >
                    <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                    {active ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    {active._pending ? <PendingPill /> : null}
                                    <TypePill type={active.type} />
                                    <StatusPill status={active.status} />
                                    <PriorityPill priority={active.priority} />
                                    <span className="text-xs text-slate-600 ml-auto">Created {fmtDateTime(active.createdAt)}</span>
                                </div>

                                {active.employeeNumber || active.employeeEmail ? (
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

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900 mb-3">Discussion</div>

                                <div className="space-y-3 max-h-[320px] overflow-auto pr-2">
                                    {active.messages?.length ? (
                                        active.messages.map((m) => (
                                            <div key={m._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-xs font-semibold text-slate-700">
                                                        {m.senderRole}
                                                        {m._pending ? <span className="ml-2 text-[11px] text-amber-700">(pending)</span> : null}
                                                    </div>
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
                                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950"
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
                                            disabled={busy || String(active?._id || "").startsWith("local_")}
                                            title={String(active?._id || "").startsWith("local_") ? "Pending sync - go online to reply" : "Send"}
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
        </SideBarLayout>
    );
}