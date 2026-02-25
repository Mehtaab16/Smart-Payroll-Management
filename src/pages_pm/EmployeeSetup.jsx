// src/pages/EmployeeSetup.jsx
import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import {
    listEmployees,
    createEmployee,
    updateEmployee,
    deactivateEmployee,
    bulkAddEmployees,
    activateEmployee,
    terminateEmployee,
    rehireEmployee,
} from "../api/employeesApi.js";

import { listPaycodes } from "../api/paycodesApi.js";
import { listEmployeePaycodes, createEmployeePaycode, endEmployeePaycode } from "../api/employeePaycodesApi.js";

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

/** ✅ FIXED: modal now scrolls; header stays visible */
function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[980px]" }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className={cn("absolute left-1/2 top-1/2 w-[94vw] -translate-x-1/2 -translate-y-1/2", widthClass)}>
                <div
                    className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxHeight: "85vh" }}
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

                    <div
                        className="p-6 overflow-y-auto text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900 [&_select]:text-slate-900"
                        style={{ maxHeight: "calc(85vh - 76px)" }}
                    >
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

function TabButton({ active, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold border",
                active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
            )}
        >
            {children}
        </button>
    );
}

function toISODateInput(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function addMonthsISO(dateStr, months) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
}

function monthNowYYYYMM() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

/** ✅ NEW: helper text based on calc type */
function calcHint(calcType) {
    if (calcType === "fixed") return "This paycode is FIXED. Enter Amount only.";
    if (calcType === "percentage") return "This paycode is PERCENTAGE. Enter Percentage only (e.g., 3 = 3%).";
    if (calcType === "hourly_rate") return "This paycode is HOURLY RATE. Enter Hourly Rate only.";
    return "Select a paycode to see what to enter.";
}

