// client/src/pages_pm/PayrollAdjustments.jsx ✅ FULL FILE
import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { listEmployees } from "../api/employeesApi.js";
import { listPaycodes } from "../api/paycodesApi.js";
import {
    listAdjustments,
    createAdjustment,
    updateAdjustment,
    cancelAdjustment,
    bulkAddAdjustments,
} from "../api/payrollAdjustmentsApi.js";

/* ===================== helpers ===================== */
function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function authHeaders() {
    const token =
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        (() => {
            try {
                const u = JSON.parse(localStorage.getItem("user") || "{}");
                return u?.token || u?.accessToken || "";
            } catch {
                return "";
            }
        })();

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function handleApi(res) {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    if (!res.ok) {
        const msg = isJson ? data?.message : data;
        throw new Error(msg || `Request failed (${res.status})`);
    }
    return data;
}

function formatNumberHuman(n) {
    if (typeof n !== "number") return n;
    if (!Number.isFinite(n)) return String(n);

    const abs = Math.abs(n);

    if (abs >= 1e6) {
        const isIntLike = Math.abs(n - Math.round(n)) < 1e-9;
        return isIntLike
            ? Math.round(n).toLocaleString("en-GB")
            : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    }

    return n.toLocaleString("en-GB", { maximumFractionDigits: 6 });
}

function formatMetaHuman(meta) {
    const seen = new WeakSet();
    return JSON.stringify(
        meta || {},
        (k, v) => {
            if (typeof v === "number") return formatNumberHuman(v);

            if (v && typeof v === "object") {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
            }
            return v;
        },
        2
    );
}

function isValidYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim());
}

function isValidYYYYMMDD(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v.trim());
}

function pad2(n) {
    const x = Number(n) || 0;
    return String(x).padStart(2, "0");
}

