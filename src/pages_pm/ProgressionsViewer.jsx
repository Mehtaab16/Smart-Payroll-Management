import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { getProgressionsEmployees, getEmployeeProgressions } from "../api/progressionsBackofficeApi.js";

/* utils */
function cn(...s) { return s.filter(Boolean).join(" "); }

function fmtDate(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleDateString();
}

function bytesToMb(n) {
    return Math.round((Number(n || 0) / (1024 * 1024)) * 10) / 10;
}

/* UI */
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

                    <div className="max-h-[78vh] overflow-auto p-6 text-slate-900">
                        {children}
                    </div>
                </div>
            </div>
        </div>
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

export default function ProgressionsViewer() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });

    const [employees, setEmployees] = useState([]);
    const [employeeId, setEmployeeId] = useState("");

    const [data, setData] = useState(null); // { employee, summary, projects, cv, certificates }
    const [q, setQ] = useState("");

    // modals
    const [openProjects, setOpenProjects] = useState(false);
    const [openCerts, setOpenCerts] = useState(false);

    async function loadEmployees() {
        setLoading(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const list = await getProgressionsEmployees();
            setEmployees(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load employees." });
        } finally {
            setLoading(false);
        }
    }

    async function loadEmployee(employeeIdArg) {
        if (!employeeIdArg) {
            setData(null);
            return;
        }
        setBusy(true);
        setPageMsg({ kind: "info", text: "" });

        try {
            const res = await getEmployeeProgressions(employeeIdArg);
            setData(res || null);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load employee progressions." });
            setData(null);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        loadEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadEmployee(employeeId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId]);

    const projectsFiltered = useMemo(() => {
        const list = data?.projects || [];
        const key = q.trim().toLowerCase();
        if (!key) return list;
        return list.filter((p) =>
            String(p.name || "").toLowerCase().includes(key) ||
            String(p.description || "").toLowerCase().includes(key) ||
            String(p.status || "").toLowerCase().includes(key) ||
            String(p.priority || "").toLowerCase().includes(key)
        );
    }, [data, q]);

    const certsFiltered = useMemo(() => {
        const list = data?.certificates || [];
        const key = q.trim().toLowerCase();
        if (!key) return list;
        return list.filter((c) =>
            String(c.title || "").toLowerCase().includes(key) ||
            String(c.originalName || "").toLowerCase().includes(key)
        );
    }, [data, q]);

    return (
        <BackOfficeLayout title="Progressions">
            <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

            <div className="rounded-[28px] bg-slate-50 border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                            <div className="text-2xl font-semibold text-slate-900">Progressions</div>
                            <div className="text-sm text-slate-600">View employee projects, CV and certificates.</div>
                        </div>

                        <button
                            type="button"
                            onClick={async () => {
                                await loadEmployees();
                                if (employeeId) await loadEmployee(employeeId);
                            }}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-indigo-950"
                            disabled={busy}
                        >
                            Refresh
                        </button>
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                        <div className="flex flex-col lg:flex-row gap-3">
                            <select
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                className="w-full lg:max-w-[420px] rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white text-slate-900"
                                disabled={loading}
                            >
                                <option value="">Select employee…</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.employeeNumber ? `${e.employeeNumber} • ` : ""}{e.name}{e.email ? ` (${e.email})` : ""}
                                    </option>
                                ))}
                            </select>

                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search projects / certificates..."
                                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm bg-white"
                                disabled={!employeeId}
                            />
                        </div>

                        {data?.employee ? (
                            <div className="text-xs text-slate-600">
                                Viewing: <span className="font-semibold">{data.employee.name}</span>
                                {data.employee.employeeNumber ? <span> • {data.employee.employeeNumber}</span> : null}
                                {data.employee.email ? <span> • {data.employee.email}</span> : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="p-6">
                    {!employeeId ? (
                        <div className="text-sm text-slate-700">Select an employee to view progressions.</div>
                    ) : busy ? (
                        <div className="text-sm text-slate-600">Loading…</div>
                    ) : !data ? (
                        <div className="text-sm text-slate-700">No data.</div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <Card title="Projects" className="border-indigo-500/20">
                                <div className="text-3xl font-semibold text-slate-900">{data.summary?.projectsTotal ?? 0}</div>
                                <div className="text-xs text-slate-600 mt-1">Total projects</div>

                                <div className="mt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setOpenProjects(true)}
                                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                    >
                                        View Projects
                                    </button>
                                </div>

                                {data.projects?.[0] ? (
                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="text-sm font-semibold text-slate-900 truncate">{data.projects[0].name}</div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <StatusPill status={data.projects[0].status} />
                                            <PriorityPill priority={data.projects[0].priority} />
                                        </div>
                                    </div>
                                ) : null}
                            </Card>

                            <Card title="CV" className="border-emerald-500/20">
                                {data.cv ? (
                                    <div className="space-y-2">
                                        <div className="text-sm font-semibold text-slate-900 truncate">{data.cv.originalName}</div>
                                        <div className="text-xs text-slate-600">
                                            {bytesToMb(data.cv.size)} MB • Uploaded {fmtDate(data.cv.uploadedAt)}
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            <a
                                                href={`http://localhost:5000${data.cv.url}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                            >
                                                View
                                            </a>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-700">No CV uploaded.</div>
                                )}
                            </Card>

                            <Card title="Certificates" className="border-sky-500/20">
                                <div className="text-3xl font-semibold text-slate-900">{data.summary?.certificatesTotal ?? 0}</div>
                                <div className="text-xs text-slate-600 mt-1">Total certificates</div>

                                <div className="mt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setOpenCerts(true)}
                                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                    >
                                        View Certificates
                                    </button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </div>

            {/* Projects modal */}
            <ModalShell open={openProjects} title="Projects" onClose={() => setOpenProjects(false)} widthClass="sm:w-[980px]">
                {projectsFiltered.length === 0 ? (
                    <div className="text-sm text-slate-600">No projects.</div>
                ) : (
                    <div className="space-y-3">
                        {projectsFiltered.map((p) => (
                            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                                        <div className="text-xs text-slate-600 mt-1">Due: {p.dueDate ? fmtDate(p.dueDate) : "-"}</div>
                                        {p.description ? <div className="text-xs text-slate-700 mt-2 break-words">{p.description}</div> : null}
                                        <div className="mt-3 flex gap-2">
                                            <StatusPill status={p.status} />
                                            <PriorityPill priority={p.priority} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={() => setOpenProjects(false)}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                    >
                        Close
                    </button>
                </div>
            </ModalShell>

            {/* Certificates modal */}
            <ModalShell open={openCerts} title="Certificates" onClose={() => setOpenCerts(false)} widthClass="sm:w-[980px]">
                {certsFiltered.length === 0 ? (
                    <div className="text-sm text-slate-600">No certificates.</div>
                ) : (
                    <div className="space-y-3">
                        {certsFiltered.map((c) => (
                            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={() => setOpenCerts(false)}
                        className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                    >
                        Close
                    </button>
                </div>
            </ModalShell>
        </BackOfficeLayout>
    );
}
