import { useEffect, useMemo, useState } from "react";
import SideBarLayout from "../components/SideBarLayout.jsx";
import {
    getMyOvertime,
    createOvertime,
    updateOvertime,
    deleteOvertime,
    getOvertimeSummary,
} from "../api/overtimeApi.js";

/* ---------- utils ---------- */
function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function ymFromDate(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function todayYmd() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthLabelFromYm(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function calcHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return 0;
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const diff = end - start;
    if (diff <= 0) return 0;
    return Math.round((diff / 60) * 100) / 100;
}

function isInProgress(status) {
    return status === "inprogress" || status === "pending";
}

/* ---------- UI bits ---------- */
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

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[760px]", zClass = "z-50" }) {
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

function Pill({ status, pending }) {
    if (pending) {
        return (
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-100">
                Pending sync
            </span>
        );
    }

    const map = {
        inprogress: "bg-sky-50 text-sky-700 border-sky-100",
        accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
        cancelled: "bg-rose-50 text-rose-700 border-rose-100",
        rejected: "bg-rose-50 text-rose-700 border-rose-100",
    };
    const label = {
        inprogress: "In progress",
        accepted: "Accepted",
        cancelled: "Cancelled",
        rejected: "Rejected",
    };
    return (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border", map[status] || map.inprogress)}>
            {label[status] || "In progress"}
        </span>
    );
}

function Card({ title, children, className = "" }) {
    return (
        <div className={cn("rounded-3xl bg-white border border-slate-200 p-5 shadow-sm", className)}>
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

/* ---------- page ---------- */
export default function Overtime() {
    const [month, setMonth] = useState(() => ymFromDate(new Date()));
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({ totalHours: 0, pendingCount: 0 });

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState({ kind: "info", text: "" });

    // modals
    const [openCreate, setOpenCreate] = useState(false);
    const [editing, setEditing] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const modalOpen = openCreate || !!editing || !!confirmDelete;

    // form
    const [form, setForm] = useState({
        date: todayYmd(),
        startTime: "",
        endTime: "",
        hours: "",
        reason: "",
    });

    const computedHours = useMemo(() => {
        const manual = Number(form.hours);
        if (!Number.isNaN(manual) && manual > 0) return manual;
        return calcHours(form.startTime, form.endTime);
    }, [form.hours, form.startTime, form.endTime]);

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

    function resetForm() {
        setForm({
            date: todayYmd(),
            startTime: "",
            endTime: "",
            hours: "",
            reason: "",
        });
    }

    async function loadAll(targetMonth = month) {
        setLoading(true);
        try {
            const [list, sum] = await Promise.all([getMyOvertime(targetMonth), getOvertimeSummary(targetMonth)]);
            setItems(Array.isArray(list) ? list : []);
            setSummary(sum || { totalHours: 0, pendingCount: 0 });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to load overtime." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll(month);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month]);

    useEffect(() => {
        function onFlushed(e) {
            const mods = e?.detail?.modules || [];
            if (!mods.includes("overtime")) return;

            // ✅ reload current month after queued writes were sent
            loadAll(month);
            // optional: show message
            setMsg({ kind: "success", text: "Synced changes." });
        }

        window.addEventListener("outbox:flushed", onFlushed);
        return () => window.removeEventListener("outbox:flushed", onFlushed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month]);
    function openCreateModal() {
        setMsg({ kind: "info", text: "" });
        resetForm();
        setOpenCreate(true);
    }

    function openEditModal(row) {
        setMsg({ kind: "info", text: "" });
        setEditing(row);
        setForm({
            date: row.date || todayYmd(),
            startTime: row.startTime || "",
            endTime: row.endTime || "",
            hours: row.hours != null ? String(row.hours) : "",
            reason: row.reason || "",
        });
    }

    async function submitCreate() {
        if (busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            if (!form.date) throw new Error("Date is required.");
            if (!String(form.reason).trim()) throw new Error("Reason is required.");
            if (!computedHours || computedHours <= 0) throw new Error("Hours must be > 0.");

            const res = await createOvertime({
                date: form.date,
                startTime: form.startTime,
                endTime: form.endTime,
                hours: computedHours,
                reason: form.reason,
            });

            const submittedMonth = String(form.date).slice(0, 7);
            setOpenCreate(false);

            // ✅ if queued -> show queued message (DON'T say "submitted")
            if (res?.queued) {
                setMonth(submittedMonth);
                await loadAll(submittedMonth);
                setMsg({ kind: "success", text: "You are offline. Overtime queued and will send when online." });
                return;
            }

            setMonth(submittedMonth);
            await loadAll(submittedMonth);
            setMsg({ kind: "success", text: "Overtime submitted." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to submit overtime." });
        } finally {
            setBusy(false);
        }
    }

    async function submitEdit() {
        if (busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            if (!editing?.id) throw new Error("Missing record id.");
            if (!String(form.reason).trim()) throw new Error("Reason is required.");
            if (!computedHours || computedHours <= 0) throw new Error("Hours must be > 0.");

            const res = await updateOvertime(editing.id, {
                date: form.date,
                startTime: form.startTime,
                endTime: form.endTime,
                hours: computedHours,
                reason: form.reason,
            });

            const editedMonth = String(form.date).slice(0, 7);

            setEditing(null);
            setMonth(editedMonth);
            await loadAll(editedMonth);

            if (res?.queued) {
                setMsg({ kind: "success", text: "You are offline. Update queued and will sync when online." });
                return;
            }

            setMsg({ kind: "success", text: "Overtime updated." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to update overtime." });
        } finally {
            setBusy(false);
        }
    }

    async function doDelete(id) {
        if (busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            const res = await deleteOvertime(id);
            await loadAll(month);
            if (res?.queued) {
                setMsg({ kind: "success", text: "You are offline. Delete queued and will apply when online." });
                return;
            }

            setMsg({ kind: "success", text: "Overtime deleted." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to delete overtime." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <SideBarLayout title="Overtime" hideWelcome={true}>
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                {!modalOpen ? (
                    <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />
                ) : null}

                <div className="flex items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">Overtime</div>
                        <div className="text-sm text-slate-600">Log overtime and track status.</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={prevMonth}
                            className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold"
                            disabled={loading}
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
                            disabled={loading}
                        >
                            ›
                        </button>

                        <button
                            type="button"
                            onClick={openCreateModal}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            disabled={loading}
                        >
                            Log Overtime
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
                    <Card title="My Overtime Logs">
                        {loading ? (
                            <div className="text-sm text-slate-600">Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="text-sm text-slate-700">No overtime logged for this month.</div>
                        ) : (
                            <div className="space-y-3">
                                {items.map((r) => {
                                    const canEdit = isInProgress(r.status);
                                    const canDelete = isInProgress(r.status);

                                    return (
                                        <div key={r.id} className="rounded-2xl border border-slate-200 px-4 py-3 bg-white">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-slate-900">
                                                        {r.date} • {r.hours} hour(s)
                                                    </div>
                                                    <div className="text-xs text-slate-600 mt-1">
                                                        {r.startTime && r.endTime ? `${r.startTime} → ${r.endTime}` : "Manual hours"}
                                                    </div>
                                                    <div className="text-xs text-slate-700 mt-2 break-words">{r.reason}</div>

                                                    {r.managerNote ? (
                                                        <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                                                            <span className="font-semibold">Manager note:</span> {r.managerNote}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className="flex flex-col items-end gap-2 shrink-0">
                                                    <Pill status={r.status} pending={!!r._pending} />
                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            type="button"
                                                            disabled={!canEdit || busy}
                                                            onClick={() => openEditModal(r)}
                                                            className={cn(
                                                                "text-sm font-semibold",
                                                                canEdit && !busy ? "text-slate-700 hover:underline" : "text-slate-300 cursor-not-allowed"
                                                            )}
                                                            title={!canEdit ? "Only In progress requests can be edited" : "Edit"}
                                                        >
                                                            Edit
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={!canDelete || busy}
                                                            onClick={() => {
                                                                setMsg({ kind: "info", text: "" });
                                                                setConfirmDelete(r);
                                                            }}
                                                            className={cn(
                                                                "text-sm font-semibold",
                                                                canDelete && !busy ? "text-slate-400 hover:text-slate-600" : "text-slate-300 cursor-not-allowed"
                                                            )}
                                                            title={!canDelete ? "Only In progress requests can be deleted" : "Delete"}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card title="This Month Summary" className="border-indigo-500/20">
                        <div className="rounded-3xl bg-violet-50 border border-violet-100 p-5">
                            <div className="text-xs text-slate-600">Total Hours</div>
                            <div className="text-3xl font-semibold text-slate-900 mt-1">{summary.totalHours ?? 0}</div>
                        </div>

                        <div className="mt-4 rounded-3xl bg-sky-50 border border-sky-100 p-5">
                            <div className="text-xs text-slate-600">In progress</div>
                            <div className="text-3xl font-semibold text-slate-900 mt-1">{summary.pendingCount ?? 0}</div>
                        </div>

                        <button
                            type="button"
                            onClick={() => loadAll(month)}
                            className="mt-4 w-full rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
                            disabled={busy}
                        >
                            Refresh
                        </button>
                    </Card>
                </div>

                {/* Create Modal */}
                <ModalShell open={openCreate} title="Log Overtime" onClose={() => !busy && setOpenCreate(false)} widthClass="sm:w-[760px]">
                    <div className="space-y-4">
                        <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Date</div>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                />
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Hours *</div>
                                <input
                                    type="number"
                                    step="0.25"
                                    min="0"
                                    value={form.hours}
                                    onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    placeholder="e.g. 2"
                                />
                                <div className="mt-1 text-[11px] text-slate-500">If empty, hours are calculated from start/end time.</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Start Time</div>
                                <input
                                    type="time"
                                    value={form.startTime}
                                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                />
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">End Time</div>
                                <input
                                    type="time"
                                    value={form.endTime}
                                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm">
                            Calculated Hours: <span className="font-semibold text-slate-900">{computedHours || 0}</span>
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Reason *</div>
                            <textarea
                                value={form.reason}
                                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[120px] bg-white"
                                placeholder="Short reason for overtime…"
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

                {/* Edit Modal */}
                <ModalShell open={!!editing} title="Edit Overtime" onClose={() => !busy && setEditing(null)} widthClass="sm:w-[760px]">
                    {editing ? (
                        <div className="space-y-4">
                            <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                            <div className="text-sm text-slate-600">
                                Only <span className="font-semibold">In progress</span> requests can be edited.
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Date</div>
                                    <input
                                        type="date"
                                        value={form.date}
                                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    />
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Hours *</div>
                                    <input
                                        type="number"
                                        step="0.25"
                                        min="0"
                                        value={form.hours}
                                        onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                        placeholder="e.g. 2"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Start Time</div>
                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    />
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">End Time</div>
                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    />
                                </div>
                            </div>

                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm">
                                Calculated Hours: <span className="font-semibold text-slate-900">{computedHours || 0}</span>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Reason *</div>
                                <textarea
                                    value={form.reason}
                                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[120px] bg-white"
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditing(null)}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-rose-50 text-rose-600 hover:opacity-90"
                                    disabled={busy}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={submitEdit}
                                    className={cn(
                                        "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                        busy
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                    )}
                                    disabled={busy}
                                >
                                    {busy ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </ModalShell>

                {/* Confirm Delete Modal */}
                <ModalShell
                    open={!!confirmDelete}
                    title="Delete overtime?"
                    onClose={() => !busy && setConfirmDelete(null)}
                    widthClass="sm:w-[520px]"
                    zClass="z-[9999]"
                >
                    {confirmDelete ? (
                        <div className="space-y-4">
                            <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                            <div className="text-sm text-slate-700">Are you sure you want to delete this overtime request?</div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-900">
                                    {confirmDelete.date} • {confirmDelete.hours} hour(s)
                                </div>
                                <div className="text-xs text-slate-600 mt-1">
                                    {confirmDelete.startTime && confirmDelete.endTime
                                        ? `${confirmDelete.startTime} → ${confirmDelete.endTime}`
                                        : "Manual hours"}
                                </div>
                                <div className="mt-2">
                                    <Pill status={confirmDelete.status} pending={!!confirmDelete._pending} />
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
                                        await doDelete(id);
                                    }}
                                    className={cn(
                                        "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                        busy
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-rose-50 text-rose-700 border-rose-200 hover:opacity-90"
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