export default function EmployeeSetup() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [employees, setEmployees] = useState([]);
    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });

    const [openForm, setOpenForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [createdPassword, setCreatedPassword] = useState("");

    const [activeTab, setActiveTab] = useState("details"); // details | bank | employment | compensation

    const [form, setForm] = useState({
        fullName: "",
        email: "",
        department: "",
        bankDetails: { bankName: "", accountName: "", accountNumber: "", sortCode: "", iban: "" },

        employmentType: "permanent",
        employmentStatus: "active",
        hireDate: "",
        terminationDate: "",
        rehireDate: "",
        accessRevokedAt: "",
    });

    // Compensation state
    const [paycodes, setPaycodes] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [compForm, setCompForm] = useState({
        paycodeId: "",
        effectiveFrom: monthNowYYYYMM(),
        effectiveTo: "",
        amount: "",
        percentage: "",
        hourlyRate: "",
        priority: "",
        note: "",
    });

    const [openBulk, setOpenBulk] = useState(false);
    const [csvText, setCsvText] = useState("");
    const [bulkResult, setBulkResult] = useState(null);

    const [confirm, setConfirm] = useState({ open: false, mode: "", emp: null });

    async function loadAll() {
        setLoading(true);
        try {
            const list = await listEmployees();
            setEmployees(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load employees." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
    }, []);

    async function loadCompData(employeeId) {
        try {
            const pcs = await listPaycodes({ archived: "false" });
            setPaycodes(Array.isArray(pcs) ? pcs : []);

            const list = await listEmployeePaycodes(employeeId);
            setAssignments(Array.isArray(list) ? list : []);
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to load compensation data." });
        }
    }

    function openCreate() {
        setModalMsg({ kind: "info", text: "" });
        setCreatedPassword("");
        setEditing(null);
        setActiveTab("details");
        setPaycodes([]);
        setAssignments([]);
        setCompForm({
            paycodeId: "",
            effectiveFrom: monthNowYYYYMM(),
            effectiveTo: "",
            amount: "",
            percentage: "",
            hourlyRate: "",
            priority: "",
            note: "",
        });

        setForm({
            fullName: "",
            email: "",
            department: "",
            bankDetails: { bankName: "", accountName: "", accountNumber: "", sortCode: "", iban: "" },

            employmentType: "permanent",
            employmentStatus: "active",
            hireDate: "",
            terminationDate: "",
            rehireDate: "",
            accessRevokedAt: "",
        });
        setOpenForm(true);
    }

    function openEdit(emp) {
        setModalMsg({ kind: "info", text: "" });
        setCreatedPassword("");
        setEditing(emp);
        setActiveTab("details");

        setForm({
            fullName: emp.fullName || "",
            email: emp.email || "",
            department: emp.department || "",
            bankDetails: {
                bankName: emp.bankDetails?.bankName || "",
                accountName: emp.bankDetails?.accountName || "",
                accountNumber: emp.bankDetails?.accountNumber || "",
                sortCode: emp.bankDetails?.sortCode || "",
                iban: emp.bankDetails?.iban || "",
            },

            employmentType: emp.employmentType || "permanent",
            employmentStatus: emp.employmentStatus || "active",
            hireDate: toISODateInput(emp.hireDate),
            terminationDate: toISODateInput(emp.terminationDate),
            rehireDate: toISODateInput(emp.rehireDate),
            accessRevokedAt: toISODateInput(emp.accessRevokedAt),
        });

        setCompForm((s) => ({ ...s, effectiveFrom: monthNowYYYYMM() }));
        setOpenForm(true);

        loadCompData(emp.id);
    }

    async function submit() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });
        setCreatedPassword("");

        try {
            if (!String(form.fullName).trim()) throw new Error("Full name is required.");
            if (!String(form.email).trim()) throw new Error("Email is required.");

            const payload = {
                fullName: form.fullName,
                department: form.department,
                bankDetails: form.bankDetails,

                employmentType: form.employmentType,
                employmentStatus: form.employmentStatus,

                hireDate: form.hireDate ? new Date(form.hireDate).toISOString() : null,

                // ✅ add these so “Save” actually persists them
                terminationDate: form.terminationDate ? new Date(form.terminationDate).toISOString() : null,
                rehireDate: form.rehireDate ? new Date(form.rehireDate).toISOString() : null,

                // if terminated and access revoke not set, auto-set = termination + 3 months
                accessRevokedAt:
                    form.accessRevokedAt
                        ? new Date(form.accessRevokedAt).toISOString()
                        : (form.employmentStatus === "terminated" && form.terminationDate
                            ? addMonthsISO(form.terminationDate, 3)
                            : null),
            };

            if (editing?.id) {
                await updateEmployee(editing.id, payload);
                setPageMsg({ kind: "success", text: "Employee updated." });
                setOpenForm(false);
                await loadAll();
            } else {
                const created = await createEmployee({
                    fullName: form.fullName,
                    email: form.email,
                    department: form.department,
                    bankDetails: form.bankDetails,
                    employmentType: form.employmentType,
                    hireDate: form.hireDate ? new Date(form.hireDate).toISOString() : null,
                });

                setCreatedPassword(created?.tempPassword || "");
                setPageMsg({ kind: "success", text: "Employee created." });
                await loadAll();
            }
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save employee." });
        } finally {
            setBusy(false);
        }
    }

    async function doDeactivate(emp) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });
        try {
            await deactivateEmployee(emp.id);
            setPageMsg({ kind: "success", text: "Employee deactivated." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to deactivate employee." });
        } finally {
            setBusy(false);
            setConfirm({ open: false, mode: "", emp: null });
        }
    }

    async function doActivate(emp) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });
        try {
            await activateEmployee(emp.id);
            setPageMsg({ kind: "success", text: "Employee activated." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to activate employee." });
        } finally {
            setBusy(false);
            setConfirm({ open: false, mode: "", emp: null });
        }
    }

    async function doBulk() {
        if (busy) return;
        setBusy(true);
        setBulkResult(null);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(csvText).trim()) throw new Error("Paste CSV first.");
            const res = await bulkAddEmployees(csvText);
            setBulkResult(res);
            setPageMsg({ kind: "success", text: `Bulk add done: ${res.createdCount} created, ${res.skippedCount} skipped.` });
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Bulk add failed." });
        } finally {
            setBusy(false);
        }
    }

    async function doTerminate() {
        if (!editing?.id || busy) return;
        const td = form.terminationDate || toISODateInput(new Date());
        if (!td) return;

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });
        try {
            await terminateEmployee(editing.id, new Date(td).toISOString());
            setModalMsg({ kind: "success", text: "Employee terminated. Access will be revoked after 3 months." });

            await loadAll();
            const refreshed = (await listEmployees()).find((x) => x.id === editing.id);
            if (refreshed) {
                setEditing(refreshed);
                setForm((f) => ({
                    ...f,
                    employmentStatus: refreshed.employmentStatus || "terminated",
                    terminationDate: toISODateInput(refreshed.terminationDate),
                    accessRevokedAt: toISODateInput(refreshed.accessRevokedAt),
                }));
            }
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to terminate" });
        } finally {
            setBusy(false);
        }
    }

    async function doRehire() {
        if (!editing?.id || busy) return;
        const rd = form.rehireDate || toISODateInput(new Date());
        if (!rd) return;

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });
        try {
            await rehireEmployee(editing.id, new Date(rd).toISOString());
            setModalMsg({ kind: "success", text: "Employee rehired and reactivated." });

            await loadAll();
            const refreshed = (await listEmployees()).find((x) => x.id === editing.id);
            if (refreshed) {
                setEditing(refreshed);
                setForm((f) => ({
                    ...f,
                    employmentStatus: refreshed.employmentStatus || "active",
                    terminationDate: "",
                    accessRevokedAt: "",
                    rehireDate: toISODateInput(refreshed.rehireDate),
                }));
            }
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to rehire" });
        } finally {
            setBusy(false);
        }
    }

    // ✅ NEW: selected paycode + smart UX for inputs
    const selectedPaycode = useMemo(
        () => (paycodes || []).find((p) => p._id === compForm.paycodeId),
        [paycodes, compForm.paycodeId]
    );

    // ✅ NEW: when calc type changes, clear irrelevant fields so you can’t accidentally save wrong ones
    useEffect(() => {
        const ct = selectedPaycode?.calcType;
        if (!ct) return;

        setCompForm((s) => ({
            ...s,
            amount: ct === "fixed" ? s.amount : "",
            percentage: ct === "percentage" ? s.percentage : "",
            hourlyRate: ct === "hourly_rate" ? s.hourlyRate : "",
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPaycode?.calcType]);

    async function addAssignment() {
        if (!editing?.id) {
            setModalMsg({ kind: "error", text: "Create the employee first, then add compensation." });
            return;
        }
        if (busy) return;

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            const pc = (paycodes || []).find((p) => p._id === compForm.paycodeId);
            if (!pc) throw new Error("Choose a paycode");

            const payload = {
                paycodeId: compForm.paycodeId,
                effectiveFrom: compForm.effectiveFrom,
                effectiveTo: compForm.effectiveTo ? compForm.effectiveTo : null,
                note: compForm.note || "",
                priority: compForm.priority === "" ? null : Number(compForm.priority),

                amount: compForm.amount === "" ? null : Number(compForm.amount),
                percentage: compForm.percentage === "" ? null : Number(compForm.percentage),
                hourlyRate: compForm.hourlyRate === "" ? null : Number(compForm.hourlyRate),
                calcType: null,
            };

            if (pc.calcType === "fixed" && payload.amount == null) throw new Error("Amount is required for fixed paycodes");
            if (pc.calcType === "percentage" && payload.percentage == null) throw new Error("Percentage is required");
            if (pc.calcType === "hourly_rate" && payload.hourlyRate == null) throw new Error("Hourly rate is required");

            await createEmployeePaycode(editing.id, payload);

            const list = await listEmployeePaycodes(editing.id);
            setAssignments(Array.isArray(list) ? list : []);

            setCompForm((s) => ({
                ...s,
                paycodeId: "",
                amount: "",
                percentage: "",
                hourlyRate: "",
                priority: "",
                note: "",
            }));

            setModalMsg({ kind: "success", text: "Compensation assignment added." });
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to add assignment." });
        } finally {
            setBusy(false);
        }
    }

    async function endAssignment(a) {
        if (!editing?.id || busy) return;
        const endMonth = prompt("End month (YYYY-MM):", monthNowYYYYMM());
        if (!endMonth) return;

        setBusy(true);
        setModalMsg({ kind: "info", text: "" });
        try {
            await endEmployeePaycode(editing.id, a._id, endMonth);
            const list = await listEmployeePaycodes(editing.id);
            setAssignments(Array.isArray(list) ? list : []);
            setModalMsg({ kind: "success", text: "Assignment ended." });
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to end assignment." });
        } finally {
            setBusy(false);
        }
    }

    const activeCount = useMemo(() => employees.filter((e) => e.isActive).length, [employees]);

    return (
        <BackOfficeLayout title="Employee Setup">
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                    <div>
                        <div className="text-slate-900 font-semibold">Employees</div>
                        <div className="text-slate-600 text-sm">
                            {activeCount} active • {employees.length} total
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setOpenBulk(true)}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                        >
                            Bulk Add
                        </button>
                        <button
                            type="button"
                            onClick={openCreate}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                        >
                            + Add Employee
                        </button>
                    </div>
                </div>

                <Card title="Employee List">
                    {loading ? (
                        <div className="text-slate-600 text-sm">Loading…</div>
                    ) : employees.length === 0 ? (
                        <div className="text-slate-600 text-sm">No employees found.</div>
                    ) : (
                        <div className="space-y-2">
                            {employees.map((e) => (
                                <div key={e.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-slate-900 font-semibold truncate">
                                                {e.fullName}{" "}
                                                <span className="text-slate-500 text-xs font-normal">{e.employeeId ? `• ${e.employeeId}` : ""}</span>
                                            </div>
                                            <div className="text-slate-700 text-sm truncate">{e.email}</div>
                                            <div className="text-slate-500 text-xs mt-1">
                                                {e.department || "—"} • {e.employmentType || "permanent"} • {e.employmentStatus || "active"}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <span
                                                className={cn(
                                                    "text-xs font-semibold rounded-full px-3 py-1 border",
                                                    e.isActive
                                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                        : "bg-rose-50 text-rose-800 border-rose-200"
                                                )}
                                            >
                                                {e.isActive ? "Active" : "Inactive"}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() => openEdit(e)}
                                                className="text-sm font-semibold text-slate-700 hover:underline"
                                                disabled={busy}
                                            >
                                                Edit
                                            </button>

                                            {e.isActive ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirm({ open: true, mode: "deactivate", emp: e })}
                                                    className="text-sm font-semibold text-rose-700 hover:underline"
                                                    disabled={busy}
                                                >
                                                    Deactivate
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirm({ open: true, mode: "activate", emp: e })}
                                                    className="text-sm font-semibold text-emerald-700 hover:underline"
                                                    disabled={busy}
                                                >
                                                    Activate
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* Create/Edit Modal */}
            <ModalShell open={openForm} title={editing ? "Edit Employee" : "Add Employee"} onClose={() => !busy && setOpenForm(false)}>
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                {!editing && createdPassword ? (
                    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        <div className="font-semibold">Temp password (copy now)</div>
                        <div className="mt-1 font-mono">{createdPassword}</div>
                        <div className="mt-2 text-xs text-emerald-800">Share this with the employee. It may not be shown again.</div>
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-2 mb-5">
                    <TabButton active={activeTab === "details"} onClick={() => setActiveTab("details")}>Details</TabButton>
                    <TabButton active={activeTab === "bank"} onClick={() => setActiveTab("bank")}>Bank</TabButton>
                    <TabButton active={activeTab === "employment"} onClick={() => setActiveTab("employment")}>Employment</TabButton>
                    <TabButton active={activeTab === "compensation"} onClick={() => setActiveTab("compensation")}>Compensation</TabButton>
                </div>

                {activeTab === "details" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Full Name *</div>
                            <input
                                value={form.fullName}
                                onChange={(ev) => setForm((f) => ({ ...f, fullName: ev.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Email *</div>
                            <input
                                value={form.email}
                                onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                disabled={!!editing}
                            />
                            {editing ? <div className="mt-1 text-[11px] text-slate-500">Email can’t be changed here (rehire uses same email).</div> : null}
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Department</div>
                            <input
                                value={form.department}
                                onChange={(ev) => setForm((f) => ({ ...f, department: ev.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Hire Date</div>
                            <input
                                type="date"
                                value={form.hireDate}
                                onChange={(ev) => setForm((f) => ({ ...f, hireDate: ev.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>
                    </div>
                )}

                {activeTab === "bank" && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900 mb-3">Bank Details</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                ["bankName", "Bank Name"],
                                ["accountName", "Account Name"],
                                ["accountNumber", "Account Number"],
                                ["sortCode", "Sort Code"],
                                ["iban", "IBAN"],
                            ].map(([k, label]) => (
                                <div key={k}>
                                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                                    <input
                                        value={form.bankDetails?.[k] || ""}
                                        onChange={(ev) => setForm((f) => ({ ...f, bankDetails: { ...(f.bankDetails || {}), [k]: ev.target.value } }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === "employment" && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Employment Type</div>
                                <select
                                    value={form.employmentType}
                                    onChange={(ev) => setForm((f) => ({ ...f, employmentType: ev.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                >
                                    <option value="permanent">permanent</option>
                                    <option value="contract">contract</option>
                                    <option value="intern">intern</option>
                                </select>
                                <div className="mt-1 text-[11px] text-slate-500">Intern later can auto-apply intern preset paycodes.</div>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Status</div>
                                <input
                                    value={form.employmentStatus}
                                    readOnly
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-700"
                                />
                                <div className="mt-1 text-[11px] text-slate-500">Use Terminate / Rehire buttons to change status.</div>
                            </div>
                        </div>

                        {!editing ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                Create the employee first to use termination/rehire actions.
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Termination Date</div>
                                            <input
                                                type="date"
                                                value={form.terminationDate}
                                                onChange={(ev) => setForm((f) => ({ ...f, terminationDate: ev.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Rehire Date</div>
                                            <input
                                                type="date"
                                                value={form.rehireDate}
                                                onChange={(ev) => setForm((f) => ({ ...f, rehireDate: ev.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Access Revoked At</div>
                                            <input
                                                type="date"
                                                value={form.accessRevokedAt}
                                                readOnly
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-700"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={doTerminate}
                                            disabled={busy}
                                            className={cn(
                                                "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                                busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                                            )}
                                        >
                                            Terminate
                                        </button>

                                        <button
                                            type="button"
                                            onClick={doRehire}
                                            disabled={busy}
                                            className={cn(
                                                "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                                busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                            )}
                                        >
                                            Rehire
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 text-xs text-slate-600">
                                    Termination sets status to <b>terminated</b> and sets access revoke date = termination + 3 months. Rehire reactivates the employee (same email).
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "compensation" && (
                    <div className="space-y-4">
                        {!editing ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                Create the employee first, then add compensation assignments.
                            </div>
                        ) : (
                            <>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="text-sm font-semibold text-slate-900">Add assignment (effective-dated)</div>

                                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Paycode</div>
                                            <select
                                                value={compForm.paycodeId}
                                                onChange={(e) => setCompForm((s) => ({ ...s, paycodeId: e.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            >
                                                <option value="">Select…</option>
                                                {paycodes.map((p) => (
                                                    <option key={p._id} value={p._id}>
                                                        {p.code} — {p.name} ({p.calcType})
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="mt-1 text-[11px] text-slate-500">
                                                Create paycodes first (BASIC_SALARY, allowances, etc.).
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Effective From (YYYY-MM)</div>
                                            <input
                                                value={compForm.effectiveFrom}
                                                onChange={(e) => setCompForm((s) => ({ ...s, effectiveFrom: e.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                                placeholder="2026-02"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Effective To (optional YYYY-MM)</div>
                                            <input
                                                value={compForm.effectiveTo}
                                                onChange={(e) => setCompForm((s) => ({ ...s, effectiveTo: e.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                                placeholder="2026-05"
                                            />
                                        </div>

                                        {/* ✅ NEW helper banner */}
                                        <div className="md:col-span-3">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                                {calcHint(selectedPaycode?.calcType)}
                                            </div>
                                        </div>

                                        {/* ✅ NEW: disable irrelevant inputs */}
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Amount (fixed)</div>
                                            <input
                                                type="number"
                                                value={compForm.amount}
                                                onChange={(e) => setCompForm((s) => ({ ...s, amount: e.target.value }))}
                                                className={cn(
                                                    "w-full rounded-2xl border px-3 py-2 text-sm",
                                                    selectedPaycode?.calcType === "fixed"
                                                        ? "border-slate-200 bg-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                                )}
                                                disabled={selectedPaycode?.calcType !== "fixed"}
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Percentage</div>
                                            <input
                                                type="number"
                                                value={compForm.percentage}
                                                onChange={(e) => setCompForm((s) => ({ ...s, percentage: e.target.value }))}
                                                className={cn(
                                                    "w-full rounded-2xl border px-3 py-2 text-sm",
                                                    selectedPaycode?.calcType === "percentage"
                                                        ? "border-slate-200 bg-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                                )}
                                                disabled={selectedPaycode?.calcType !== "percentage"}
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Hourly Rate</div>
                                            <input
                                                type="number"
                                                value={compForm.hourlyRate}
                                                onChange={(e) => setCompForm((s) => ({ ...s, hourlyRate: e.target.value }))}
                                                className={cn(
                                                    "w-full rounded-2xl border px-3 py-2 text-sm",
                                                    selectedPaycode?.calcType === "hourly_rate"
                                                        ? "border-slate-200 bg-white"
                                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                                )}
                                                disabled={selectedPaycode?.calcType !== "hourly_rate"}
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Priority override (optional)</div>
                                            <input
                                                type="number"
                                                value={compForm.priority}
                                                onChange={(e) => setCompForm((s) => ({ ...s, priority: e.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <div className="text-xs text-slate-500 mb-1">Note</div>
                                            <input
                                                value={compForm.note}
                                                onChange={(e) => setCompForm((s) => ({ ...s, note: e.target.value }))}
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={addAssignment}
                                            className={cn(
                                                "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                                busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                            )}
                                            disabled={busy}
                                        >
                                            Add Assignment
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="text-sm font-semibold text-slate-900 mb-3">Assignments</div>

                                    {assignments.length === 0 ? (
                                        <div className="text-sm text-slate-600">No assignments yet.</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="text-left text-slate-600">
                                                    <tr className="border-b">
                                                        <th className="py-2 pr-3">Paycode</th>
                                                        <th className="py-2 pr-3">From</th>
                                                        <th className="py-2 pr-3">To</th>
                                                        <th className="py-2 pr-3">Amount</th>
                                                        <th className="py-2 pr-3">%</th>
                                                        <th className="py-2 pr-3">Hourly</th>
                                                        <th className="py-2 pr-3">Priority</th>
                                                        <th className="py-2 pr-3"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {assignments.map((a) => (
                                                        <tr key={a._id} className="border-b last:border-b-0">
                                                            <td className="py-2 pr-3">
                                                                <div className="font-mono text-xs">{a.paycodeId?.code}</div>
                                                                <div className="text-slate-700">{a.paycodeId?.name}</div>
                                                            </td>
                                                            <td className="py-2 pr-3">{a.effectiveFrom}</td>
                                                            <td className="py-2 pr-3">{a.effectiveTo || "—"}</td>
                                                            <td className="py-2 pr-3">{a.amount ?? "—"}</td>
                                                            <td className="py-2 pr-3">{a.percentage ?? "—"}</td>
                                                            <td className="py-2 pr-3">{a.hourlyRate ?? "—"}</td>
                                                            <td className="py-2 pr-3">{a.priority ?? a.paycodeId?.defaultPriority ?? "—"}</td>
                                                            <td className="py-2 pr-3 text-right">
                                                                {!a.effectiveTo && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => endAssignment(a)}
                                                                        className="rounded-xl border px-3 py-1.5 text-xs hover:bg-slate-50"
                                                                    >
                                                                        End
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    <div className="mt-3 text-[11px] text-slate-500">
                                        Tip: Salary increase = end BASIC_SALARY at month X, then add new BASIC_SALARY from next month.
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

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
                        {busy ? "Saving..." : editing ? "Save" : "Create"}
                    </button>
                </div>
            </ModalShell>

            <ModalShell open={openBulk} title="Bulk Add Employees" onClose={() => !busy && setOpenBulk(false)} widthClass="sm:w-[980px]">
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                <div className="text-sm text-slate-700 mb-3">
                    CSV format (header required): <span className="ml-2 font-mono text-xs">fullName,email,department</span>
                </div>

                <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[220px] bg-white font-mono"
                    placeholder={`fullName,email,department
John Doe,john@x.com,Finance
Jane Doe,jane@x.com,HR`}
                />

                <div className="pt-4 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setOpenBulk(false)}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
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

            <ConfirmModal
                open={confirm.open}
                title={confirm.mode === "deactivate" ? "Deactivate employee?" : "Activate employee?"}
                message={
                    confirm.emp
                        ? confirm.mode === "deactivate"
                            ? `Are you sure you want to deactivate ${confirm.emp.fullName}?`
                            : `Are you sure you want to activate ${confirm.emp.fullName}?`
                        : ""
                }
                confirmText={confirm.mode === "deactivate" ? "Deactivate" : "Activate"}
                tone={confirm.mode === "deactivate" ? "danger" : "success"}
                onCancel={() => !busy && setConfirm({ open: false, mode: "", emp: null })}
                onConfirm={() => {
                    if (!confirm.emp) return;
                    if (confirm.mode === "deactivate") doDeactivate(confirm.emp);
                    else doActivate(confirm.emp);
                }}
                busy={busy}
            />
        </BackOfficeLayout>
    );
}
