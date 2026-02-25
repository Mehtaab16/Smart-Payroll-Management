// client/src/pages_pm/Reports.jsx ✅ FULL FILE
import { useEffect, useMemo, useRef, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import {
    getReportPeriods,
    getAuditReport,
    getPayrollSummaryReport,
    getEmployeeWiseReport,
    getPaycodesReport,
    getEmployeeSetupReport,
    getPayrollRunsReport,
    getAnomaliesReport,
    getAccessRightsReport,
    getEmailReport, // ✅ NEW
} from "../api/reportsApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

const REPORTS = [
    { key: "audit", title: "Audit Report", desc: "Actions performed during the selected month (by user/module)." },
    { key: "emails", title: "Email Report", desc: "All emails sent during the selected period (employee/admin/PM)." }, // ✅ NEW
    { key: "payrollSummary", title: "Payroll Summary", desc: "Totals, counts, and status breakdown for a period." },
    { key: "employeeWise", title: "Employee-wise Report", desc: "Payslip totals per employee for the period." },
    { key: "paycodes", title: "Paycode Report", desc: "All paycodes and configuration." },
    { key: "employeeSetup", title: "Employee Setup Report", desc: "All employees and employment details." },
    { key: "payrollRuns", title: "Payroll Run Report", desc: "Runs + employee results + adjustments for the period." },
    { key: "anomalies", title: "Anomalies Report", desc: "All anomalies for the selected period." },
    { key: "accessRights", title: "Access Rights Report", desc: "All Admin/Payroll Manager accounts." },
];

function fmtMoney(n) {
    const v = Number(n || 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
}

function fmtDateTime(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    // simple readable datetime
    return `${dt.toISOString().slice(0, 10)} ${dt.toISOString().slice(11, 19)}`;
}

function downloadTextFile({ filename, content, mime = "text/plain;charset=utf-8" }) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function toCsv(rows = [], columns = []) {
    const safe = (v) => {
        const s = String(v ?? "");
        if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const header = columns.map((c) => safe(c.label)).join(",");
    const lines = rows.map((r) => columns.map((c) => safe(c.get(r))).join(","));
    return [header, ...lines].join("\n");
}

function Option({ value, children }) {
    return (
        <option value={value} className="bg-slate-900 text-white">
            {children}
        </option>
    );
}

function Select({ label, value, onChange, children, disabled = false }) {
    return (
        <label className="block">
            <div className="text-xs text-slate-600 mb-1">{label}</div>
            <select
                disabled={disabled}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    "w-full rounded-xl border px-3 py-2 text-sm outline-none",
                    "border-slate-200 bg-slate-900 text-white",
                    "focus:ring-2 focus:ring-slate-300",
                    disabled ? "opacity-60 cursor-not-allowed" : ""
                )}
            >
                {children}
            </select>
        </label>
    );
}

function ReportCard({ active, title, desc, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "text-left rounded-2xl border p-4 transition",
                "bg-white hover:bg-slate-50",
                active ? "border-slate-900" : "border-slate-200"
            )}
        >
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-xs text-slate-600">{desc}</div>
        </button>
    );
}

