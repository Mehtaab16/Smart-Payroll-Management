import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import {
    listAccessRights,
    createAccessRight,
    updateAccessRight,
    deleteAccessRight,
    resendAccessEmail,
} from "../api/accessRightsApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function MessageBox({ kind = "info", message, onClose }) {
    if (!message) return null;
    const styles =
        kind === "error"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-800";

    return (
        <div className={cn("mb-4 rounded-2xl border px-4 py-3 shadow-sm", styles)}>
            <div className="flex items-start justify-between gap-3">
                <div className="text-sm">{message}</div>
                <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
                    type="button"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[900px]" }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
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
                            type="button"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="p-6 text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900 [&_select]:text-slate-900">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ConfirmModal({ open, title = "Confirm", message, confirmText = "Confirm", tone = "danger", onCancel, onConfirm, busy }) {
    if (!open) return null;

    const confirmClass =
        tone === "danger"
            ? "border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800"
            : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800";

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onCancel} />
            <div className="absolute left-1/2 top-1/2 w-[94vw] sm:w-[520px] -translate-x-1/2 -translate-y-1/2">
                <div className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                        <div>
                            <div className="text-lg font-semibold text-slate-900">{title}</div>
                            <div className="text-sm text-slate-600 mt-1">{message}</div>
                        </div>
                        <button
                            onClick={busy ? undefined : onCancel}
                            className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                            type="button"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="p-6 flex items-center justify-end gap-3">
                        <button
                            onClick={busy ? undefined : onCancel}
                            className="rounded-xl px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold"
                            type="button"
                            disabled={busy}
                        >
                            Cancel
                        </button>

                        <button
                            onClick={busy ? undefined : onConfirm}
                            className={cn("rounded-xl px-4 py-2 border font-semibold", confirmClass, busy ? "opacity-60 cursor-not-allowed" : "")}
                            type="button"
                            disabled={busy}
                        >
                            {busy ? "Please wait..." : confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Card({ title, children }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

export default function AccessRights() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [items, setItems] = useState([]);
    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });

    const [openForm, setOpenForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [confirm, setConfirm] = useState({ open: false, mode: "", row: null });

    const [form, setForm] = useState({
        fullName: "",
        email: "",
        role: "payroll_manager",
        isActive: true,
    });

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });
        try {
            const list = await listAccessRights();
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load access rights." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
    }, []);

    const activeCount = useMemo(() => items.filter((x) => x.isActive).length, [items]);

    function openCreate() {
        setEditing(null);
        setModalMsg({ kind: "info", text: "" });
        setForm({ fullName: "", email: "", role: "payroll_manager", isActive: true });
        setOpenForm(true);
    }

    function openEdit(row) {
        setEditing(row);
        setModalMsg({ kind: "info", text: "" });
        setForm({
            fullName: row.fullName || "",
            email: row.email || "",
            role: row.role || "payroll_manager",
            isActive: row.isActive !== false,
        });
        setOpenForm(true);
    }

    async function submit() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(form.fullName).trim()) throw new Error("Full name is required.");
            if (!String(form.email).trim()) throw new Error("Email is required.");

            if (editing?.id) {
                await updateAccessRight(editing.id, {
                    fullName: form.fullName,
                    email: form.email,
                    role: form.role,
                    isActive: form.isActive,
                });
                setPageMsg({ kind: "success", text: "Access updated." });
            } else {
                await createAccessRight({ fullName: form.fullName, email: form.email, role: form.role });
                setPageMsg({ kind: "success", text: "Access created" });
            }

            setOpenForm(false);
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save access." });
        } finally {
            setBusy(false);
        }
    }

    function askToggle(row) {
        setConfirm({ open: true, mode: row.isActive ? "deactivate" : "activate", row });
    }

    async function doToggle(row) {
        const next = !row.isActive;
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            await updateAccessRight(row.id, { isActive: next });
            setPageMsg({ kind: "success", text: next ? "Access activated." : "Access deactivated." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to update access." });
        } finally {
            setBusy(false);
            setConfirm({ open: false, mode: "", row: null });
        }
    }

    function askRemove(row) {
        setConfirm({ open: true, mode: "remove", row });
    }

    async function doRemove(row) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            await deleteAccessRight(row.id);
            setPageMsg({ kind: "success", text: "Access removed." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to remove access." });
        } finally {
            setBusy(false);
            setConfirm({ open: false, mode: "", row: null });
        }
    }

    function askResend(row) {
        setConfirm({ open: true, mode: "resend", row });
    }

    async function doResend(row) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            await resendAccessEmail(row.id);
            setPageMsg({ kind: "success", text: "Email sent again." });
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to resend email." });
        } finally {
            setBusy(false);
            setConfirm({ open: false, mode: "", row: null });
        }
    }

    return (
        <BackOfficeLayout title="Access Rights">
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                    <div>
                        <div className="text-slate-900 font-semibold">Back Office Users</div>
                        <div className="text-slate-600 text-sm">
                            {activeCount} active • {items.length} total
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={openCreate}
                        className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                    >
                        + Add Access
                    </button>
                </div>

                <Card title="Admin & Payroll Manager Access">
                    {loading ? (
                        <div className="text-slate-600 text-sm">Loading…</div>
                    ) : items.length === 0 ? (
                        <div className="text-slate-600 text-sm">No access entries yet.</div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((r) => (
                                <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-slate-900 font-semibold truncate">
                                                {r.fullName || "—"}{" "}
                                                <span className="text-slate-500 text-xs font-normal">• {r.email}</span>
                                            </div>
                                            <div className="text-slate-600 text-sm mt-1">
                                                Role:{" "}
                                                <span className="font-semibold text-slate-800">
                                                    {r.role === "admin" ? "Admin" : "Payroll Manager"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <span
                                                className={cn(
                                                    "text-xs font-semibold rounded-full px-3 py-1 border",
                                                    r.isActive ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"
                                                )}
                                            >
                                                {r.isActive ? "Active" : "Inactive"}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() => openEdit(r)}
                                                className="text-sm font-semibold text-slate-700 hover:underline"
                                                disabled={busy}
                                            >
                                                Edit
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => askResend(r)}
                                                className="text-sm font-semibold text-indigo-700 hover:underline"
                                                disabled={busy}
                                            >
                                                Resend Email
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => askToggle(r)}
                                                className={cn(
                                                    "text-sm font-semibold hover:underline",
                                                    r.isActive ? "text-rose-700" : "text-emerald-700"
                                                )}
                                                disabled={busy}
                                            >
                                                {r.isActive ? "Deactivate" : "Activate"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => askRemove(r)}
                                                className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                                                disabled={busy}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* Create/Edit Modal */}
            <ModalShell open={openForm} title={editing ? "Edit Access" : "Add Access"} onClose={() => !busy && setOpenForm(false)}>
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs text-slate-500 mb-1">Full Name *</div>
                        <input
                            value={form.fullName}
                            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                        />
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Email *</div>
                        <input
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                        />
                        <div className="mt-1 text-[11px] text-slate-500">
                            You can edit email address.
                        </div>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Role</div>
                        <select
                            value={form.role}
                            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                        >
                            <option value="payroll_manager">Payroll Manager</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={!!form.isActive}
                                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                            />
                            Active access
                        </label>
                    </div>
                </div>

                <div className="pt-5 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setOpenForm(false)}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
                        disabled={busy}
                    >
                        Close
                    </button>

                    <button
                        type="button"
                        onClick={submit}
                        className={cn(
                            "rounded-2xl px-5 py-2 text-sm font-semibold border",
                            busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                        )}
                        disabled={busy}
                    >
                        {busy ? "Saving..." : "Save"}
                    </button>
                </div>
            </ModalShell>

            {/* Confirm modal */}
            <ConfirmModal
                open={confirm.open}
                title={
                    confirm.mode === "remove"
                        ? "Remove access?"
                        : confirm.mode === "resend"
                            ? "Resend email?"
                            : confirm.mode === "deactivate"
                                ? "Deactivate access?"
                                : "Activate access?"
                }
                message={
                    confirm.row
                        ? confirm.mode === "remove"
                            ? `This will remove back office access for ${confirm.row.email}.`
                            : confirm.mode === "resend"
                                ? `This will send the welcome email again to ${confirm.row.email}.`
                                : confirm.mode === "deactivate"
                                    ? `Are you sure you want to deactivate ${confirm.row.email}?`
                                    : `Are you sure you want to activate ${confirm.row.email}?`
                        : ""
                }
                confirmText={
                    confirm.mode === "remove"
                        ? "Remove"
                        : confirm.mode === "resend"
                            ? "Resend"
                            : confirm.mode === "deactivate"
                                ? "Deactivate"
                                : "Activate"
                }
                tone={confirm.mode === "deactivate" || confirm.mode === "remove" ? "danger" : "success"}
                busy={busy}
                onCancel={() => !busy && setConfirm({ open: false, mode: "", row: null })}
                onConfirm={() => {
                    if (!confirm.row) return;
                    if (confirm.mode === "remove") doRemove(confirm.row);
                    else if (confirm.mode === "resend") doResend(confirm.row);
                    else doToggle(confirm.row);
                }}
            />
        </BackOfficeLayout>
    );
}
