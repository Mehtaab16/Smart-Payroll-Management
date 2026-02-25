import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { listEmployees } from "../api/employeesApi.js";
import {
    listEmployeeDocuments,
    uploadEmployeeDocument,
    deleteEmployeeDocument,
} from "../api/employeeDocumentsApi.js";

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

function Card({ title, children }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

export default function EmployeeDocuments() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [employees, setEmployees] = useState([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [multiEmployeeIds, setMultiEmployeeIds] = useState([]);

    const [docs, setDocs] = useState([]);
    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });

    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("tax_year_end");
    const [title, setTitle] = useState("");

    async function loadEmployees() {
        setLoading(true);
        try {
            const list = await listEmployees();
            const arr = Array.isArray(list) ? list : [];
            setEmployees(arr);

            if (!selectedEmployeeId && arr.length) {
                setSelectedEmployeeId(arr[0].id);
                setMultiEmployeeIds([arr[0].id]);
            }
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load employees." });
        } finally {
            setLoading(false);
        }
    }

    async function loadDocs(empId) {
        if (!empId) return;
        try {
            const list = await listEmployeeDocuments(empId);
            setDocs(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load documents." });
        }
    }

    useEffect(() => {
        loadEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedEmployeeId) loadDocs(selectedEmployeeId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployeeId]);

    const selectedEmployee = useMemo(
        () => employees.find((e) => e.id === selectedEmployeeId),
        [employees, selectedEmployeeId]
    );

    function toggleMulti(id) {
        setMultiEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }

    async function upload() {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            if (!file) throw new Error("Select a file first.");
            if (!multiEmployeeIds.length) throw new Error("Select at least 1 employee.");
            if (!String(title || "").trim()) throw new Error("Title is required.");

            await uploadEmployeeDocument({
                file,
                employeeIds: multiEmployeeIds,
                category,
                title,
            });

            setFile(null);
            setTitle("");
            setPageMsg({ kind: "success", text: "Document uploaded." });

            if (selectedEmployeeId) await loadDocs(selectedEmployeeId);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Upload failed." });
        } finally {
            setBusy(false);
        }
    }

    async function removeDoc(d) {
        if (busy) return;
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });
        try {
            await deleteEmployeeDocument(d.id);
            setPageMsg({ kind: "success", text: "Document deleted." });
            if (selectedEmployeeId) await loadDocs(selectedEmployeeId);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Delete failed." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <BackOfficeLayout title="Employee Documents">
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
                    <Card title="Documents Viewer">
                        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">View documents for</div>
                                <select
                                    value={selectedEmployeeId}
                                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                    disabled={loading}
                                >
                                    {employees.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.fullName} {e.employeeId ? `(${e.employeeId})` : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={() => selectedEmployeeId && loadDocs(selectedEmployeeId)}
                                    className="w-full rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                    disabled={busy || !selectedEmployeeId}
                                >
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {selectedEmployee ? (
                            <div className="text-slate-600 text-sm mb-3">
                                Showing documents for <span className="text-slate-900 font-semibold">{selectedEmployee.fullName}</span>
                            </div>
                        ) : null}

                        {docs.length === 0 ? (
                            <div className="text-slate-600 text-sm">No documents uploaded for this employee.</div>
                        ) : (
                            <div className="space-y-2">
                                {docs.map((d) => (
                                    <div key={d.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-slate-900 font-semibold truncate">{d.title || d.originalName}</div>
                                                <div className="text-slate-600 text-xs mt-1">
                                                    Category: {d.category} • Size: {Math.round((d.size / (1024 * 1024)) * 10) / 10} MB
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0">
                                                <a
                                                    href={`http://localhost:5000${d.url}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sm font-semibold text-indigo-700 hover:underline"
                                                >
                                                    View
                                                </a>

                                                <button
                                                    type="button"
                                                    onClick={() => removeDoc(d)}
                                                    className="text-sm font-semibold text-rose-700 hover:underline"
                                                    disabled={busy}
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

                    <Card title="Upload Document">
                        <div className="text-slate-600 text-sm mb-4">Upload once and apply to one employee or many (bulk).</div>

                        <div className="mb-3">
                            <div className="text-xs text-slate-500 mb-1">Category</div>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                            >
                                <option value="tax_year_end">Tax Year End</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div className="mb-3">
                            <div className="text-xs text-slate-500 mb-1">Title *</div>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                                placeholder="e.g. Tax Year End 2025"
                            />
                        </div>

                        <div className="mb-3">
                            <div className="text-xs text-slate-500 mb-1">File *</div>
                            <input
                                type="file"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                accept=".pdf,.png,.jpg,.jpeg"
                            />
                            <div className="mt-1 text-[11px] text-slate-500">Allowed: PDF, PNG, JPG</div>
                        </div>

                        <div className="mb-3">
                            <div className="text-xs text-slate-500 mb-2">Apply to employees *</div>
                            <div className="max-h-[220px] overflow-auto rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                                {employees.map((e) => (
                                    <label key={e.id} className="flex items-center gap-2 text-sm text-slate-700">
                                        <input type="checkbox" checked={multiEmployeeIds.includes(e.id)} onChange={() => toggleMulti(e.id)} />
                                        <span className="truncate">
                                            {e.fullName} {e.employeeId ? `(${e.employeeId})` : ""}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-500">Tip: tick multiple employees for bulk upload.</div>
                        </div>

                        <button
                            type="button"
                            onClick={upload}
                            className={cn(
                                "w-full rounded-2xl px-4 py-2 text-sm font-semibold border",
                                busy
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                            )}
                            disabled={busy}
                        >
                            {busy ? "Uploading..." : "Upload Document"}
                        </button>
                    </Card>
                </div>
            </div>
        </BackOfficeLayout>
    );
}
