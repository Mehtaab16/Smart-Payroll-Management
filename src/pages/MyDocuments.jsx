// client/src/pages/MyDocuments.jsx ✅ FULL FILE
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SideBarLayout from "../components/SideBarLayout.jsx";
import { listMyEmployeeDocuments } from "../api/employeeDocumentsApi.js";

function formatDate(d) {
    try {
        return new Date(d).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return "-";
    }
}

function formatDateTime(d) {
    try {
        return new Date(d).toLocaleString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "-";
    }
}

function isCompletedStatus(status) {
    return status === "released" || status === "completed";
}

function safeFilePart(s) {
    return (s || "Payslip").toString().trim().replace(/[^\w-]+/g, "-");
}

function Pill({ status }) {
    const done = isCompletedStatus(status);
    return (
        <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${done
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-sky-50 text-sky-700 border-sky-100"
                }`}
        >
            {done ? "Completed" : "In progress"}
        </span>
    );
}

function Dot({ status }) {
    const done = isCompletedStatus(status);
    return <span className={`inline-block h-3 w-3 rounded-full ${done ? "bg-emerald-300" : "bg-slate-300"}`} />;
}

function ActionLink({ children, onClick, disabled, tone, title }) {
    return (
        <button
            title={disabled ? title : undefined}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className={`text-sm font-medium ${disabled ? "text-slate-400 cursor-not-allowed" : `${tone} hover:underline`
                }`}
        >
            {children}
        </button>
    );
}

function MessageBox({ kind = "info", message, onClose }) {
    if (!message) return null;

    const styles =
        kind === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700";

    return (
        <div className={`mb-4 rounded-2xl border px-4 py-3 shadow-sm ${styles}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="text-sm">{message}</div>
                <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
                    aria-label="Close message"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

/* ========= Period helpers (CONSISTENT LABEL + CORRECT SORT) ========= */
function parsePeriodToKey(period) {
    const p = String(period || "").trim();

    const m1 = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(p);
    if (m1) {
        const y = Number(m1[1]);
        const m = Number(m1[2]);
        return y * 12 + (m - 1);
    }

    const tryDate = new Date(`1 ${p}`);
    if (!Number.isNaN(tryDate.getTime())) {
        return tryDate.getFullYear() * 12 + tryDate.getMonth();
    }

    return -1;
}

function formatPeriodLabel(period) {
    const p = String(period || "").trim();

    const m1 = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(p);
    if (m1) {
        const y = Number(m1[1]);
        const m = Number(m1[2]);
        const d = new Date(y, m - 1, 1);
        return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }

    const tryDate = new Date(`1 ${p}`);
    if (!Number.isNaN(tryDate.getTime())) {
        return tryDate.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }

    return p || "Unknown period";
}

function prettyCategory(c) {
    const v = String(c || "").trim();
    if (!v) return "Other";
    if (v === "tax_year_end") return "Tax Year End";
    if (v === "hr") return "HR";
    return v.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function MyDocuments() {
    const nav = useNavigate();

    const [payslips, setPayslips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [msg, setMsg] = useState({ kind: "info", text: "" });

    const [openPeriods, setOpenPeriods] = useState({});

    // ✅ NEW: real employee docs
    const [docs, setDocs] = useState([]);
    const [docsLoading, setDocsLoading] = useState(true);

    async function downloadPayslipPdf(id, period, label) {
        const token = localStorage.getItem("token");
        const res = await fetch(`http://localhost:5000/api/payslips/${id}/pdf`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            nav("/login");
            return;
        }

        if (!res.ok) {
            let m = "Failed to download PDF";
            try {
                const j = await res.json();
                m = j.message || m;
            } catch { }
            throw new Error(m);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;

        const prefix = label === "Payslip Adjustment" ? "Payslip-Adjustment" : "Payslip";
        a.download = `${prefix}-${safeFilePart(period)}.pdf`;

        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
    }

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            nav("/login");
            return;
        }

        setLoading(true);
        setErr("");

        fetch("http://localhost:5000/api/payslips/mine", {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (r) => {
                const j = await r.json().catch(() => []);
                if (r.status === 401 || r.status === 403) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    nav("/login");
                    return null;
                }
                if (!r.ok) throw new Error(j.message || "Failed to load payslips");
                return j;
            })
            .then((j) => {
                if (!j) return;
                setPayslips(Array.isArray(j) ? j : []);
            })
            .catch((e) => setErr(e.message))
            .finally(() => setLoading(false));
    }, [nav]);

    // ✅ NEW: load real documents sent by admin/pm
    useEffect(() => {
        setDocsLoading(true);
        listMyEmployeeDocuments()
            .then((list) => setDocs(Array.isArray(list) ? list : []))
            .catch((e) => setMsg({ kind: "error", text: e.message || "Failed to load documents." }))
            .finally(() => setDocsLoading(false));
    }, []);

    const payslipGroups = useMemo(() => {
        const rows = payslips.map((p) => {
            const id = p._id || p.id;
            const status = p.status || "processing";
            const period = p.payPeriod?.period || p.period || "UNKNOWN";
            const payDate = p.payPeriod?.payDate || p.payDate || null;
            const payTime = payDate ? new Date(payDate).getTime() : 0;
            const createdAt = p.createdAt || p.generatedAt || p.updatedAt || null;
            const createdTime = createdAt ? new Date(createdAt).getTime() : 0;

            return {
                id,
                status,
                period,
                periodKey: parsePeriodToKey(period),
                periodLabel: formatPeriodLabel(period),
                payDate,
                payDateLabel: payDate ? formatDate(payDate) : "-",
                payTime,
                createdAt,
                createdTime,
                payslipKind: p.payslipKind || "regular",
                adjustmentSequence: Number(p.adjustmentSequence || 0),
            };
        });

        const map = new Map();
        for (const r of rows) {
            if (!map.has(r.period)) map.set(r.period, []);
            map.get(r.period).push(r);
        }

        const groups = Array.from(map.entries()).map(([period, items]) => {
            items.sort((a, b) => {
                const bt = b.createdTime || b.payTime || 0;
                const at = a.createdTime || a.payTime || 0;
                return bt - at;
            });

            return {
                period,
                periodKey: items[0]?.periodKey ?? -1,
                periodLabel: items[0]?.periodLabel || period,
                items,
            };
        });

        groups.sort((a, b) => (b.periodKey || 0) - (a.periodKey || 0));
        return groups;
    }, [payslips]);

    useEffect(() => {
        if (payslipGroups.length > 0) {
            const newest = payslipGroups[0].period;
            setOpenPeriods((m) => (m[newest] ? m : { ...m, [newest]: true }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payslipGroups.length]);

    function togglePeriod(period) {
        setOpenPeriods((m) => ({ ...m, [period]: !m[period] }));
    }

    return (
        <SideBarLayout title="My Documents" hideWelcome={true}>
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                {/* Payslips (UNCHANGED) */}
                <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
                    <div className="text-lg font-semibold text-slate-900">Payslips</div>

                    <div className="mt-4 space-y-3">
                        {loading ? (
                            <div className="text-sm text-slate-600">Loading…</div>
                        ) : err ? (
                            <div className="text-sm text-red-600">Error: {err}</div>
                        ) : payslipGroups.length === 0 ? (
                            <div className="text-sm text-slate-600">No payslips found.</div>
                        ) : (
                            payslipGroups.map((g) => {
                                const open = !!openPeriods[g.period];
                                const count = g.items.length;

                                return (
                                    <div key={g.period} className="rounded-3xl border border-slate-200 overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => togglePeriod(g.period)}
                                            className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-slate-50"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-slate-900 truncate">
                                                    {g.periodLabel}{" "}
                                                    <span className="text-xs text-slate-500 font-normal">
                                                        • {count} file{count > 1 ? "s" : ""}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-600 mt-0.5">
                                                    Latest: {g.items[0]?.createdAt ? formatDateTime(g.items[0].createdAt) : g.items[0]?.payDateLabel || "-"}
                                                </div>
                                            </div>
                                            <div className="text-slate-700 font-semibold">{open ? "−" : "+"}</div>
                                        </button>

                                        {open ? (
                                            <div className="px-4 pb-4 space-y-3 bg-white">
                                                {g.items.map((p) => {
                                                    const done = isCompletedStatus(p.status);
                                                    const label = p.payslipKind === "adjustment" ? "Payslip Adjustment" : "Payslip";

                                                    return (
                                                        <div
                                                            key={p.id}
                                                            className="w-full text-left grid grid-cols-[24px_1fr_auto_auto] items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                                                        >
                                                            <Dot status={p.status} />

                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium text-slate-900 truncate">{label}</div>
                                                                <div className="text-xs text-slate-600 mt-0.5">
                                                                    Pay date: {p.payDateLabel}
                                                                    {p.createdAt ? <span className="text-slate-500"> • Generated: {formatDateTime(p.createdAt)}</span> : null}
                                                                </div>
                                                            </div>

                                                            <Pill status={p.status} />

                                                            <div className="flex items-center gap-6 justify-end">
                                                                <ActionLink
                                                                    disabled={!done}
                                                                    title="Not available yet"
                                                                    tone="text-pink-600"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await downloadPayslipPdf(p.id, p.period, label);
                                                                            setMsg({ kind: "success", text: "Download started." });
                                                                        } catch (e) {
                                                                            setMsg({ kind: "error", text: e.message });
                                                                        }
                                                                    }}
                                                                >
                                                                    Download
                                                                </ActionLink>

                                                                <ActionLink
                                                                    disabled={!done}
                                                                    title="Not available yet"
                                                                    tone="text-orange-600"
                                                                    onClick={() => nav(`/payslips/${p.id}`)}
                                                                >
                                                                    View
                                                                </ActionLink>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ✅ Documents (REPLACES Tax Year End) */}
                <div className="mt-6 rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
                    <div className="text-lg font-semibold text-slate-900">Documents</div>

                    <div className="mt-4 space-y-3">
                        {docsLoading ? (
                            <div className="text-sm text-slate-600">Loading…</div>
                        ) : docs.length === 0 ? (
                            <div className="text-sm text-slate-600">No documents yet.</div>
                        ) : (
                            docs.map((d) => (
                                <div
                                    key={d.id}
                                    className="w-full text-left grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-slate-900 truncate">
                                            {d.title || d.originalName || "Document"}
                                        </div>
                                        <div className="text-xs text-slate-600 mt-0.5">
                                            {prettyCategory(d.category)}
                                            {d.uploadedAt ? <span className="text-slate-500"> • Sent: {formatDateTime(d.uploadedAt)}</span> : null}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 justify-end">
                                        <a
                                            className="text-sm font-medium text-pink-600 hover:underline"
                                            href={`http://localhost:5000${d.url}`}
                                            download
                                        >
                                            Download
                                        </a>

                                        <a
                                            className="text-sm font-medium text-orange-600 hover:underline"
                                            href={`http://localhost:5000${d.url}`}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            View
                                        </a>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </SideBarLayout>
    );
}
