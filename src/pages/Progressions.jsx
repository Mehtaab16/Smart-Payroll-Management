import { useEffect, useMemo, useState } from "react";
import SideBarLayout from "../components/SideBarLayout.jsx";
import {
    getProgressionsSummary,
    getMyProjects,
    createProject,
    updateProject,
    deleteProject,
    getMyCv,
    uploadCv,
    getMyCertificates,
    uploadCertificate,
    deleteCertificate,
} from "../api/progressionsApi.js";

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

function bytesToMb(n) {
    return Math.round((n / (1024 * 1024)) * 10) / 10;
}

/* UI bits (same style as Leave/Overtime) */
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

function ModalShell({ open, title, children, onClose, widthClass = "sm:w-[900px]", zClass = "z-50" }) {
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

function StatusPill({ status }) {
    const map = {
        not_started: "bg-slate-50 text-slate-700 border-slate-200",
        in_progress: "bg-sky-50 text-sky-700 border-sky-100",
        completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    };
    const label = {
        not_started: "Not started",
        in_progress: "In progress",
        completed: "Completed",
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

export default function Progressions() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [summary, setSummary] = useState({ projectsTotal: 0, hasCv: false, certificatesTotal: 0 });

    const [projects, setProjects] = useState([]);
    const [cv, setCv] = useState(null);
    const [certs, setCerts] = useState([]);

    // page message (top)
    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });

    // modals
    const [openProjects, setOpenProjects] = useState(false);
    const [openProjectForm, setOpenProjectForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);

    const [openCv, setOpenCv] = useState(false);
    const [openCvUpload, setOpenCvUpload] = useState(false);

    const [openCerts, setOpenCerts] = useState(false);
    const [openCertUpload, setOpenCertUpload] = useState(false);
    const [confirmDeleteProject, setConfirmDeleteProject] = useState(null);
    const [confirmDeleteCert, setConfirmDeleteCert] = useState(null);

    // modal message (so errors appear inside popup)
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });

    const [projectForm, setProjectForm] = useState({
        name: "",
        status: "not_started",
        priority: "low",
        dueDate: "",
        description: "",
    });

    const [cvFile, setCvFile] = useState(null);
    const [certFile, setCertFile] = useState(null);
    const [certTitle, setCertTitle] = useState("");

    const UPLOAD_NOTE_CV = "Allowed: PDF, DOC, DOCX • Max 5MB";
    const UPLOAD_NOTE_CERT = "Allowed: PDF, PNG, JPG • Max 5MB";

    async function loadAll() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const [sum, proj, myCv, myCerts] = await Promise.all([
                getProgressionsSummary(),
                getMyProjects(),
                getMyCv(),
                getMyCertificates(),
            ]);

            setSummary(sum || { projectsTotal: 0, hasCv: false, certificatesTotal: 0 });
            setProjects(Array.isArray(proj) ? proj : []);
            setCv(myCv || null);
            setCerts(Array.isArray(myCerts) ? myCerts : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load progressions." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function openNewProject() {
        setModalMsg({ kind: "info", text: "" });
        setEditingProject(null);
        setProjectForm({ name: "", status: "not_started", priority: "low", dueDate: "", description: "" });
        setOpenProjectForm(true);
    }

    function openEditProject(p) {
        setModalMsg({ kind: "info", text: "" });
        setEditingProject(p);
        setProjectForm({
            name: p.name || "",
            status: p.status || "not_started",
            priority: p.priority || "low",
            dueDate: p.dueDate ? String(p.dueDate).slice(0, 10) : "",
            description: p.description || "",
        });
        setOpenProjectForm(true);
    }

    async function submitProject() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(projectForm.name).trim()) throw new Error("Project name is required.");

            if (editingProject?.id) {
                await updateProject(editingProject.id, {
                    ...projectForm,
                    dueDate: projectForm.dueDate || null,
                });
                setPageMsg({ kind: "success", text: "Project updated." });
            } else {
                await createProject({
                    ...projectForm,
                    dueDate: projectForm.dueDate || null,
                });
                setPageMsg({ kind: "success", text: "Project created." });
            }

            setOpenProjectForm(false);
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save project." });
        } finally {
            setBusy(false);
        }
    }

    async function doDeleteProject(id) {
        if (busy) return;
        setBusy(true);

        try {
            await deleteProject(id);
            setPageMsg({ kind: "success", text: "Project deleted." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to delete project." });
        } finally {
            setBusy(false);
        }
    }

    async function submitCvUpload() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!cvFile) throw new Error("Please select a file.");
            await uploadCv(cvFile);

            setOpenCvUpload(false);
            setCvFile(null);
            setPageMsg({ kind: "success", text: "CV uploaded." });
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to upload CV." });
        } finally {
            setBusy(false);
        }
    }

    async function submitCertUpload() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!certFile) throw new Error("Please select a file.");
            await uploadCertificate({ file: certFile, title: certTitle });

            setOpenCertUpload(false);
            setCertFile(null);
            setCertTitle("");
            setPageMsg({ kind: "success", text: "Certificate uploaded." });
            await loadAll();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to upload certificate." });
        } finally {
            setBusy(false);
        }
    }

    async function doDeleteCert(id) {
        if (busy) return;
        setBusy(true);

        try {
            await deleteCertificate(id);
            setPageMsg({ kind: "success", text: "Certificate deleted." });
            await loadAll();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to delete certificate." });
        } finally {
            setBusy(false);
        }
    }

    const latestProject = useMemo(() => (projects.length ? projects[0] : null), [projects]);

    return (
        <SideBarLayout title="Progressions" hideWelcome={true}>
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                {/* Top row cards */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <Card title="Projects" className="border-indigo-500/20">
                        <div className="text-3xl font-semibold text-slate-900">{summary.projectsTotal ?? 0}</div>
                        <div className="text-xs text-slate-600 mt-1">Total projects</div>

                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenProjects(true)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                disabled={loading}
                            >
                                View Projects
                            </button>


                            <button
                                type="button"
                                onClick={openNewProject}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                disabled={loading}
                            >
                                Add Project
                            </button>
                        </div>

                        {latestProject ? (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-900 truncate">{latestProject.name}</div>
                                <div className="mt-2 flex items-center gap-2">
                                    <StatusPill status={latestProject.status} />
                                    <PriorityPill priority={latestProject.priority} />
                                </div>
                            </div>
                        ) : null}
                    </Card>

                    <Card title="My CV" className="border-emerald-500/20">
                        {cv ? (
                            <div className="space-y-2">
                                <div className="text-sm font-semibold text-slate-900 truncate">{cv.originalName}</div>
                                <div className="text-xs text-slate-600">
                                    {bytesToMb(cv.size)} MB • Uploaded {fmtDate(cv.uploadedAt)}
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <a
                                        href={`http://localhost:5000${cv.url}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                    >
                                        View
                                    </a>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setModalMsg({ kind: "info", text: "" });
                                            setOpenCvUpload(true);
                                        }}
                                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                    >
                                        Update CV
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="text-sm text-slate-700">No CV uploaded yet.</div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setModalMsg({ kind: "info", text: "" });
                                        setOpenCvUpload(true);
                                    }}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    Upload CV
                                </button>
                            </div>
                        )}
                    </Card>

                    <Card title="Certificates" className="border-sky-500/20">
                        <div className="text-3xl font-semibold text-slate-900">{summary.certificatesTotal ?? 0}</div>
                        <div className="text-xs text-slate-600 mt-1">Total certificates</div>

                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenCerts(true)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                disabled={loading}
                            >
                                View
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setModalMsg({ kind: "info", text: "" });
                                    setOpenCertUpload(true);
                                }}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                disabled={loading}
                            >
                                Add
                            </button>
                        </div>
                    </Card>
                </div>

                {/* Bottom row (optional info card) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
                    <Card title="Quick Tips">
                        <div className="text-sm text-slate-700">
                            Keep your CV and certificates updated. Projects help you track growth and milestones over time.
                        </div>
                    </Card>

                    <Card title="Refresh">
                        <button
                            type="button"
                            onClick={loadAll}
                            className="w-full rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                            disabled={busy}
                        >
                            Refresh
                        </button>

                        <div className="mt-2 text-[11px] text-slate-600">
                            Pull latest data from the server.
                        </div>
                    </Card>

                </div>

                {/* Projects list modal */}
                <ModalShell open={openProjects} title="View Projects" onClose={() => setOpenProjects(false)} widthClass="sm:w-[980px]">
                    <div className="space-y-4">
                        {projects.length === 0 ? (
                            <div className="text-sm text-slate-600">No projects yet.</div>
                        ) : (
                            projects.map((p) => (
                                <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                                            <div className="text-xs text-slate-600 mt-1">
                                                Due: {p.dueDate ? fmtDate(p.dueDate) : "-"}
                                            </div>
                                            {p.description ? <div className="text-xs text-slate-700 mt-2 break-words">{p.description}</div> : null}
                                            <div className="mt-3 flex gap-2">
                                                <StatusPill status={p.status} />
                                                <PriorityPill priority={p.priority} />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => openEditProject(p)}
                                                className="text-sm font-semibold text-slate-700 hover:underline"
                                                disabled={busy}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteProject(p)}
                                                className="text-sm font-semibold text-slate-400 hover:text-slate-600"
                                                disabled={busy}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenProjects(false)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                            >
                                Close
                            </button>

                            <button
                                type="button"
                                onClick={openNewProject}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            >
                                Add Project
                            </button>
                        </div>
                    </div>
                </ModalShell>

                {/* Project form modal */}
                <ModalShell
                    open={openProjectForm}
                    title={editingProject ? "Edit Project" : "New Project"}
                    onClose={() => !busy && setOpenProjectForm(false)}
                    widthClass="sm:w-[860px]"
                >
                    <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Project Name *</div>
                                <input
                                    value={projectForm.name}
                                    onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                    placeholder="e.g. Smart Payroll"
                                />
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Due Date</div>
                                <input
                                    type="date"
                                    value={projectForm.dueDate}
                                    onChange={(e) => setProjectForm((f) => ({ ...f, dueDate: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Status</div>
                                <select
                                    value={projectForm.status}
                                    onChange={(e) => setProjectForm((f) => ({ ...f, status: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                >
                                    <option value="not_started">Not started</option>
                                    <option value="in_progress">In progress</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Priority</div>
                                <select
                                    value={projectForm.priority}
                                    onChange={(e) => setProjectForm((f) => ({ ...f, priority: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Description</div>
                            <textarea
                                value={projectForm.description}
                                onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[120px] bg-white"
                                placeholder="Optional notes..."
                            />
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenProjectForm(false)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-rose-50 text-rose-600 hover:opacity-90"
                                disabled={busy}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={submitProject}
                                className={cn(
                                    "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                    busy
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                )}
                                disabled={busy}
                            >
                                {busy ? "Saving..." : "Submit"}
                            </button>
                        </div>
                    </div>
                </ModalShell>

                {/* CV upload modal */}
                <ModalShell open={openCvUpload} title="Upload / Update CV" onClose={() => !busy && setOpenCvUpload(false)} widthClass="sm:w-[720px]">
                    <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                    <div className="space-y-4">
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                            <span className="font-semibold">Note:</span> {UPLOAD_NOTE_CV}
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Select file *</div>
                            <input
                                type="file"
                                accept=".pdf,.doc,.docx"
                                onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenCvUpload(false)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-rose-50 text-rose-600 hover:opacity-90"
                                disabled={busy}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={submitCvUpload}
                                className={cn(
                                    "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                    busy
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                )}
                                disabled={busy}
                            >
                                {busy ? "Uploading..." : "Upload"}
                            </button>
                        </div>
                    </div>
                </ModalShell>

                {/* Certificates list modal */}
                <ModalShell open={openCerts} title="View Certificates" onClose={() => setOpenCerts(false)} widthClass="sm:w-[980px]">
                    <div className="space-y-4">
                        {certs.length === 0 ? (
                            <div className="text-sm text-slate-600">No certificates yet.</div>
                        ) : (
                            certs.map((c) => (
                                <div key={c.id} className="rounded-2xl border border-slate-200 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 truncate">
                                                {c.title ? c.title : c.originalName}
                                            </div>
                                            <div className="text-xs text-slate-600 mt-1">
                                                {bytesToMb(c.size)} MB • Uploaded {fmtDate(c.uploadedAt)}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <a
                                                href={`http://localhost:5000${c.url}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm font-semibold text-slate-700 hover:underline"
                                            >
                                                View
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteCert(c)}
                                                className="text-sm font-semibold text-slate-400 hover:text-slate-600"
                                                disabled={busy}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenCerts(false)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setModalMsg({ kind: "info", text: "" });
                                    setOpenCertUpload(true);
                                }}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            >
                                Add Certificate
                            </button>
                        </div>
                    </div>
                </ModalShell>

                {/* Certificate upload modal */}
                <ModalShell open={openCertUpload} title="Add Certificate" onClose={() => !busy && setOpenCertUpload(false)} widthClass="sm:w-[720px]">
                    <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                    <div className="space-y-4">
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                            <span className="font-semibold">Note:</span> {UPLOAD_NOTE_CERT}
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Title (optional)</div>
                            <input
                                value={certTitle}
                                onChange={(e) => setCertTitle(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                placeholder="e.g. AWS Cloud Practitioner"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-slate-500 mb-1">Select file *</div>
                            <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                            />
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpenCertUpload(false)}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-rose-50 text-rose-600 hover:opacity-90"
                                disabled={busy}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={submitCertUpload}
                                className={cn(
                                    "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                    busy
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                )}
                                disabled={busy}
                            >
                                {busy ? "Uploading..." : "Upload"}
                            </button>
                        </div>
                    </div>
                </ModalShell>

                {/* Confirm delete project */}
                <ModalShell
                    open={!!confirmDeleteProject}
                    title="Delete project?"
                    onClose={() => !busy && setConfirmDeleteProject(null)}
                    widthClass="sm:w-[520px]"
                    zClass="z-[9999]"
                >
                    {confirmDeleteProject ? (
                        <div className="space-y-4">
                            <div className="text-sm text-slate-700">Are you sure you want to delete this project?</div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-900">{confirmDeleteProject.name}</div>
                                <div className="mt-2 flex gap-2">
                                    <StatusPill status={confirmDeleteProject.status} />
                                    <PriorityPill priority={confirmDeleteProject.priority} />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setConfirmDeleteProject(null)}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    disabled={busy}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const id = confirmDeleteProject.id;
                                        setConfirmDeleteProject(null);
                                        await doDeleteProject(id);
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

                {/* Confirm delete certificate */}
                <ModalShell
                    open={!!confirmDeleteCert}
                    title="Delete certificate?"
                    onClose={() => !busy && setConfirmDeleteCert(null)}
                    widthClass="sm:w-[520px]"
                    zClass="z-[9999]"
                >
                    {confirmDeleteCert ? (
                        <div className="space-y-4">
                            <div className="text-sm text-slate-700">Are you sure you want to delete this certificate?</div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-900">
                                    {confirmDeleteCert.title ? confirmDeleteCert.title : confirmDeleteCert.originalName}
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCert(null)}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    disabled={busy}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        const id = confirmDeleteCert.id;
                                        setConfirmDeleteCert(null);
                                        await doDeleteCert(id);
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