function ymd(d) {
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${y}-${m}-${dd}`;
}

function ym(d) {
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    return `${y}-${m}`;
}

function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
}

function holidaySetFromText(holidayText) {
    const set = new Set();
    String(holidayText || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => {
            if (isValidYYYYMMDD(x)) set.add(x);
        });
    return set;
}

function isWeekend(dateObj) {
    const d = dateObj.getDay();
    return d === 0 || d === 6;
}

function computeScheduledRunDate({ year, monthIndex0, dayOfMonth, runHour, runMinute, moveBackIfNonWorking, holidaySet }) {
    const dim = daysInMonth(year, monthIndex0);
    const dom = Math.min(Math.max(Number(dayOfMonth || 1), 1), dim);

    const dt = new Date(year, monthIndex0, dom, Number(runHour || 0), Number(runMinute || 0), 0, 0);

    if (!moveBackIfNonWorking) return dt;

    let guard = 0;
    while (guard < 40) {
        const key = ymd(dt);
        if (!isWeekend(dt) && !holidaySet.has(key)) break;
        dt.setDate(dt.getDate() - 1);
        guard += 1;
    }
    return dt;
}

/* ✅ NEW: Period dropdown options */
function buildPeriodOptions({ past = 18, future = 18 } = {}) {
    const out = [];
    const now = new Date();

    for (let i = past; i >= 1; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push(ym(d));
    }

    out.push(ym(now));

    for (let i = 1; i <= future; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        out.push(ym(d));
    }

    return out;
}

/* ===================== UI components ===================== */
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

function Card({ title, right, children }) {
    return (
        <div
            className={cn(
                "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm",
                "[&_input]:text-slate-900 [&_textarea]:text-slate-900 [&_select]:text-slate-900",
                "[&_input]:bg-white [&_textarea]:bg-white [&_select]:bg-white",
                "[&_input]:placeholder:text-slate-400 [&_textarea]:placeholder:text-slate-400"
            )}
        >
            {title ? (
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                    {right ? <div className="shrink-0">{right}</div> : null}
                </div>
            ) : null}
            {children}
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
                    <div className="p-6 text-slate-900">{children}</div>
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
                            No
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

function Tabs({ value, onChange, tabs }) {
    return (
        <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
                const active = value === t.key;
                return (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => onChange(t.key)}
                        className={cn(
                            "rounded-2xl px-4 py-2 text-sm font-semibold border transition",
                            active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                        )}
                    >
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}

/* ===================== API base urls (MUST MATCH SERVER MOUNTS) ===================== */
const BASE_SCHEDULE = "http://localhost:5000/api/pm/scheduler";
const BASE_RUNS = "http://localhost:5000/api/pm/payroll-runs";
const BASE_BANK = "http://localhost:5000/api/pm/banking/export";
const BASE_ANOMALIES = "http://localhost:5000/api/pm/anomalies";

export default function PayrollAdjustments() {
    const [busy, setBusy] = useState(false);
    const [pageMsg, setPageMsg] = useState({ kind: "info", text: "" });
    const [activeTab, setActiveTab] = useState("adjustments");

    /* ✅ NEW: period options for dropdowns */
    const periodOptions = useMemo(() => buildPeriodOptions({ past: 18, future: 18 }), []);

    /* ---------- adjustments state ---------- */
    const [employees, setEmployees] = useState([]);
    const [paycodes, setPaycodes] = useState([]);
    const [filters, setFilters] = useState({ period: "", status: "", search: "" });
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const [confirmCancel, setConfirmCancel] = useState({ open: false, item: null });

    const [openForm, setOpenForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [modalMsg, setModalMsg] = useState({ kind: "info", text: "" });
    const [form, setForm] = useState({ employeeId: "", paycode: "", amount: "", period: "", note: "" });

    const [openBulk, setOpenBulk] = useState(false);
    const [csvText, setCsvText] = useState("");
    const [bulkResult, setBulkResult] = useState(null);

    /* ---------- scheduler tab state ---------- */
    const [schedLoading, setSchedLoading] = useState(false);
    const [schedule, setSchedule] = useState({
        enabled: true,
        dayOfMonth: 25,
        runHour: 9,
        runMinute: 0,
        moveBackIfNonWorking: true,
        holidays: [],

        // ✅ NEW: optional test override period
        overridePeriod: "",
    });
    const [holidayText, setHolidayText] = useState("");
    const [nextRunPreview, setNextRunPreview] = useState(null);

    const [schedMonth, setSchedMonth] = useState(ym(new Date()));
    const [releaseListCount, setReleaseListCount] = useState(12);
    const [showReleaseDates, setShowReleaseDates] = useState(false);

    /* ---------- run payroll tab state ---------- */
    const [runPeriod, setRunPeriod] = useState("");
    const [runPayDate, setRunPayDate] = useState("");
    const [runResult, setRunResult] = useState(null);
    const [runPreview, setRunPreview] = useState(null);

    // ✅ NEW: selectable run list
    const [runListLoading, setRunListLoading] = useState(false);
    const [runList, setRunList] = useState([]);
    const [runSelected, setRunSelected] = useState({}); // { [employeeId]: true }

    /* ---------- banking tab state ---------- */
    const [bankPeriod, setBankPeriod] = useState("");
    const [bankInfo, setBankInfo] = useState(null);

    /* ---------- anomalies tab state ---------- */
    const [anomPeriod, setAnomPeriod] = useState("");
    const [anomLoading, setAnomLoading] = useState(false);
    const [anomalies, setAnomalies] = useState([]);
    const [openAnom, setOpenAnom] = useState({ open: false, item: null });

    function fmtMU(isoOrDate) {
        if (!isoOrDate) return "";
        const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
        return d.toLocaleString("en-GB", { timeZone: "Indian/Mauritius" });
    }

    /* ===================== adjustments loaders ===================== */
    async function loadAll() {
        setLoading(true);
        try {
            const [emps, pcs] = await Promise.all([listEmployees(), listPaycodes({ archived: "false" })]);
            setEmployees(Array.isArray(emps) ? emps : []);
            setPaycodes(Array.isArray(pcs) ? pcs : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load reference data." });
        } finally {
            setLoading(false);
        }
    }

    async function loadList() {
        setLoading(true);
        try {
            const list = await listAdjustments(filters);
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load adjustments." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
    }, []);

    useEffect(() => {
        if (activeTab !== "adjustments") return;
        loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, filters.period, filters.status, filters.search]);

    function openCreate() {
        setEditing(null);
        setModalMsg({ kind: "info", text: "" });
        setForm({ employeeId: "", paycode: "", amount: "", period: "", note: "" });
        setOpenForm(true);
    }

    function openEdit(it) {
        setEditing(it);
        setModalMsg({ kind: "info", text: "" });
        setForm({
            employeeId: it.employee || "",
            paycode: it.paycodeCode || "",
            amount: String(it.amount ?? ""),
            period: it.period || "",
            note: it.note || "",
        });
        setOpenForm(true);
    }

    async function submit() {
        if (busy) return;
        setBusy(true);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!form.employeeId) throw new Error("Employee is required.");
            if (!form.paycode) throw new Error("Paycode is required.");
            if (!form.period) throw new Error("Period is required (YYYY-MM).");
            if (!String(form.amount).trim()) throw new Error("Amount is required.");

            const payload = {
                employeeId: form.employeeId,
                paycode: form.paycode,
                amount: Number(form.amount),
                period: form.period,
                note: form.note,
            };

            if (editing?._id) {
                await updateAdjustment(editing._id, payload);
                setPageMsg({ kind: "success", text: "Adjustment updated." });
            } else {
                await createAdjustment(payload);
                setPageMsg({ kind: "success", text: "Adjustment created." });
            }

            setOpenForm(false);
            await loadList();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Failed to save adjustment." });
        } finally {
            setBusy(false);
        }
    }

    async function doCancel(it) {
        if (busy) return;
        setBusy(true);
        try {
            await cancelAdjustment(it._id);
            setPageMsg({ kind: "success", text: "Adjustment cancelled." });
            await loadList();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to cancel adjustment." });
        } finally {
            setBusy(false);
            setConfirmCancel({ open: false, item: null });
        }
    }

    async function doBulk() {
        if (busy) return;
        setBusy(true);
        setBulkResult(null);
        setModalMsg({ kind: "info", text: "" });

        try {
            if (!String(csvText).trim()) throw new Error("Paste CSV first.");
            const res = await bulkAddAdjustments(csvText);
            setBulkResult(res);
            setPageMsg({ kind: "success", text: `Bulk import done: ${res.createdCount} created, ${res.skippedCount} skipped.` });
            await loadList();
        } catch (e) {
            setModalMsg({ kind: "error", text: e.message || "Bulk import failed." });
        } finally {
            setBusy(false);
        }
    }

    const pendingCount = useMemo(() => items.filter((x) => x.status === "pending").length, [items]);

    /* ===================== Scheduler tab functions ===================== */
    async function loadSchedule() {
        setSchedLoading(true);
        try {
            const res = await fetch(BASE_SCHEDULE, { headers: authHeaders() });
            const data = await handleApi(res);
            if (data && typeof data === "object") {
                setSchedule((s) => ({
                    ...s,
                    ...data,
                    holidays: Array.isArray(data.holidays) ? data.holidays : [],
                    overridePeriod: typeof data.overridePeriod === "string" ? data.overridePeriod : (s.overridePeriod || ""),
                }));
                setHolidayText(Array.isArray(data.holidays) ? data.holidays.join(", ") : "");
            }
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load schedule." });
        } finally {
            setSchedLoading(false);
        }
    }

    async function previewNextRun() {
        try {
            const res = await fetch(`${BASE_SCHEDULE}/preview`, { headers: authHeaders() });
            const data = await handleApi(res);
            setNextRunPreview(data || null);
        } catch (e) {
            setNextRunPreview(null);
            setPageMsg({ kind: "error", text: e.message || "Failed to preview schedule." });
        }
    }

    async function saveSchedule() {
        if (busy) return;
        setBusy(true);
        try {
            const holidays = String(holidayText || "")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);

            const payload = {
                ...schedule,
                dayOfMonth: Number(schedule.dayOfMonth || 25),
                runHour: Number(schedule.runHour || 9),
                runMinute: Number(schedule.runMinute || 0),
                holidays,

                // ✅ keep overridePeriod in payload
                overridePeriod: String(schedule.overridePeriod || "").trim(),
            };

            const res = await fetch(BASE_SCHEDULE, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await handleApi(res);

            setSchedule((s) => ({
                ...s,
                ...data,
                holidays: Array.isArray(data?.holidays) ? data.holidays : holidays,
                overridePeriod: typeof data?.overridePeriod === "string" ? data.overridePeriod : s.overridePeriod,
            }));
            setPageMsg({ kind: "success", text: "Schedule saved." });
            await previewNextRun();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to save schedule." });
        } finally {
            setBusy(false);
        }
    }

    async function autoFetchHolidaysMU(year) {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch(`${BASE_SCHEDULE}/auto-fetch?year=${encodeURIComponent(year)}&country=MU`, {
                method: "POST",
                headers: authHeaders(),
            });
            const data = await handleApi(res);

            setSchedule((s) => ({
                ...s,
                holidays: Array.isArray(data?.holidays) ? data.holidays : [],
            }));
            setHolidayText(Array.isArray(data?.holidays) ? data.holidays.join(", ") : "");
            setPageMsg({ kind: "success", text: `Holidays updated for ${year}.` });
            await previewNextRun();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to auto-fetch holidays." });
        } finally {
            setBusy(false);
        }
    }

    const holidaySet = useMemo(() => holidaySetFromText(holidayText), [holidayText]);

    const schedPreviewDate = useMemo(() => {
        if (!isValidYYYYMM(schedMonth)) return null;
        const [y, m] = schedMonth.split("-").map((x) => Number(x));
        const dt = computeScheduledRunDate({
            year: y,
            monthIndex0: m - 1,
            dayOfMonth: schedule.dayOfMonth,
            runHour: schedule.runHour,
            runMinute: schedule.runMinute,
            moveBackIfNonWorking: !!schedule.moveBackIfNonWorking,
            holidaySet,
        });
        return dt;
    }, [schedMonth, schedule.dayOfMonth, schedule.runHour, schedule.runMinute, schedule.moveBackIfNonWorking, holidaySet]);

    const upcomingReleaseDates = useMemo(() => {
        const n = Math.min(Math.max(Number(releaseListCount || 12), 1), 36);
        const now = new Date();
        const startY = now.getFullYear();
        const startM = now.getMonth();
        const out = [];
        for (let i = 0; i < n; i++) {
            const d = new Date(startY, startM + i, 1);
            const dt = computeScheduledRunDate({
                year: d.getFullYear(),
                monthIndex0: d.getMonth(),
                dayOfMonth: schedule.dayOfMonth,
                runHour: schedule.runHour,
                runMinute: schedule.runMinute,
                moveBackIfNonWorking: !!schedule.moveBackIfNonWorking,
                holidaySet,
            });
            out.push({ period: ym(d), date: dt, dateKey: ymd(dt) });
        }
        return out;
    }, [releaseListCount, schedule.dayOfMonth, schedule.runHour, schedule.runMinute, schedule.moveBackIfNonWorking, holidaySet]);

    const monthCalendar = useMemo(() => {
        if (!isValidYYYYMM(schedMonth)) return null;
        const [y, m] = schedMonth.split("-").map((x) => Number(x));
        const year = y;
        const monthIndex0 = m - 1;

        const first = new Date(year, monthIndex0, 1, 0, 0, 0, 0);
        const dim = daysInMonth(year, monthIndex0);

        const startDowMon0 = (first.getDay() + 6) % 7;
        const cells = [];
        for (let i = 0; i < startDowMon0; i++) cells.push(null);
        for (let day = 1; day <= dim; day++) cells.push(new Date(year, monthIndex0, day, 0, 0, 0, 0));
        while (cells.length % 7 !== 0) cells.push(null);

        const targetDay = schedPreviewDate ? ymd(schedPreviewDate) : null;

        return {
            year,
            monthIndex0,
            cells,
            targetDay,
        };
    }, [schedMonth, schedPreviewDate]);

    /* ===================== Run Payroll functions ===================== */
    async function loadRunPreview() {
        if (!isValidYYYYMM(runPeriod)) return setRunPreview(null);
        try {
            const res = await fetch(`${BASE_RUNS}/preview?period=${encodeURIComponent(runPeriod)}`, { headers: authHeaders() });
            const data = await handleApi(res);
            setRunPreview(data || null);
        } catch {
            setRunPreview(null);
        }
    }

    async function loadRunList() {
        if (!isValidYYYYMM(runPeriod)) {
            setRunList([]);
            setRunSelected({});
            return;
        }

        setRunListLoading(true);
        try {
            const res = await fetch(`${BASE_RUNS}/run-list?period=${encodeURIComponent(runPeriod)}`, { headers: authHeaders() });
            const data = await handleApi(res);
            const list = Array.isArray(data?.items) ? data.items : [];
            setRunList(list);

            const nextSel = {};
            for (const it of list) {
                if (it?.hasPendingAdjustments) nextSel[it.employeeId] = true;
            }
            setRunSelected(nextSel);
        } catch (e) {
            setRunList([]);
            setRunSelected({});
            setPageMsg({ kind: "error", text: e.message || "Failed to load run list." });
        } finally {
            setRunListLoading(false);
        }
    }

    function getSelectedEmployeeIds() {
        return Object.entries(runSelected)
            .filter(([, v]) => !!v)
            .map(([k]) => k);
    }

    function selectOnlyAdjustments() {
        const nextSel = {};
        for (const it of runList) {
            if (it?.hasPendingAdjustments) nextSel[it.employeeId] = true;
        }
        setRunSelected(nextSel);
    }

    function selectAllUnpaid() {
        const nextSel = {};
        for (const it of runList) {
            if (it?.alreadyReleased) continue;
            nextSel[it.employeeId] = true;
        }
        setRunSelected(nextSel);
    }

    function clearSelection() {
        setRunSelected({});
    }

    async function runPayrollNow() {
        if (busy) return;
        setBusy(true);
        setRunResult(null);

        try {
            if (!isValidYYYYMM(runPeriod)) throw new Error("Period must be YYYY-MM");

            const selectedEmployeeIds = getSelectedEmployeeIds();
            if (!selectedEmployeeIds.length) {
                throw new Error("Select at least one employee to run payroll for.");
            }

            const payload = {
                period: runPeriod,
                payDate: runPayDate ? new Date(runPayDate).toISOString() : null,
                selectedEmployeeIds,
            };

            const res = await fetch(`${BASE_RUNS}/run`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });

            const data = await handleApi(res);
            setRunResult(data || { ok: true });

            const anomalies = Number(data?.anomaliesFound || data?.anomalies || 0);
            const blocked = Number(data?.payslipsBlocked || data?.blocked || 0);

            if (anomalies > 0 || blocked > 0) {
                setPageMsg({
                    kind: "success",
                    text: `Run completed. Anomalies detected (${anomalies}). Payslips blocked/not sent: ${blocked}. Check the Anomalies tab.`,
                });
            } else {
                setPageMsg({ kind: "success", text: "Run completed. Payslips released to selected employees only." });
            }

            await loadRunPreview();
            await loadRunList();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to run payroll." });
        } finally {
            setBusy(false);
        }
    }

    /* ===================== Banking export functions ===================== */
    async function downloadBankingCsv() {
        if (busy) return;
        setBusy(true);
        setBankInfo(null);

        try {
            if (!isValidYYYYMM(bankPeriod)) throw new Error("Period must be YYYY-MM");

            const res = await fetch(`${BASE_BANK}?period=${encodeURIComponent(bankPeriod)}`, { headers: authHeaders() });
            const csvTextOut = String((await handleApi(res)) || "");

            if (!csvTextOut.trim()) throw new Error("No CSV returned from server.");

            setBankInfo({ ok: true });

            const blob = new Blob([csvTextOut], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `banking-export-${bankPeriod}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            setPageMsg({ kind: "success", text: "Banking export downloaded." });
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to export banking CSV." });
        } finally {
            setBusy(false);
        }
    }

    /* ===================== Anomalies functions ===================== */
    async function loadAnomalies() {
        if (!isValidYYYYMM(anomPeriod)) {
            setAnomalies([]);
            return;
        }

        setAnomLoading(true);
        try {
            const res = await fetch(`${BASE_ANOMALIES}?period=${encodeURIComponent(anomPeriod)}`, { headers: authHeaders() });
            const data = await handleApi(res);
            setAnomalies(Array.isArray(data) ? data : []);
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to load anomalies." });
            setAnomalies([]);
        } finally {
            setAnomLoading(false);
        }
    }

    async function anomalyResolve(anom, decision) {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch(`${BASE_ANOMALIES}/${anom._id}/resolve`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ decision }),
            });
            await handleApi(res);

            if (decision === "approve") setPageMsg({ kind: "success", text: "Approved. Payslip released + email sent." });
            else setPageMsg({ kind: "success", text: "Dismissed. Kept for record." });

            await loadAnomalies();
        } catch (e) {
            setPageMsg({ kind: "error", text: e.message || "Failed to update anomaly." });
        } finally {
            setBusy(false);
        }
    }

    /* ===================== tab switching loads + resets ===================== */
    useEffect(() => {
        setPageMsg({ kind: "info", text: "" });
        setModalMsg({ kind: "info", text: "" });

        setRunPreview(null);
        setRunResult(null);
        setNextRunPreview(null);
        setBankInfo(null);
        setAnomalies([]);
        setRunList([]);
        setRunSelected({});

        if (activeTab === "scheduler") {
            loadSchedule();
            previewNextRun();
            setShowReleaseDates(false);

            if (!isValidYYYYMM(schedMonth)) setSchedMonth(ym(new Date()));
        }

        if (activeTab === "run") {
            setRunResult(null);
            setRunPreview(null);
        }

        if (activeTab === "banking") {
            setBankInfo(null);
        }

        if (activeTab === "anomalies") {
            setAnomalies([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "run") return;
        loadRunPreview();
        loadRunList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, runPeriod]);

    useEffect(() => {
        if (activeTab !== "anomalies") return;
        loadAnomalies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, anomPeriod]);

    const tabs = [
        { key: "adjustments", label: "Adjustments" },
        { key: "run", label: "Run Payroll" },
        { key: "scheduler", label: "Scheduler" },
        { key: "banking", label: "Banking Export" },
        { key: "anomalies", label: "Anomalies" },
    ];

    const selectedCount = useMemo(() => getSelectedEmployeeIds().length, [runSelected]);

    return (
        <BackOfficeLayout title="Payroll Adjustments">
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={pageMsg.kind} message={pageMsg.text} onClose={() => setPageMsg({ kind: "info", text: "" })} />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                    <div>
                        <div className="text-slate-900 font-semibold">Payroll</div>
                        <div className="text-slate-600 text-sm">
                            {activeTab === "adjustments" ? `${pendingCount} pending • ${items.length} adjustments` : "Manage payroll operations"}
                        </div>
                    </div>
                    <Tabs value={activeTab} onChange={setActiveTab} tabs={tabs} />
                </div>

                {/* ===================== Adjustments tab ===================== */}
                {activeTab === "adjustments" ? (
                    <>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                            <div className="text-sm text-slate-600">Create, edit, cancel and bulk-import payroll adjustments.</div>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOpenBulk(true)}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                >
                                    Bulk Import
                                </button>
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    + Add Adjustment
                                </button>
                            </div>
                        </div>

                        <Card title="Filters">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <input
                                    value={filters.search}
                                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                                    placeholder="Search employee/paycode..."
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                />

                                {/* ✅ Period dropdown */}
                                <select
                                    value={filters.period}
                                    onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="">All periods</option>
                                    {periodOptions.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={filters.status}
                                    onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="">All statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="applied">Applied</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </Card>

                        <div className="mt-5">
                            <Card title="Adjustment List">
                                {loading ? (
                                    <div className="text-slate-600 text-sm">Loading…</div>
                                ) : items.length === 0 ? (
                                    <div className="text-slate-600 text-sm">No adjustments found.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {items.map((it) => (
                                            <div key={it._id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="text-slate-900 font-semibold truncate">
                                                            {it.employeeSnapshot?.fullName || "Employee"}{" "}
                                                            <span className="text-slate-500 text-xs font-normal">
                                                                • {it.employeeSnapshot?.email || "-"} • {it.period}
                                                            </span>
                                                        </div>
                                                        <div className="text-slate-700 text-sm">
                                                            {it.paycodeCode} — {it.paycodeName || "Paycode"} • {it.type} • Amount: {it.amount}
                                                        </div>
                                                        {it.note ? <div className="text-slate-500 text-xs mt-1">{it.note}</div> : null}
                                                    </div>

                                                    <div className="flex items-center gap-4 shrink-0">
                                                        <span
                                                            className={cn(
                                                                "text-xs font-semibold rounded-full px-3 py-1 border",
                                                                it.status === "pending"
                                                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                                                    : it.status === "cancelled"
                                                                        ? "bg-rose-50 text-rose-800 border-rose-200"
                                                                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                            )}
                                                        >
                                                            {it.status}
                                                        </span>

                                                        {it.status === "pending" ? (
                                                            <>
                                                                <button type="button" onClick={() => openEdit(it)} className="text-sm font-semibold text-slate-700 hover:underline" disabled={busy}>
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmCancel({ open: true, item: it })}
                                                                    className="text-sm font-semibold text-rose-700 hover:underline"
                                                                    disabled={busy}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </div>
                    </>
                ) : null}

                {/* ===================== Run Payroll ===================== */}
                {activeTab === "run" ? (
                    <Card
                        title="Run Payroll"
                        right={
                            <button
                                type="button"
                                onClick={runPayrollNow}
                                disabled={busy || !isValidYYYYMM(runPeriod) || selectedCount === 0}
                                className={cn(
                                    "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                    busy || !isValidYYYYMM(runPeriod) || selectedCount === 0
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                )}
                                title={selectedCount === 0 ? "Select at least one employee" : ""}
                            >
                                {busy ? "Running..." : `Run (${selectedCount})`}
                            </button>
                        }
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Period *</div>

                                {/* ✅ Period dropdown */}
                                <select
                                    value={runPeriod}
                                    onChange={(e) => setRunPeriod(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="">Select period…</option>
                                    {periodOptions.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-1">Pay Date (optional)</div>
                                <input
                                    value={runPayDate}
                                    onChange={(e) => setRunPayDate(e.target.value)}
                                    type="date"
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </div>

                            <div className="flex items-end gap-2">
                                <button
                                    type="button"
                                    disabled={!isValidYYYYMM(runPeriod) || busy}
                                    onClick={loadRunPreview}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                >
                                    Preview
                                </button>

                                <button
                                    type="button"
                                    disabled={!isValidYYYYMM(runPeriod) || busy}
                                    onClick={loadRunList}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                >
                                    Refresh List
                                </button>
                            </div>
                        </div>

                        {runPreview ? (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                <div className="font-semibold text-slate-900 mb-1">Preview</div>
                                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(runPreview, null, 2)}</pre>
                            </div>
                        ) : null}

                        {/* ✅ Select employees */}
                        <div className="mt-5">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                <div className="text-sm font-semibold text-slate-900">Who should receive payslips now?</div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={selectOnlyAdjustments}
                                        disabled={busy || runList.length === 0}
                                        className="rounded-2xl px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                    >
                                        Select adjustments only
                                    </button>
                                    <button
                                        type="button"
                                        onClick={selectAllUnpaid}
                                        disabled={busy || runList.length === 0}
                                        className="rounded-2xl px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                    >
                                        Select all unpaid
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearSelection}
                                        disabled={busy || runList.length === 0}
                                        className="rounded-2xl px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white">
                                {runListLoading ? (
                                    <div className="p-4 text-sm text-slate-600">Loading employees…</div>
                                ) : runList.length === 0 ? (
                                    <div className="p-4 text-sm text-slate-600">
                                        {isValidYYYYMM(runPeriod) ? "No employees found for this period." : "Enter a valid period to load employees."}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {runList.map((it) => {
                                            const checked = !!runSelected[it.employeeId];
                                            const disabled = busy || !!it.alreadyReleased;
                                            return (
                                                <label
                                                    key={it.employeeId}
                                                    className={cn(
                                                        "flex items-start gap-3 p-4 cursor-pointer",
                                                        disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        disabled={disabled}
                                                        onChange={(e) => {
                                                            const v = e.target.checked;
                                                            setRunSelected((s) => ({ ...s, [it.employeeId]: v }));
                                                        }}
                                                        className="mt-1"
                                                    />

                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-semibold text-slate-900 truncate">
                                                            {it.fullName || "Employee"}{" "}
                                                            <span className="text-slate-500 text-xs font-normal">• {it.email || "-"}</span>
                                                        </div>

                                                        <div className="mt-1 flex flex-wrap gap-2">
                                                            {it.hasPendingAdjustments ? (
                                                                <span className="text-xs font-semibold rounded-full px-3 py-1 border bg-amber-50 text-amber-800 border-amber-200">
                                                                    has adjustment
                                                                </span>
                                                            ) : null}

                                                            {it.alreadyReleased ? (
                                                                <span className="text-xs font-semibold rounded-full px-3 py-1 border bg-emerald-50 text-emerald-800 border-emerald-200">
                                                                    already paid
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs font-semibold rounded-full px-3 py-1 border bg-slate-50 text-slate-700 border-slate-200">
                                                                    unpaid
                                                                </span>
                                                            )}
                                                        </div>

                                                        {it.alreadyReleased ? (
                                                            <div className="text-xs text-slate-500 mt-2">
                                                                This employee already has a released payslip for {runPeriod}. (Disabled)
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="text-xs text-slate-500 mt-2">
                                Default selection = employees with pending adjustments, so an adjustment run won’t accidentally send everyone.
                            </div>
                        </div>

                        {runResult ? (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                <div className="font-semibold text-slate-900 mb-1">Run Result</div>
                                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(runResult, null, 2)}</pre>
                            </div>
                        ) : null}
                    </Card>
                ) : null}

                {/* ===================== Scheduler ===================== */}
                {activeTab === "scheduler" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <Card
                            title="Scheduler"
                            right={
                                <button
                                    type="button"
                                    onClick={saveSchedule}
                                    disabled={busy}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        busy ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                    )}
                                >
                                    {busy ? "Saving..." : "Save"}
                                </button>
                            }
                        >
                            {schedLoading ? <div className="text-sm text-slate-600">Loading schedule…</div> : null}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={!!schedule.enabled} onChange={(e) => setSchedule((s) => ({ ...s, enabled: e.target.checked }))} />
                                    Enabled
                                </label>

                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={!!schedule.moveBackIfNonWorking}
                                        onChange={(e) => setSchedule((s) => ({ ...s, moveBackIfNonWorking: e.target.checked }))}
                                    />
                                    Move back if weekend/holiday
                                </label>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Day of month</div>
                                    <input
                                        value={schedule.dayOfMonth}
                                        onChange={(e) => setSchedule((s) => ({ ...s, dayOfMonth: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="25"
                                    />
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Run hour (0-23)</div>
                                    <input
                                        value={schedule.runHour}
                                        onChange={(e) => setSchedule((s) => ({ ...s, runHour: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="9"
                                    />
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Run minute (0-59)</div>
                                    <input
                                        value={schedule.runMinute}
                                        onChange={(e) => setSchedule((s) => ({ ...s, runMinute: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="text-xs text-slate-500 mb-1">Holidays (YYYY-MM-DD, comma separated)</div>
                                <input
                                    value={holidayText}
                                    onChange={(e) => setHolidayText(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                    placeholder="2026-01-01, 2026-03-12"
                                />
                            </div>

                            {/* ✅ NEW: Test override period */}
                            <div className="mt-4">
                                <div className="text-xs text-slate-500 mb-1">Test run period (optional)</div>
                                <select
                                    value={schedule.overridePeriod || ""}
                                    onChange={(e) => setSchedule((s) => ({ ...s, overridePeriod: e.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="">Normal monthly run</option>
                                    {periodOptions.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>

                                <div className="text-xs text-slate-500 mt-1">
                                    Choose a period ONLY for testing. Leave empty for normal payroll schedule.
                                </div>

                                {schedule.overridePeriod ? (
                                    <div className="text-xs mt-2">
                                        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-200">
                                            TEST MODE: {schedule.overridePeriod}
                                        </span>
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={loadSchedule}
                                    disabled={busy}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                >
                                    Reload
                                </button>
                                <button
                                    type="button"
                                    onClick={previewNextRun}
                                    disabled={busy}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                >
                                    Preview Next Run (server)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => autoFetchHolidaysMU(new Date().getFullYear())}
                                    disabled={busy}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                >
                                    Auto-Fetch MU Holidays (This Year)
                                </button>
                            </div>

                            {nextRunPreview ? (
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                    <div className="font-semibold text-slate-900 mb-1">Next Run Preview (server)</div>
                                    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(nextRunPreview, null, 2)}</pre>
                                </div>
                            ) : null}
                        </Card>

                        <Card
                            title="Release Dates"
                            right={
                                <button
                                    type="button"
                                    onClick={() => setShowReleaseDates((v) => !v)}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                >
                                    {showReleaseDates ? "Hide" : "Show"} dates
                                </button>
                            }
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Month</div>

                                    {/* ✅ Month dropdown (optional: still can type if you want; dropdown keeps format consistent) */}
                                    <select
                                        value={schedMonth}
                                        onChange={(e) => setSchedMonth(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                    >
                                        {periodOptions.map((p) => (
                                            <option key={p} value={p}>
                                                {p}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Show next (months)</div>
                                    <input
                                        value={releaseListCount}
                                        onChange={(e) => setReleaseListCount(e.target.value)}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="12"
                                    />
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-900">This month’s release</div>
                                <div className="text-sm text-slate-700 mt-1">
                                    {schedPreviewDate ? (
                                        <>
                                            <span className="font-mono text-xs">{ymd(schedPreviewDate)}</span>
                                            <span className="text-slate-500"> • </span>
                                            <span>{fmtMU(schedPreviewDate)}</span>
                                            {holidaySet.has(ymd(schedPreviewDate)) || isWeekend(schedPreviewDate) ? (
                                                <span className="ml-2 text-rose-700 text-xs font-semibold">(non-working)</span>
                                            ) : null}
                                        </>
                                    ) : (
                                        <span className="text-slate-500 text-sm">Enter a valid month (YYYY-MM)</span>
                                    )}
                                </div>

                                {monthCalendar ? (
                                    <div className="mt-4">
                                        <div className="grid grid-cols-7 gap-2 text-xs text-slate-500 mb-2">
                                            <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
                                        </div>
                                        <div className="grid grid-cols-7 gap-2">
                                            {monthCalendar.cells.map((cell, idx) => {
                                                if (!cell) return <div key={idx} className="h-10 rounded-xl border border-transparent" />;

                                                const key = ymd(cell);
                                                const isTarget = monthCalendar.targetDay && key === monthCalendar.targetDay;
                                                const isHol = holidaySet.has(key);
                                                const wknd = isWeekend(cell);

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "h-10 rounded-xl border flex items-center justify-center text-sm",
                                                            isTarget
                                                                ? "border-slate-900 bg-slate-900 text-white font-semibold"
                                                                : "border-slate-200 bg-white text-slate-900",
                                                            (isHol || wknd) && !isTarget ? "opacity-70" : ""
                                                        )}
                                                        title={`${key}${isHol ? " • holiday" : ""}${wknd ? " • weekend" : ""}${isTarget ? " • release" : ""}`}
                                                    >
                                                        {cell.getDate()}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-3 text-xs text-slate-500">Dark = release date • Dim = weekend/holiday</div>
                                    </div>
                                ) : null}
                            </div>

                            {showReleaseDates ? (
                                <div className="mt-4">
                                    <div className="text-sm font-semibold text-slate-900 mb-2">Upcoming release dates</div>
                                    <div className="space-y-2">
                                        {upcomingReleaseDates.map((x) => (
                                            <div key={x.period} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="text-slate-900 font-semibold">
                                                            {x.period}
                                                            <span className="text-slate-500 text-xs font-normal"> • {x.dateKey}</span>
                                                        </div>
                                                        <div className="text-slate-700 text-sm">{fmtMU(x.date)}</div>
                                                    </div>
                                                    <div className="shrink-0">
                                                        {holidaySet.has(x.dateKey) || isWeekend(x.date) ? (
                                                            <span className="text-xs font-semibold rounded-full px-3 py-1 border bg-rose-50 text-rose-800 border-rose-200">
                                                                non-working
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-semibold rounded-full px-3 py-1 border bg-emerald-50 text-emerald-800 border-emerald-200">
                                                                working day
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </Card>
                    </div>
                ) : null}

                {/* ===================== Banking Export ===================== */}
                {activeTab === "banking" ? (
                    <Card
                        title="Banking Export"
                        right={
                            <button
                                type="button"
                                onClick={downloadBankingCsv}
                                disabled={busy || !isValidYYYYMM(bankPeriod)}
                                className={cn(
                                    "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                    busy || !isValidYYYYMM(bankPeriod)
                                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                        : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                )}
                            >
                                {busy ? "Exporting..." : "Download CSV"}
                            </button>
                        }
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Period *</div>

                                {/* ✅ Period dropdown */}
                                <select
                                    value={bankPeriod}
                                    onChange={(e) => setBankPeriod(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="">Select period…</option>
                                    {periodOptions.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {bankInfo ? <div className="mt-3 text-xs text-slate-500">Exports only include payslips with status: released.</div> : null}
                    </Card>
                ) : null}

                {/* ===================== Anomalies ===================== */}
                {activeTab === "anomalies" ? (
                    <Card title="Anomaly Detection">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Period *</div>

                                {/* ✅ Period dropdown */}
                                <select
                                    value={anomPeriod}
                                    onChange={(e) => setAnomPeriod(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="">Select period…</option>
                                    {periodOptions.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={loadAnomalies}
                                    disabled={busy || !isValidYYYYMM(anomPeriod)}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 disabled:opacity-50"
                                >
                                    Refresh
                                </button>
                            </div>
                        </div>

                        <div className="mt-5">
                            {anomLoading ? (
                                <div className="text-sm text-slate-600">Loading…</div>
                            ) : anomalies.length === 0 ? (
                                <div className="text-sm text-slate-600">No anomalies found.</div>
                            ) : (
                                <div className="space-y-2">
                                    {anomalies.map((a) => (
                                        <div key={a._id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="text-slate-900 font-semibold truncate">
                                                        {a.employeeSnapshot?.fullName || "Employee"}{" "}
                                                        <span className="text-slate-500 text-xs font-normal">• {a.employeeSnapshot?.email || "-"} • {a.period || anomPeriod}</span>
                                                    </div>

                                                    <div className="text-slate-700 text-sm mt-1">
                                                        <span className="font-semibold">{a.type || "ANOMALY"}</span>: {a.message || "Potential issue detected"}
                                                    </div>

                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <span
                                                            className={cn(
                                                                "text-xs font-semibold rounded-full px-3 py-1 border",
                                                                a.severity === "high"
                                                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                                                    : a.severity === "medium"
                                                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                                                        : "bg-slate-50 text-slate-700 border-slate-200"
                                                            )}
                                                        >
                                                            {a.severity || "low"}
                                                        </span>

                                                        <span
                                                            className={cn(
                                                                "text-xs font-semibold rounded-full px-3 py-1 border",
                                                                a.status === "open"
                                                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                                                    : a.status === "dismissed"
                                                                        ? "bg-slate-50 text-slate-700 border-slate-200"
                                                                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                            )}
                                                        >
                                                            {a.status || "open"}
                                                        </span>
                                                    </div>

                                                    {a.meta ? (
                                                        <div className="text-xs text-slate-500 mt-2 font-mono whitespace-pre-wrap">
                                                            {formatMetaHuman(a.meta)}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenAnom({ open: true, item: a })}
                                                        className="rounded-xl px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 min-w-[86px] text-center"
                                                    >
                                                        View
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={busy || a.status !== "open"}
                                                        onClick={() => anomalyResolve(a, "dismiss")}
                                                        className="rounded-xl px-3 py-2 text-xs font-semibold border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 min-w-[86px] text-center"
                                                        title="Dismiss anomaly"
                                                    >
                                                        Dismiss
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={busy || a.status !== "open"}
                                                        onClick={() => anomalyResolve(a, "approve")}
                                                        className="rounded-xl px-3 py-2 text-xs font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 min-w-[86px] text-center disabled:opacity-50"
                                                        title="Approve = release payslip + email employee"
                                                    >
                                                        Approve
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>
                ) : null}
            </div>

            {/* ✅ Cancel confirmation */}
            <ConfirmModal
                open={confirmCancel.open}
                title="Cancel adjustment?"
                message={
                    confirmCancel.item
                        ? `Are you sure you want to cancel ${confirmCancel.item.paycodeCode || "this adjustment"} for ${confirmCancel.item.employeeSnapshot?.fullName || "this employee"
                        } (${confirmCancel.item.period || "-"})?`
                        : ""
                }
                confirmText="Yes, cancel"
                tone="danger"
                busy={busy}
                onCancel={() => setConfirmCancel({ open: false, item: null })}
                onConfirm={() => {
                    if (!confirmCancel.item) return;
                    doCancel(confirmCancel.item);
                }}
            />

            {/* Create/Edit */}
            <ModalShell open={openForm} title={editing ? "Edit Adjustment" : "Add Adjustment"} onClose={() => !busy && setOpenForm(false)}>
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs text-slate-500 mb-1">Employee *</div>
                        <select
                            value={form.employeeId}
                            onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                            disabled={busy}
                        >
                            <option value="">Select employee…</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.fullName} ({e.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Paycode *</div>
                        <select
                            value={form.paycode}
                            onChange={(e) => setForm((f) => ({ ...f, paycode: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                            disabled={busy}
                        >
                            <option value="">Select paycode…</option>
                            {paycodes.map((p) => (
                                <option key={p._id} value={p.code}>
                                    {p.code} — {p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Amount *</div>
                        <input
                            value={form.amount}
                            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="e.g. 1500"
                        />
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 mb-1">Period *</div>

                        {/* ✅ Period dropdown */}
                        <select
                            value={form.period}
                            onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="">Select period…</option>
                            {periodOptions.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="sm:col-span-2">
                        <div className="text-xs text-slate-500 mb-1">Note</div>
                        <textarea
                            value={form.note}
                            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[90px]"
                            placeholder="Optional note…"
                        />
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
                        {busy ? "Saving..." : editing ? "Save" : "Create"}
                    </button>
                </div>
            </ModalShell>

            <ModalShell
                open={openAnom.open}
                title="Anomaly details"
                onClose={() => setOpenAnom({ open: false, item: null })}
                widthClass="sm:w-[820px]"
            >
                {openAnom.item ? (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-sm font-semibold text-slate-900">
                                {openAnom.item.employeeSnapshot?.fullName || "Employee"}
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                                {openAnom.item.employeeSnapshot?.email || "-"} • Period: {openAnom.item.period || "-"}
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                                Total anomalies: <b>{openAnom.item.anomalyCount || (openAnom.item.items?.length ?? 0)}</b>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {(openAnom.item.items || []).map((it, idx) => (
                                <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-900">
                                                {it.type || "ANOMALY"}
                                            </div>
                                            <div className="text-sm text-slate-700 mt-1">
                                                {it.message || "-"}
                                            </div>
                                        </div>

                                        <span
                                            className={cn(
                                                "text-xs font-semibold rounded-full px-3 py-1 border",
                                                it.severity === "high"
                                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                                    : it.severity === "medium"
                                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                                        : "bg-slate-50 text-slate-700 border-slate-200"
                                            )}
                                        >
                                            {it.severity || "low"}
                                        </span>
                                    </div>

                                    {it.meta ? (
                                        <div className="text-xs text-slate-500 mt-3 font-mono whitespace-pre-wrap">
                                            {formatMetaHuman(it.meta)}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setOpenAnom({ open: false, item: null })}
                                className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                ) : null}
            </ModalShell>

            {/* Bulk */}
            <ModalShell open={openBulk} title="Bulk Import Adjustments" onClose={() => !busy && setOpenBulk(false)} widthClass="sm:w-[980px]">
                <MessageBox kind={modalMsg.kind} message={modalMsg.text} onClose={() => setModalMsg({ kind: "info", text: "" })} />

                <div className="text-sm text-slate-700 mb-3">
                    CSV header (choose ONE):{" "}
                    <span className="ml-2 font-mono text-xs">employeeEmail,paycode,amount,period,note</span> OR{" "}
                    <span className="ml-2 font-mono text-xs">employeeId,paycode,amount,period,note</span>
                </div>

                <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[220px] bg-white text-slate-900 placeholder:text-slate-400 font-mono"
                    placeholder={`employeeEmail,paycode,amount,period,note
john@x.com,BASIC,50000,2026-01,Basic salary correction
jane@x.com,OT,1200,2026-01,Overtime`}
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
                        {busy ? "Processing..." : "Run Import"}
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
        </BackOfficeLayout>
    );
}
