import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { listPaycodes, createPaycode, updatePaycode, archivePaycode, bulkAddPaycodes } from "../api/paycodesApi.js";

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
                <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm font-semibold" type="button">
                    ✕
                </button>
            </div>
        </div>
    );
}

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[920px]" }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className={cn("absolute left-1/2 top-1/2 w-[94vw] -translate-x-1/2 -translate-y-1/2", widthClass)}>
                <div className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
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

function ConfirmModal({ open, title, message, confirmText = "Confirm", tone = "danger", onCancel, onConfirm, busy }) {
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

function Pill({ children, tone = "slate" }) {
    const c =
        tone === "emerald"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : tone === "rose"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : tone === "blue"
                    ? "bg-blue-50 text-blue-800 border-blue-200"
                    : "bg-slate-50 text-slate-800 border-slate-200";

    return <span className={cn("text-xs font-semibold rounded-full px-3 py-1 border", c)}>{children}</span>;
}

export default function Paycodes() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });

    const [items, setItems] = useState([]);

    const [search, setSearch] = useState("");
    const [type, setType] = useState("");
    const [showArchived, setShowArchived] = useState(false);

    const [openForm, setOpenForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [confirm, setConfirm] = useState({ open: false, id: null, name: "" });

    const [openBulk, setOpenBulk] = useState(false);
    const [csvText, setCsvText] = useState("");
    const [bulkResult, setBulkResult] = useState(null);

    const [form, setForm] = useState({
        name: "",
        code: "",
        type: "earning",
        visibleOnPayslip: true,
        active: true,
        calcType: "fixed",
        defaultPriority: 100,
    });

    async function load() {
        setLoading(true);
        try {
            const list = await listPaycodes({
                search: search.trim(),
                type: type || "",
                archived: showArchived ? "true" : "false",
            });
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load paycodes" });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showArchived]);

    const counts = useMemo(() => {
        const total = items.length;
        const active = items.filter((x) => x.active && !x.archivedAt).length;
        return { total, active };
    }, [items]);

    function openCreate() {
        setEditing(null);
        setModalMsg({ kind: "info", text: "" });
        setForm({
            name: "",
            code: "",
            type: "earning",
            visibleOnPayslip: true,
            active: true,
            calcType: "fixed",
            defaultPriority: 100,
        });
        setOpenForm(true);
    }

    function openEdit(p) {
        setEditing(p);
        setModalMsg({ kind: "info", text: "" });
        setForm({
            name: p.name || "",
            code: p.code || "",
            type: p.type || "earning",
            visibleOnPayslip: !!p.visibleOnPayslip,
            active: !!p.active,
            calcType: p.calcType || "fixed",
            defaultPriority: Number(p.defaultPriority ?? 100),
        });
        setOpenForm(true);
    }

    async function submit() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(form.name).trim()) throw new Error("Name is required (e.g. Basic Salary).");
            if (!String(form.code).trim()) throw new Error("Code is required (e.g. BASIC_SALARY).");
            if (!["earning", "deduction"].includes(form.type)) throw new Error("Type must be earning or deduction.");

            const payload = {
                name: form.name,
                code: form.code,
                type: form.type,
                visibleOnPayslip: !!form.visibleOnPayslip,
                active: !!form.active,
                calcType: form.calcType,
                defaultPriority: Number(form.defaultPriority) || 100,
            };

            if (editing?._id) {
                await updatePaycode(editing._id, payload);
                setPageMsg({ kind: "success", text: "Paycode updated." });
            } else {
                await createPaycode(payload);
                setPageMsg({ kind: "success", text: "Paycode created." });
            }

            setOpenForm(false);
            await load();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save paycode" });
        } finally {
            setBusy(false);
        }
    }

    async function doArchive(id) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            await archivePaycode(id);
            setPageMsg({ kind: "success", text: "Paycode archived (not deleted)." });
            await load();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to archive" });
        } finally {
            setBusy(false);
            setConfirm({ open: false, id: null, name: "" });
        }
    }

    async function doBulk() {
        if (busy) return;
        setBusy(true);
        setBulkResult(null);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(csvText).trim()) throw new Error("Paste CSV first.");

            const res = await bulkAddPaycodes(csvText);
            setBulkResult(res);
            setPageMsg({
                kind: "success",
                text: `Bulk add done: ${res.createdCount} created, ${res.skippedCount} skipped.`,
            });
            await load();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Bulk add failed." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <BackOfficeLayout title="Paycodes">
            {/* ✅ Rounded white template wrapper */}
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                    <div>
                        <div className="text-slate-900 font-semibold">Paycodes</div>
                        <div className="text-slate-600 text-sm">
                            Earnings/deductions building blocks • {counts.active} active • {counts.total} shown
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => setOpenBulk(true)}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                        >
                            Bulk Add
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowArchived((v) => !v)}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                        >
                            {showArchived ? "Show Active" : "Show Archived"}
                        </button>

                        <button
                            type="button"
                            onClick={openCreate}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                        >
                            + Add Paycode
                        </button>
                    </div>
                </div>

                <Card title="Search / Filter">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Search (name/code)</div>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400"
                                placeholder="BASIC, transport…"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Type</div>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                            >
                                <option value="">All</option>
                                <option value="earning">Earning</option>
                                <option value="deduction">Deduction</option>
                            </select>
                        </div>

                        <div className="flex items-end gap-3">
                            <button
                                type="button"
                                onClick={load}
                                className={cn(
                                    "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                    busy
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                )}
                                disabled={busy}
                            >
                                {busy ? "Loading..." : "Apply"}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setSearch("");
                                    setType("");
                                }}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                disabled={busy}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </Card>

                <div className="mt-5">
                    <Card title="Paycode List">
                        {loading ? (
                            <div className="text-slate-600 text-sm">Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="text-slate-600 text-sm">No paycodes found.</div>
                        ) : (
                            <div className="space-y-2">
                                {items.map((p) => (
                                    <div key={p._id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-slate-900 font-semibold truncate">
                                                    <span className="font-mono text-xs text-slate-600 mr-2">{p.code}</span>
                                                    {p.name}
                                                </div>

                                                <div className="mt-1 flex flex-wrap gap-2">
                                                    <Pill tone={p.type === "earning" ? "emerald" : "rose"}>{p.type}</Pill>
                                                    <Pill tone="blue">{p.calcType}</Pill>
                                                    <Pill>{p.visibleOnPayslip ? "Visible on payslip" : "Hidden"}</Pill>
                                                    {p.archivedAt ? (
                                                        <Pill tone="rose">Archived</Pill>
                                                    ) : p.active ? (
                                                        <Pill tone="emerald">Active</Pill>
                                                    ) : (
                                                        <Pill tone="rose">Inactive</Pill>
                                                    )}
                                                    <Pill>Priority: {p.defaultPriority ?? 100}</Pill>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(p)}
                                                    className="text-sm font-semibold text-slate-700 hover:underline"
                                                    disabled={busy || !!p.archivedAt}
                                                    title={p.archivedAt ? "Archived paycodes cannot be edited" : "Edit"}
                                                >
                                                    Edit
                                                </button>

                                                {!p.archivedAt ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirm({ open: true, id: p._id, name: `${p.code} — ${p.name}` })}
                                                        className="text-sm font-semibold text-rose-700 hover:underline"
                                                        disabled={busy}
                                                    >
                                                        Archive
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Create/Edit modal */}
            <ModalShell open={openForm} title={editing ? "Edit Paycode" : "Add Paycode"} onClose={() => !busy && setOpenForm(false)}>
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">What do I enter?</div>
                    <div className="mt-1">
                        <span className="font-semibold">Name</span> = label on UI/PDF (e.g. <span className="font-mono">Basic Salary</span>) •{" "}
                        <span className="font-semibold">Code</span> = unique identifier (e.g. <span className="font-mono">BASIC_SALARY</span>)
                    </div>
                    <div className="mt-1">
                        <span className="font-semibold">Calc Type</span>: fixed/percentage/hourly_rate/manual (manual = entered via adjustments)
                    </div>
                    <div className="mt-1">
                        <span className="font-semibold">Priority</span>: lower shows earlier on payslip.
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs text-slate-500 mb-1">Name *</div>
                        <input
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400"
                            placeholder="Basic Salary"
                        />
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Code *</div>
                        <input
                            value={form.code}
                            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 font-mono"
                            placeholder="BASIC_SALARY"
                        />
                        <div className="mt-1 text-[11px] text-slate-500">Uppercase + underscores. Must be unique.</div>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Type</div>
                        <select
                            value={form.type}
                            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                        >
                            <option value="earning">earning</option>
                            <option value="deduction">deduction</option>
                        </select>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Calc Type</div>
                        <select
                            value={form.calcType}
                            onChange={(e) => setForm((f) => ({ ...f, calcType: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                        >
                            <option value="fixed">fixed amount</option>
                            <option value="percentage">percentage</option>
                            <option value="hourly_rate">hourly * rate</option>
                            <option value="manual">manual</option>
                        </select>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Default Priority (ordering)</div>
                        <input
                            type="number"
                            value={form.defaultPriority}
                            onChange={(e) => setForm((f) => ({ ...f, defaultPriority: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-slate-800">
                            <input
                                type="checkbox"
                                checked={form.visibleOnPayslip}
                                onChange={(e) => setForm((f) => ({ ...f, visibleOnPayslip: e.target.checked }))}
                            />
                            Visible on payslip PDF
                        </label>

                        <label className="flex items-center gap-2 text-sm text-slate-800">
                            <input
                                type="checkbox"
                                checked={form.active}
                                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                            />
                            Active
                        </label>
                    </div>
                </div>

                <div className="pt-5 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setOpenForm(false)}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
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
                        {busy ? "Saving..." : editing ? "Save" : "Create"}
                    </button>
                </div>
            </ModalShell>

            {/* Bulk modal */}
            <ModalShell open={openBulk} title="Bulk Add Paycodes" onClose={() => !busy && setOpenBulk(false)} widthClass="sm:w-[980px]">
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                <div className="text-sm text-slate-700 mb-3">
                    CSV format (header required):{" "}
                    <span className="ml-2 font-mono text-xs">code,name,type,calcType,visibleOnPayslip,active,priority</span>
                </div>

                <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[220px] bg-white text-slate-900 placeholder-slate-400 font-mono"
                    placeholder={`code,name,type,calcType,visibleOnPayslip,active,priority
BASIC_SALARY,Basic Salary,earning,fixed,true,true,10
TRANSPORT,Transport Allowance,earning,fixed,true,true,20
TAX,Tax,deduction,manual,true,true,90`}
                />

                <div className="pt-4 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setOpenBulk(false)}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                        disabled={busy}
                    >
                        Close
                    </button>

                    <button
                        type="button"
                        onClick={doBulk}
                        className={cn(
                            "rounded-2xl px-5 py-2 text-sm font-semibold border",
                            busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                        )}
                        disabled={busy}
                    >
                        {busy ? "Processing..." : "Run Bulk Add"}
                    </button>
                </div>

                {bulkResult ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">Result</div>
                        <div className="text-sm text-slate-700 mt-1">
                            Created: <b>{bulkResult.createdCount}</b> • Skipped: <b>{bulkResult.skippedCount}</b>
                        </div>

                        {bulkResult.skipped?.length ? (
                            <div className="mt-4">
                                <div className="text-xs text-slate-600 mb-2">Skipped rows:</div>
                                <div className="space-y-2">
                                    {bulkResult.skipped.map((s, idx) => (
                                        <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                                            <div className="text-slate-900 font-semibold">{s.reason}</div>
                                            <div className="text-xs text-slate-700 mt-1 font-mono">{JSON.stringify(s.row)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </ModalShell>

            {/* Archive confirm */}
            <ConfirmModal
                open={confirm.open}
                title="Archive paycode?"
                message={`Archive "${confirm.name}"? This will disable it (no delete).`}
                confirmText="Archive"
                tone="danger"
                busy={busy}
                onCancel={() => !busy && setConfirm({ open: false, id: null, name: "" })}
                onConfirm={() => confirm.id && doArchive(confirm.id)}
            />
        </BackOfficeLayout>
    );
}
