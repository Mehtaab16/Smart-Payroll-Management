import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import {
    listKnowledgeDocs,
    uploadKnowledgeDoc,
    patchKnowledgeDoc,
    reprocessKnowledgeDoc,
    deleteKnowledgeDoc,
} from "../api/knowledgeApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function Toast({ tone = "info", children, onClose }) {
    const base = "mb-4 rounded-2xl border px-4 py-3 text-sm flex items-start justify-between gap-3";
    const styles =
        tone === "error"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-700";

    return (
        <div className={cn(base, styles)}>
            <div>{children}</div>
            {onClose ? (
                <button
                    type="button"
                    className="text-slate-500 hover:text-slate-800 font-bold leading-none"
                    onClick={onClose}
                    aria-label="Close"
                >
                    ✕
                </button>
            ) : null}
        </div>
    );
}

function ConfirmModal({ open, title, message, confirmText = "Confirm", onCancel, onConfirm }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div className="absolute left-1/2 top-1/2 w-[94vw] sm:w-[560px] -translate-x-1/2 -translate-y-1/2">
                <div
                    className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                        <div>
                            <div className="text-lg font-semibold text-slate-900">{title}</div>
                            <div className="text-sm text-slate-600 mt-1">{message}</div>
                        </div>

                        <button
                            onClick={onCancel}
                            className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                            type="button"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="p-6 flex items-center justify-end gap-3">
                        <button
                            onClick={onCancel}
                            className="rounded-xl px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 font-semibold"
                            type="button"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={onConfirm}
                            className="rounded-xl px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold"
                            type="button"
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function KnowledgeDocumentsPm() {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);

    const [file, setFile] = useState(null);
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("payroll");
    const [tags, setTags] = useState("");

    const [toast, setToast] = useState(null); // {tone,text}

    const [confirm, setConfirm] = useState({ open: false, doc: null });

    async function load() {
        setLoading(true);
        try {
            const data = await listKnowledgeDocs();
            setDocs(Array.isArray(data) ? data : []);
        } catch {
            setToast({ tone: "error", text: "Failed to load documents." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    const sorted = useMemo(() => {
        return [...docs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [docs]);

    async function onUpload(e) {
        e.preventDefault();
        setToast(null);

        if (!file) {
            setToast({ tone: "error", text: "Please choose a file (PDF/DOCX/TXT)." });
            return;
        }
        if (!category) {
            setToast({ tone: "error", text: "Please choose a category." });
            return;
        }

        try {
            await uploadKnowledgeDoc({ file, title, category, tags });
            setToast({ tone: "success", text: "Uploaded. Status is pending until processing is enabled." });
            setFile(null);
            setTitle("");
            setTags("");
            const input = document.getElementById("knowledge-file-input");
            if (input) input.value = "";
            await load();
        } catch {
            setToast({ tone: "error", text: "Upload failed. Make sure the file type is allowed." });
        }
    }

    async function toggleActive(d) {
        setToast(null);
        try {
            const updated = await patchKnowledgeDoc(d._id, { isActive: !d.isActive });
            setDocs((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
        } catch {
            setToast({ tone: "error", text: "Could not update document." });
        }
    }

    async function onReprocess(d) {
        setToast(null);
        try {
            await reprocessKnowledgeDoc(d._id);
            setToast({ tone: "success", text: "Marked for reprocess (status set to pending)." });
            await load();
        } catch {
            setToast({ tone: "error", text: "Could not reprocess." });
        }
    }

    function askDelete(d) {
        setConfirm({ open: true, doc: d });
    }

    async function confirmDelete() {
        const d = confirm.doc;
        if (!d?._id) {
            setConfirm({ open: false, doc: null });
            return;
        }
        setToast(null);
        try {
            await deleteKnowledgeDoc(d._id);
            setToast({ tone: "success", text: "Document deleted." });
            setConfirm({ open: false, doc: null });
            await load();
        } catch {
            setToast({ tone: "error", text: "Delete failed." });
            setConfirm({ open: false, doc: null });
        }
    }

    return (
        <BackOfficeLayout title="Knowledge Hub Documents">
            <div className="rounded-[28px] bg-white text-slate-900 border border-slate-200 p-6">
                {toast ? (
                    <Toast tone={toast.tone} onClose={() => setToast(null)}>
                        {toast.text}
                    </Toast>
                ) : null}

                {/* Upload */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <div className="text-base font-semibold mb-1">Upload document</div>
                    <div className="text-sm text-slate-600 mb-4">
                        The uploaded documents will be broken into chunks and used for the Knowledge Hub.
                    </div>

                    <form onSubmit={onUpload} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-4">
                            <label className="block text-xs text-slate-600 mb-1">File (PDF/DOCX/TXT)</label>
                            <input
                                id="knowledge-file-input"
                                type="file"
                                accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="md:col-span-3">
                            <label className="block text-xs text-slate-600 mb-1">Title (optional)</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Leave Policy 2026"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs text-slate-600 mb-1">Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                                <option value="payroll">Payroll</option>
                                <option value="leave">Leave</option>
                                <option value="overtime">Overtime</option>
                                <option value="it">IT</option>
                                <option value="hr">HR</option>
                                <option value="system">System</option>
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs text-slate-600 mb-1">Tags (comma)</label>
                            <input
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="policy, faq"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="md:col-span-2 flex items-end justify-end">
                            <button
                                type="submit"
                                className="min-w-[120px] rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                Upload
                            </button>
                        </div>
                    </form>
                </div>

                {/* Table */}
                <div className="mt-5 rounded-3xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                        <div className="text-base font-semibold">Documents</div>
                        <button
                            onClick={load}
                            className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
                            type="button"
                        >
                            Refresh
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-slate-600">
                                <tr className="border-b border-slate-200">
                                    <th className="text-left px-5 py-3">Title</th>
                                    <th className="text-left px-4 py-3">Category</th>
                                    <th className="text-left px-4 py-3">Status</th>
                                    <th className="text-left px-4 py-3">Active</th>
                                    <th className="text-left px-4 py-3">Uploaded</th>
                                    <th className="text-right px-5 py-3">Actions</th>
                                </tr>
                            </thead>

                            <tbody className="text-slate-900">
                                {loading ? (
                                    <tr>
                                        <td className="px-5 py-4 text-slate-600" colSpan={6}>
                                            Loading…
                                        </td>
                                    </tr>
                                ) : sorted.length === 0 ? (
                                    <tr>
                                        <td className="px-5 py-4 text-slate-600" colSpan={6}>
                                            No documents yet.
                                        </td>
                                    </tr>
                                ) : (
                                    sorted.map((d) => (
                                        <tr key={d._id} className="border-b border-slate-200">
                                            <td className="px-5 py-4">
                                                <div className="font-semibold">{d.title}</div>
                                                {Array.isArray(d.tags) && d.tags.length ? (
                                                    <div className="text-xs text-slate-500 mt-1">{d.tags.join(", ")}</div>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-4 text-slate-700">{String(d.category || "").toUpperCase()}</td>
                                            <td className="px-4 py-4">
                                                <span className="text-xs rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                                                    {d.status}
                                                </span>
                                                {d.error ? <div className="text-xs text-rose-700 mt-1">{d.error}</div> : null}
                                            </td>
                                            <td className="px-4 py-4">
                                                <button
                                                    onClick={() => toggleActive(d)}
                                                    className={cn(
                                                        "text-xs rounded-full px-3 py-1 border font-semibold",
                                                        d.isActive
                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                                            : "border-slate-200 bg-slate-50 text-slate-800"
                                                    )}
                                                    type="button"
                                                >
                                                    {d.isActive ? "Active" : "Archived"}
                                                </button>
                                            </td>
                                            <td className="px-4 py-4 text-slate-600">
                                                {d.createdAt ? new Date(d.createdAt).toLocaleString() : "-"}
                                            </td>
                                            <td className="px-5 py-4 text-right space-x-2">
                                                <button
                                                    onClick={() => onReprocess(d)}
                                                    className="rounded-2xl px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50"
                                                    type="button"
                                                >
                                                    Reprocess
                                                </button>

                                                <button
                                                    onClick={() => askDelete(d)}
                                                    className="rounded-2xl px-3 py-2 text-xs font-semibold border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800"
                                                    type="button"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <ConfirmModal
                open={confirm.open}
                title="Delete document?"
                message={`This will permanently delete "${confirm.doc?.title || "this document"}" from the Knowledge Hub.`}
                confirmText="Delete"
                onCancel={() => setConfirm({ open: false, doc: null })}
                onConfirm={confirmDelete}
            />
        </BackOfficeLayout>
    );
}