function Table({ columns, rows }) {
    return (
        <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50">
                    <tr>
                        {columns.map((c) => (
                            <th
                                key={c.key}
                                className="text-left px-4 py-3 text-xs font-semibold text-slate-700 border-b border-slate-200"
                            >
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="px-4 py-6 text-slate-500">
                                No data
                            </td>
                        </tr>
                    ) : (
                        rows.map((r, idx) => (
                            <tr key={r?._id || r?.id || idx} className="border-b border-slate-100 last:border-b-0">
                                {columns.map((c) => (
                                    <td key={c.key} className="px-4 py-3 text-slate-800 align-top">
                                        {c.render ? c.render(r) : String(c.get(r) ?? "")}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

function StatCard({ label, value, hint }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-600">{label}</div>
            <div className="text-xl font-semibold text-slate-900">{value}</div>
            {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
        </div>
    );
}

function TabButton({ active, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold border transition",
                active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
            )}
        >
            {children}
        </button>
    );
}

/* ✅ fallback periods if DB has none or API fails */
function buildLastMonths(count = 24) {
    const out = [];
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < count; i++) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        out.push(`${y}-${m}`);
        d.setMonth(d.getMonth() - 1);
    }
    return out;
}

function normalizePeriods(arr) {
    const raw = Array.isArray(arr) ? arr : [];
    const cleaned = raw
        .map((p) => String(p || "").trim())
        .filter((p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p));
    return Array.from(new Set(cleaned)).sort((a, b) => (a < b ? 1 : -1));
}

export default function Reports() {
    const [periods, setPeriods] = useState([]);
    const [reportKey, setReportKey] = useState("audit");
    const [period, setPeriod] = useState("");

    const [loadingPeriods, setLoadingPeriods] = useState(true);
    const [loading, setLoading] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [data, setData] = useState(null);

    // filters
    const [auditModule, setAuditModule] = useState("");
    const [anomalyStatus, setAnomalyStatus] = useState("all");
    const [anomalySeverity, setAnomalySeverity] = useState("");
    const [paycodeStatus, setPaycodeStatus] = useState("all");
    const [employeeStatus, setEmployeeStatus] = useState("all");
    const [accessRole, setAccessRole] = useState("all");
    const [summaryStatus, setSummaryStatus] = useState("released");

    // ✅ Email report filters
    const [emailRecipientType, setEmailRecipientType] = useState("all"); // all|employee|admin_pm
    const [emailModule, setEmailModule] = useState(""); // all modules
    const [emailStatus, setEmailStatus] = useState("all"); // all|sent|failed

    // payroll run report tab
    const [payrollRunTab, setPayrollRunTab] = useState("runs"); // runs|employees|adjustments

    const selectedReport = useMemo(() => REPORTS.find((r) => r.key === reportKey), [reportKey]);

    // keep preview scroll stable
    const previewWrapRef = useRef(null);
    const previewScrollTopRef = useRef(0);

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                setLoadingPeriods(true);
                setError("");

                const res = await getReportPeriods();
                if (!alive) return;

                const fromApi = normalizePeriods(res?.periods);
                const fallback = buildLastMonths(24);
                const merged = normalizePeriods([...fromApi, ...fallback]);

                setPeriods(merged);
                setPeriod((prev) => prev || merged[0] || "");
            } catch (e) {
                if (!alive) return;

                const fallback = buildLastMonths(24);
                setPeriods(fallback);
                setPeriod((prev) => prev || fallback[0] || "");

                setError(
                    e?.message
                        ? `Periods API failed. Using fallback months. (${e.message})`
                        : "Periods API failed. Using fallback months."
                );
            } finally {
                if (alive) setLoadingPeriods(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        const el = previewWrapRef.current;
        if (!el) return;
        el.scrollTop = previewScrollTopRef.current || 0;
    });

    function captureScroll() {
        const el = previewWrapRef.current;
        if (!el) return;
        previewScrollTopRef.current = el.scrollTop || 0;
    }

    async function runPreview() {
        setSuccess("");
        setError("");

        const needsPeriod = !["paycodes", "employeeSetup", "accessRights"].includes(reportKey);
        if (needsPeriod && !period) {
            setError("Please select a period.");
            setData(null);
            return;
        }

        setLoading(true);
        try {
            let res = null;

            if (reportKey === "audit") {
                res = await getAuditReport({ period, module: auditModule || "" });
            } else if (reportKey === "emails") {
                res = await getEmailReport({
                    period,
                    recipientType: emailRecipientType,
                    module: emailModule,
                    status: emailStatus,
                });
            } else if (reportKey === "payrollSummary") {
                res = await getPayrollSummaryReport({ period, status: summaryStatus });
            } else if (reportKey === "employeeWise") {
                res = await getEmployeeWiseReport({ period });
            } else if (reportKey === "paycodes") {
                res = await getPaycodesReport({ status: paycodeStatus });
            } else if (reportKey === "employeeSetup") {
                res = await getEmployeeSetupReport({ status: employeeStatus });
            } else if (reportKey === "payrollRuns") {
                res = await getPayrollRunsReport({ period });
                setPayrollRunTab("runs");
            } else if (reportKey === "anomalies") {
                res = await getAnomaliesReport({ period, status: anomalyStatus, severity: anomalySeverity });
            } else if (reportKey === "accessRights") {
                res = await getAccessRightsReport({ role: accessRole });
            }

            previewScrollTopRef.current = 0;
            setData(res);
        } catch (e) {
            setError(e.message || "Failed to load preview");
            setData(null);
        } finally {
            setLoading(false);
        }
    }

    function buildCsvForCurrentReport() {
        if (!data) return null;

        const stamp = new Date().toISOString().slice(0, 10);
        const baseName = `${reportKey}${period ? "_" + period : ""}_${stamp}.csv`;

        if (reportKey === "emails") {
            const rows = data.items || [];
            const cols = [
                { key: "createdAt", label: "Date", get: (r) => fmtDateTime(r.createdAt) },
                { key: "to", label: "To", get: (r) => Array.isArray(r.to) ? r.to.join("; ") : String(r.to || "") },
                { key: "recipientType", label: "Recipient Type", get: (r) => r.recipientType || "" },
                { key: "subject", label: "Subject", get: (r) => r.subject || "" },
                { key: "module", label: "Module", get: (r) => r.module || "" },
                { key: "template", label: "Template", get: (r) => r.template || "" },
                { key: "status", label: "Status", get: (r) => r.status || "" },
                { key: "entityId", label: "Entity ID", get: (r) => r.entityId || "" },
            ];
            return { filename: `emails_${period}_${stamp}.csv`, csv: toCsv(rows, cols) };
        }

        if (reportKey === "payrollRuns") {
            if (payrollRunTab === "runs") {
                const rows = data.runs || [];
                const cols = [
                    { key: "createdAt", label: "Created", get: (r) => fmtDate(r.createdAt) },
                    { key: "payDate", label: "Pay Date", get: (r) => fmtDate(r.payDate) },
                    { key: "status", label: "Status", get: (r) => r.status || "" },
                    { key: "trigger", label: "Trigger", get: (r) => (r?.trigger?.type === "manual" ? "manual" : "scheduler") },
                    { key: "by", label: "By", get: (r) => (r?.trigger?.by?.fullName || r?.trigger?.by?.email || "") },
                    { key: "employees", label: "Employees", get: (r) => r?.counts?.employees ?? 0 },
                    { key: "created", label: "Payslips Created", get: (r) => r?.counts?.payslipsCreated ?? 0 },
                    { key: "failed", label: "Payslips Failed", get: (r) => r?.counts?.payslipsFailed ?? 0 },
                    { key: "anomalies", label: "Anomalies Found", get: (r) => r?.counts?.anomaliesFound ?? 0 },
                    { key: "blocked", label: "Payslips Blocked", get: (r) => r?.counts?.payslipsBlocked ?? 0 },
                    { key: "emailed", label: "Emailed Count", get: (r) => r?.counts?.emailedCount ?? 0 },
                    { key: "error", label: "Error", get: (r) => r.error || "" },
                ];
                return { filename: `payroll_runs_${period}_${stamp}.csv`, csv: toCsv(rows, cols) };
            }

            if (payrollRunTab === "employees") {
                const rows = data.employees || [];
                const cols = [
                    { key: "name", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
                    { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
                    { key: "empId", label: "Employee ID", get: (r) => r?.employeeSnapshot?.employeeId || "" },
                    { key: "payDate", label: "Pay Date", get: (r) => fmtDate(r.payDate) },
                    { key: "gross", label: "Gross", get: (r) => r?.totals?.grossPay ?? "" },
                    { key: "ded", label: "Deductions", get: (r) => r?.totals?.totalDeductions ?? "" },
                    { key: "net", label: "Net", get: (r) => r?.totals?.netPay ?? "" },
                    { key: "status", label: "Payslip Status", get: (r) => r.status || "" },
                    { key: "proc", label: "Processing", get: (r) => r.processingStatus || "" },
                    { key: "kind", label: "Payslip Kind", get: (r) => r.payslipKind || "" },
                    { key: "seq", label: "Adjustment Seq", get: (r) => r.adjustmentSequence || 0 },
                    { key: "runId", label: "Payroll Run ID", get: (r) => r.payrollRunId || "" },
                ];
                return { filename: `payroll_employees_${period}_${stamp}.csv`, csv: toCsv(rows, cols) };
            }

            const rows = data.adjustments || [];
            const cols = [
                { key: "createdAt", label: "Created", get: (r) => fmtDate(r.createdAt) },
                { key: "employee", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
                { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
                { key: "code", label: "Paycode", get: (r) => r.paycodeCode || "" },
                { key: "name", label: "Name", get: (r) => r.paycodeName || "" },
                { key: "type", label: "Type", get: (r) => r.type || "" },
                { key: "amount", label: "Amount", get: (r) => r.amount ?? "" },
                { key: "status", label: "Status", get: (r) => r.status || "" },
                { key: "by", label: "Created By", get: (r) => r?.createdBy?.fullName || r?.createdBy?.email || "" },
            ];
            return { filename: `payroll_adjustments_${period}_${stamp}.csv`, csv: toCsv(rows, cols) };
        }

        if (reportKey === "audit") {
            const rows = data.items || [];
            const cols = [
                { key: "createdAt", label: "Date", get: (r) => fmtDate(r.createdAt) },
                { key: "actor", label: "Actor", get: (r) => r?.actorId?.fullName || r?.actorId?.email || "" },
                { key: "actorRole", label: "Actor Role", get: (r) => r.actorRole || "" },
                { key: "module", label: "Module", get: (r) => r.module || "" },
                { key: "action", label: "Action", get: (r) => r.action || "" },
                { key: "message", label: "Message", get: (r) => r.message || "" },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        if (reportKey === "employeeWise") {
            const rows = data.items || [];
            const cols = [
                { key: "name", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
                { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
                { key: "empId", label: "Employee ID", get: (r) => r?.employeeSnapshot?.employeeId || "" },
                { key: "gross", label: "Gross", get: (r) => r?.totals?.grossPay ?? "" },
                { key: "ded", label: "Deductions", get: (r) => r?.totals?.totalDeductions ?? "" },
                { key: "net", label: "Net", get: (r) => r?.totals?.netPay ?? "" },
                { key: "status", label: "Payslip Status", get: (r) => r.status || "" },
                { key: "proc", label: "Processing", get: (r) => r.processingStatus || "" },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        if (reportKey === "paycodes") {
            const rows = data.items || [];
            const cols = [
                { key: "code", label: "Code", get: (r) => r.code || "" },
                { key: "name", label: "Name", get: (r) => r.name || "" },
                { key: "type", label: "Type", get: (r) => r.type || "" },
                { key: "visible", label: "Visible On Payslip", get: (r) => String(!!r.visibleOnPayslip) },
                { key: "active", label: "Active", get: (r) => String(r.active !== false) },
                { key: "archivedAt", label: "Archived At", get: (r) => fmtDate(r.archivedAt) },
                { key: "calcType", label: "Calc Type", get: (r) => r.calcType || "" },
                { key: "priority", label: "Priority", get: (r) => r.defaultPriority ?? "" },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        if (reportKey === "employeeSetup") {
            const rows = data.items || [];
            const cols = [
                { key: "name", label: "Full Name", get: (r) => r.fullName || "" },
                { key: "email", label: "Email", get: (r) => r.email || "" },
                { key: "empId", label: "Employee ID", get: (r) => r.employeeId || "" },
                { key: "dept", label: "Department", get: (r) => r.department || "" },
                { key: "status", label: "Employment Status", get: (r) => r.employmentStatus || "" },
                { key: "type", label: "Employment Type", get: (r) => r.employmentType || "" },
                { key: "hire", label: "Hire Date", get: (r) => fmtDate(r.hireDate) },
                { key: "term", label: "Termination Date", get: (r) => fmtDate(r.terminationDate) },
                { key: "active", label: "User Active", get: (r) => String(!!r.isActive) },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        if (reportKey === "anomalies") {
            const rows = data.items || [];
            const cols = [
                { key: "period", label: "Period", get: (r) => r.period || "" },
                { key: "name", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
                { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
                { key: "severity", label: "Severity", get: (r) => r.severity || "" },
                { key: "status", label: "Status", get: (r) => r.status || "" },
                { key: "count", label: "Anomaly Count", get: (r) => r.anomalyCount ?? "" },
                { key: "type", label: "Type", get: (r) => r.type || "" },
                { key: "message", label: "Message", get: (r) => r.message || "" },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        if (reportKey === "accessRights") {
            const rows = data.items || [];
            const cols = [
                { key: "name", label: "Full Name", get: (r) => r.fullName || "" },
                { key: "email", label: "Email", get: (r) => r.email || "" },
                { key: "role", label: "Role", get: (r) => r.role || "" },
                { key: "dept", label: "Department", get: (r) => r.department || "" },
                { key: "active", label: "Active", get: (r) => String(!!r.isActive) },
                { key: "createdAt", label: "Created At", get: (r) => fmtDate(r.createdAt) },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        if (reportKey === "payrollSummary") {
            const t = data.totals || {};
            const rows = [
                {
                    period: data.period || "",
                    payDate: fmtDate(data.payDate),
                    grossPay: t.grossPay ?? 0,
                    totalDeductions: t.totalDeductions ?? 0,
                    netPay: t.netPay ?? 0,
                },
            ];
            const cols = [
                { key: "period", label: "Period", get: (r) => r.period },
                { key: "payDate", label: "Pay Date", get: (r) => r.payDate },
                { key: "grossPay", label: "Gross Pay", get: (r) => r.grossPay },
                { key: "totalDeductions", label: "Total Deductions", get: (r) => r.totalDeductions },
                { key: "netPay", label: "Net Pay", get: (r) => r.netPay },
            ];
            return { filename: baseName, csv: toCsv(rows, cols) };
        }

        return null;
    }

    function doDownload() {
        setSuccess("");

        if (!data) {
            setError("Please click Preview first.");
            return;
        }

        const out = buildCsvForCurrentReport();
        if (!out) {
            setError("Download is not available for this report yet.");
            return;
        }

        downloadTextFile({ filename: out.filename, content: out.csv, mime: "text/csv;charset=utf-8" });
        setSuccess("Report downloaded successfully.");
    }

    function SummaryPreview() {
        if (!data) return null;
        const t = data?.totals || {};
        const c = data?.counts || {};
        return (
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatCard label="Gross Pay" value={fmtMoney(t.grossPay)} />
                    <StatCard label="Total Deductions" value={fmtMoney(t.totalDeductions)} />
                    <StatCard label="Net Pay" value={fmtMoney(t.netPay)} />
                </div>
                <div className="mt-4 text-sm text-slate-700">
                    <span className="text-slate-500">Payslips:</span>{" "}
                    total {c.total || 0} • released {c.released || 0} • approved {c.approved || 0} • draft {c.draft || 0}
                </div>
            </div>
        );
    }

    function PayrollRunsBusinessPreview() {
        if (!data) return null;

        const runs = data.runs || [];
        const employees = data.employees || [];
        const adjustments = data.adjustments || [];

        const manualRuns = runs.filter((r) => r?.trigger?.type === "manual").length;
        const schedRuns = runs.length - manualRuns;

        const sumCounts = runs.reduce(
            (acc, r) => {
                const c = r?.counts || {};
                acc.employees += Number(c.employees || 0);
                acc.created += Number(c.payslipsCreated || 0);
                acc.failed += Number(c.payslipsFailed || 0);
                acc.anomalies += Number(c.anomaliesFound || 0);
                acc.blocked += Number(c.payslipsBlocked || 0);
                acc.emailed += Number(c.emailedCount || 0);
                return acc;
            },
            { employees: 0, created: 0, failed: 0, anomalies: 0, blocked: 0, emailed: 0 }
        );

        const runCols = [
            { key: "createdAt", label: "Created", get: (r) => fmtDate(r.createdAt) },
            { key: "payDate", label: "Pay Date", get: (r) => fmtDate(r.payDate) },
            { key: "status", label: "Status", get: (r) => r.status || "" },
            { key: "trigger", label: "Trigger", get: (r) => (r?.trigger?.type === "manual" ? "manual" : "scheduler") },
            { key: "by", label: "By", get: (r) => (r?.trigger?.by?.fullName || r?.trigger?.by?.email || "") },
            { key: "emps", label: "Employees", get: (r) => r?.counts?.employees ?? 0 },
            { key: "created", label: "Payslips Created", get: (r) => r?.counts?.payslipsCreated ?? 0 },
            { key: "failed", label: "Failed", get: (r) => r?.counts?.payslipsFailed ?? 0 },
            { key: "anom", label: "Anomalies", get: (r) => r?.counts?.anomaliesFound ?? 0 },
            { key: "blocked", label: "Blocked", get: (r) => r?.counts?.payslipsBlocked ?? 0 },
            { key: "emailed", label: "Emailed", get: (r) => r?.counts?.emailedCount ?? 0 },
            { key: "error", label: "Error", get: (r) => r.error || "" },
        ];

        const empCols = [
            { key: "name", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
            { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
            { key: "empId", label: "Employee ID", get: (r) => r?.employeeSnapshot?.employeeId || "" },
            { key: "payDate", label: "Pay Date", get: (r) => fmtDate(r.payDate) },
            { key: "gross", label: "Gross", get: (r) => fmtMoney(r?.totals?.grossPay) },
            { key: "ded", label: "Deductions", get: (r) => fmtMoney(r?.totals?.totalDeductions) },
            { key: "net", label: "Net", get: (r) => fmtMoney(r?.totals?.netPay) },
            { key: "status", label: "Payslip Status", get: (r) => r.status || "" },
            { key: "proc", label: "Processing", get: (r) => r.processingStatus || "" },
            { key: "kind", label: "Kind", get: (r) => r.payslipKind || "" },
            { key: "seq", label: "Adj Seq", get: (r) => r.adjustmentSequence || 0 },
            { key: "runId", label: "Payroll Run ID", get: (r) => r.payrollRunId || "" },
        ];

        const adjCols = [
            { key: "createdAt", label: "Created", get: (r) => fmtDate(r.createdAt) },
            { key: "employee", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
            { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
            { key: "code", label: "Paycode", get: (r) => r.paycodeCode || "" },
            { key: "name", label: "Name", get: (r) => r.paycodeName || "" },
            { key: "type", label: "Type", get: (r) => r.type || "" },
            { key: "amount", label: "Amount", get: (r) => fmtMoney(r.amount) },
            { key: "status", label: "Status", get: (r) => r.status || "" },
            { key: "by", label: "Created By", get: (r) => r?.createdBy?.fullName || r?.createdBy?.email || "" },
        ];

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <StatCard label="Runs" value={runs.length} hint={`${manualRuns} manual • ${schedRuns} scheduler`} />
                    <StatCard label="Employees (sum across runs)" value={sumCounts.employees} />
                    <StatCard label="Payslips Created" value={sumCounts.created} hint={`Failed: ${sumCounts.failed}`} />
                    <StatCard
                        label="Anomalies / Blocked / Emailed"
                        value={`${sumCounts.anomalies} / ${sumCounts.blocked} / ${sumCounts.emailed}`}
                    />
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Payroll Run Breakdown</div>
                            <div className="text-xs text-slate-600 mt-1">
                                Tabs help you review runs, employee outcomes, and adjustments separately.
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <TabButton active={payrollRunTab === "runs"} onClick={() => setPayrollRunTab("runs")}>
                                Runs
                            </TabButton>
                            <TabButton active={payrollRunTab === "employees"} onClick={() => setPayrollRunTab("employees")}>
                                Employees
                            </TabButton>
                            <TabButton active={payrollRunTab === "adjustments"} onClick={() => setPayrollRunTab("adjustments")}>
                                Adjustments
                            </TabButton>
                        </div>
                    </div>

                    <div className="mt-4">
                        {payrollRunTab === "runs" ? (
                            <Table columns={runCols} rows={runs} />
                        ) : payrollRunTab === "employees" ? (
                            <Table columns={empCols} rows={employees} />
                        ) : (
                            <Table columns={adjCols} rows={adjustments} />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    function PreviewTables() {
        if (!data) return null;

        if (reportKey === "payrollSummary") return <SummaryPreview />;
        if (reportKey === "payrollRuns") return <PayrollRunsBusinessPreview />;

        if (reportKey === "audit") {
            const rows = data.items || [];
            const columns = [
                { key: "date", label: "Date", get: (r) => fmtDate(r.createdAt) },
                { key: "actor", label: "Actor", get: (r) => r?.actorId?.fullName || r?.actorId?.email || "" },
                { key: "role", label: "Role", get: (r) => r.actorRole || "" },
                { key: "module", label: "Module", get: (r) => r.module || "" },
                { key: "action", label: "Action", get: (r) => r.action || "" },
                { key: "message", label: "Message", get: (r) => r.message || "" },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        if (reportKey === "emails") {
            const rows = data.items || [];
            const columns = [
                { key: "dt", label: "Date/Time", get: (r) => fmtDateTime(r.createdAt) },
                {
                    key: "to",
                    label: "To",
                    get: (r) => Array.isArray(r.to) ? r.to.join(", ") : String(r.to || ""),
                },
                { key: "rtype", label: "Recipient Type", get: (r) => r.recipientType || "" },
                { key: "subject", label: "Subject", get: (r) => r.subject || "" },
                { key: "module", label: "Module", get: (r) => r.module || "" },
                { key: "template", label: "Template", get: (r) => r.template || "" },
                { key: "status", label: "Status", get: (r) => r.status || "" },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        if (reportKey === "employeeWise") {
            const rows = data.items || [];
            const columns = [
                { key: "name", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
                { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
                { key: "empId", label: "Employee ID", get: (r) => r?.employeeSnapshot?.employeeId || "" },
                { key: "gross", label: "Gross", get: (r) => fmtMoney(r?.totals?.grossPay) },
                { key: "ded", label: "Deductions", get: (r) => fmtMoney(r?.totals?.totalDeductions) },
                { key: "net", label: "Net", get: (r) => fmtMoney(r?.totals?.netPay) },
                { key: "status", label: "Payslip Status", get: (r) => r.status || "" },
                { key: "proc", label: "Processing", get: (r) => r.processingStatus || "" },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        if (reportKey === "paycodes") {
            const rows = data.items || [];
            const columns = [
                { key: "code", label: "Code", get: (r) => r.code || "" },
                { key: "name", label: "Name", get: (r) => r.name || "" },
                { key: "type", label: "Type", get: (r) => r.type || "" },
                { key: "visible", label: "Visible", get: (r) => (r.visibleOnPayslip ? "Yes" : "No") },
                { key: "active", label: "Active", get: (r) => (r.active === false ? "No" : "Yes") },
                { key: "archivedAt", label: "Archived At", get: (r) => fmtDate(r.archivedAt) },
                { key: "calcType", label: "Calc Type", get: (r) => r.calcType || "" },
                { key: "prio", label: "Priority", get: (r) => r.defaultPriority ?? "" },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        if (reportKey === "employeeSetup") {
            const rows = data.items || [];
            const columns = [
                { key: "name", label: "Full Name", get: (r) => r.fullName || "" },
                { key: "email", label: "Email", get: (r) => r.email || "" },
                { key: "empId", label: "Employee ID", get: (r) => r.employeeId || "" },
                { key: "dept", label: "Department", get: (r) => r.department || "" },
                { key: "eStatus", label: "Employment Status", get: (r) => r.employmentStatus || "" },
                { key: "eType", label: "Employment Type", get: (r) => r.employmentType || "" },
                { key: "hire", label: "Hire Date", get: (r) => fmtDate(r.hireDate) },
                { key: "term", label: "Termination Date", get: (r) => fmtDate(r.terminationDate) },
                { key: "active", label: "Active", get: (r) => (r.isActive ? "Yes" : "No") },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        if (reportKey === "anomalies") {
            const rows = data.items || [];
            const columns = [
                { key: "name", label: "Employee", get: (r) => r?.employeeSnapshot?.fullName || "" },
                { key: "email", label: "Email", get: (r) => r?.employeeSnapshot?.email || "" },
                { key: "empId", label: "Employee ID", get: (r) => r?.employeeSnapshot?.employeeId || "" },
                { key: "severity", label: "Severity", get: (r) => r.severity || "" },
                { key: "status", label: "Status", get: (r) => r.status || "" },
                { key: "count", label: "Count", get: (r) => r.anomalyCount ?? 0 },
                { key: "type", label: "Type", get: (r) => r.type || "" },
                { key: "message", label: "Message", get: (r) => r.message || "" },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        if (reportKey === "accessRights") {
            const rows = data.items || [];
            const columns = [
                { key: "name", label: "Full Name", get: (r) => r.fullName || "" },
                { key: "email", label: "Email", get: (r) => r.email || "" },
                { key: "role", label: "Role", get: (r) => r.role || "" },
                { key: "dept", label: "Department", get: (r) => r.department || "" },
                { key: "active", label: "Active", get: (r) => (r.isActive ? "Yes" : "No") },
                { key: "createdAt", label: "Created At", get: (r) => fmtDate(r.createdAt) },
            ];
            return <Table columns={columns} rows={rows} />;
        }

        return null;
    }

    const needsPeriod = !["paycodes", "employeeSetup", "accessRights"].includes(reportKey);

    return (
        <BackOfficeLayout title="Reports">
            <div className="space-y-5">
                {/* Filters FIRST */}
                <div className="rounded-[28px] bg-white border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-lg font-semibold text-slate-900">Filters</div>
                                <div className="text-sm text-slate-600 mt-1">
                                    Select a report, set filters, preview, then download.
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={runPreview}
                                    disabled={loading}
                                    className={cn(
                                        "rounded-xl px-4 py-2 text-sm font-semibold border transition",
                                        "border-slate-200 bg-slate-900 text-white hover:bg-slate-800",
                                        loading ? "opacity-60 cursor-not-allowed" : ""
                                    )}
                                >
                                    {loading ? "Loading..." : "Preview"}
                                </button>

                                <button
                                    type="button"
                                    onClick={doDownload}
                                    className="rounded-xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                >
                                    Download
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            <div className="md:col-span-1">
                                <Select
                                    label="Report"
                                    value={reportKey}
                                    onChange={(v) => {
                                        setReportKey(v);
                                        setError("");
                                        setSuccess("");
                                        setData(null);
                                        previewScrollTopRef.current = 0;
                                        if (v !== "payrollRuns") setPayrollRunTab("runs");
                                    }}
                                >
                                    {REPORTS.map((r) => (
                                        <Option key={r.key} value={r.key}>
                                            {r.title}
                                        </Option>
                                    ))}
                                </Select>
                            </div>

                            {needsPeriod ? (
                                <div className="md:col-span-1">
                                    <Select
                                        label="Period (YYYY-MM)"
                                        value={period}
                                        onChange={setPeriod}
                                        disabled={loadingPeriods}
                                    >
                                        {loadingPeriods ? <Option value="">Loading...</Option> : null}
                                        {!loadingPeriods && periods.length === 0 ? (
                                            <Option value="">No periods</Option>
                                        ) : null}
                                        {periods.map((p) => (
                                            <Option key={p} value={p}>
                                                {p}
                                            </Option>
                                        ))}
                                    </Select>
                                </div>
                            ) : null}

                            {reportKey === "audit" ? (
                                <div className="md:col-span-1">
                                    <Select label="Module (optional)" value={auditModule} onChange={setAuditModule}>
                                        <Option value="">All</Option>
                                        <Option value="profile">profile</Option>
                                        <Option value="leave">leave</Option>
                                        <Option value="overtime">overtime</Option>
                                        <Option value="support">support</Option>
                                        <Option value="progressions">progressions</Option>
                                        <Option value="adjustments">adjustments</Option>
                                        <Option value="payroll_run">payroll_run</Option>
                                    </Select>
                                </div>
                            ) : null}

                            {/* ✅ Email Report filters */}
                            {reportKey === "emails" ? (
                                <>
                                    <div className="md:col-span-1">
                                        <Select
                                            label="Recipients"
                                            value={emailRecipientType}
                                            onChange={setEmailRecipientType}
                                        >
                                            <Option value="all">All</Option>
                                            <Option value="employee">Employees</Option>
                                            <Option value="admin_pm">Admin/PM</Option>
                                        </Select>
                                    </div>

                                    <div className="md:col-span-1">
                                        <Select label="Module" value={emailModule} onChange={setEmailModule}>
                                            <Option value="">All</Option>
                                            <Option value="leave">leave</Option>
                                            <Option value="overtime">overtime</Option>
                                            <Option value="profile">profile</Option>
                                            <Option value="support">support</Option>
                                            <Option value="payroll">payroll</Option>
                                            <Option value="anomalies">anomalies</Option>
                                        </Select>
                                    </div>

                                    <div className="md:col-span-1">
                                        <Select label="Status" value={emailStatus} onChange={setEmailStatus}>
                                            <Option value="all">All</Option>
                                            <Option value="sent">sent</Option>
                                            <Option value="failed">failed</Option>
                                        </Select>
                                    </div>
                                </>
                            ) : null}

                            {reportKey === "anomalies" ? (
                                <>
                                    <div className="md:col-span-1">
                                        <Select label="Status" value={anomalyStatus} onChange={setAnomalyStatus}>
                                            <Option value="all">All</Option>
                                            <Option value="open">open</Option>
                                            <Option value="reviewed">reviewed</Option>
                                            <Option value="dismissed">dismissed</Option>
                                        </Select>
                                    </div>
                                    <div className="md:col-span-1">
                                        <Select label="Severity" value={anomalySeverity} onChange={setAnomalySeverity}>
                                            <Option value="">All</Option>
                                            <Option value="low">low</Option>
                                            <Option value="medium">medium</Option>
                                            <Option value="high">high</Option>
                                        </Select>
                                    </div>
                                </>
                            ) : null}

                            {reportKey === "paycodes" ? (
                                <div className="md:col-span-1">
                                    <Select label="Paycodes" value={paycodeStatus} onChange={setPaycodeStatus}>
                                        <Option value="all">All</Option>
                                        <Option value="active">Active</Option>
                                        <Option value="archived">Archived</Option>
                                    </Select>
                                </div>
                            ) : null}

                            {reportKey === "employeeSetup" ? (
                                <div className="md:col-span-1">
                                    <Select label="Employees" value={employeeStatus} onChange={setEmployeeStatus}>
                                        <Option value="all">All</Option>
                                        <Option value="active">Active</Option>
                                        <Option value="terminated">Terminated</Option>
                                    </Select>
                                </div>
                            ) : null}

                            {reportKey === "accessRights" ? (
                                <div className="md:col-span-1">
                                    <Select label="Role" value={accessRole} onChange={setAccessRole}>
                                        <Option value="all">Admin + Payroll Manager</Option>
                                        <Option value="admin">Admin only</Option>
                                        <Option value="payroll_manager">Payroll Manager only</Option>
                                    </Select>
                                </div>
                            ) : null}

                            {reportKey === "payrollSummary" ? (
                                <div className="md:col-span-1">
                                    <Select label="Payslips included" value={summaryStatus} onChange={setSummaryStatus}>
                                        <Option value="released">Released only</Option>
                                        <Option value="all">All statuses</Option>
                                    </Select>
                                </div>
                            ) : null}
                        </div>

                        {selectedReport ? (
                            <div className="mt-4 text-sm text-slate-600">
                                <span className="font-semibold text-slate-900">{selectedReport.title}:</span> {selectedReport.desc}
                            </div>
                        ) : null}

                        {success ? (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                {success}
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                {error}
                            </div>
                        ) : null}
                    </div>

                    {/* Preview area */}
                    <div className="p-6">
                        <div className="text-sm font-semibold text-slate-900 mb-3">Preview</div>

                        <div
                            ref={previewWrapRef}
                            onScroll={captureScroll}
                            className="max-h-[560px] overflow-auto rounded-3xl bg-slate-50 border border-slate-200 p-4"
                        >
                            {data ? (
                                <PreviewTables />
                            ) : (
                                <div className="text-sm text-slate-600">
                                    Click <span className="font-semibold text-slate-900">Preview</span> to load the report.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Report cards BELOW */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {REPORTS.map((r) => (
                        <ReportCard
                            key={r.key}
                            active={r.key === reportKey}
                            title={r.title}
                            desc={r.desc}
                            onClick={() => {
                                setReportKey(r.key);
                                setError("");
                                setSuccess("");
                                setData(null);
                                previewScrollTopRef.current = 0;
                                if (r.key !== "payrollRuns") setPayrollRunTab("runs");
                            }}
                        />
                    ))}
                </div>
            </div>
        </BackOfficeLayout>
    );
}
