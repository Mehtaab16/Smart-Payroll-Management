// server/routes/reports.js
import express from "express";
import { authRequired, requireAnyRole } from "../middleware/auth.js";

import AuditLog from "../models/AuditLog.js";
import Payslip from "../models/Payslip.js";
import PayrollRun from "../models/PayrollRun.js";
import PayrollAdjustment from "../models/PayrollAdjustment.js";
import PayrollAnomaly from "../models/PayrollAnomaly.js";
import Paycode from "../models/Paycode.js";
import User from "../models/User.js";
import EmailLog from "../models/EmailLog.js";

const router = express.Router();

function isYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

//  filter by createdAt month range
function monthRange(period) {
    const start = new Date(`${period}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end };
}

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

// Periods 
router.get("/periods", async (req, res) => {
    try {
        const [payslipPeriods, runPeriods, adjPeriods, anomPeriods, emailPeriods] = await Promise.all([
            Payslip.distinct("payPeriod.period"),
            PayrollRun.distinct("period"),
            PayrollAdjustment.distinct("period"),
            PayrollAnomaly.distinct("period"),
            EmailLog.distinct("period"),
        ]);

        const raw = [...payslipPeriods, ...runPeriods, ...adjPeriods, ...anomPeriods, ...emailPeriods].filter(Boolean);
        const cleaned = raw.map((p) => String(p).trim()).filter(isYYYYMM);

        const periods = Array.from(new Set(cleaned)).sort((a, b) => (a < b ? 1 : -1));
        res.json({ ok: true, periods });
    } catch (e) {
        res.status(500).json({ message: "Failed to load periods", error: e.message });
    }
});

// Audit Report 
router.get("/audit", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const limit = Math.min(parseInt(req.query.limit || "200", 10), 500);
        const module = String(req.query.module || "").trim();
        const actorId = String(req.query.actorId || "").trim();
        const subjectId = String(req.query.subjectId || "").trim();

        const { start, end } = monthRange(period);

        const filter = { createdAt: { $gte: start, $lt: end } };
        if (module) filter.module = module;
        if (actorId) filter.actorId = actorId;
        if (subjectId) filter.subjectId = subjectId;

        const list = await AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("actorId", "fullName email role employeeId")
            .populate("subjectId", "fullName email role employeeId")
            .lean();

        res.json({ ok: true, period, count: list.length, items: list });
    } catch (e) {
        res.status(500).json({ message: "Failed to load audit report", error: e.message });
    }
});

// Payroll Summary 
router.get("/payroll-summary", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const status = String(req.query.status || "released").trim(); // released|all

        const filter = { "payPeriod.period": period };
        if (status !== "all") filter.status = "released";

        const list = await Payslip.find(filter)
            .select("payPeriod totals status processingStatus payslipKind")
            .lean();

        const counts = {
            total: list.length,
            released: 0,
            approved: 0,
            draft: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            regular: 0,
            adjustment: 0,
        };

        let gross = 0;
        let deductions = 0;
        let net = 0;

        let payDate = null;
        for (const p of list) {
            counts[p.status] = (counts[p.status] || 0) + 1;
            counts[p.processingStatus] = (counts[p.processingStatus] || 0) + 1;
            counts[p.payslipKind] = (counts[p.payslipKind] || 0) + 1;

            gross += Number(p?.totals?.grossPay || 0);
            deductions += Number(p?.totals?.totalDeductions || 0);
            net += Number(p?.totals?.netPay || 0);

            if (!payDate && p?.payPeriod?.payDate) payDate = p.payPeriod.payDate;
        }

        const latestRun = await PayrollRun.findOne({ period }).sort({ createdAt: -1 }).lean();

        res.json({
            ok: true,
            period,
            payDate: latestRun?.payDate || payDate,
            totals: { grossPay: gross, totalDeductions: deductions, netPay: net },
            counts,
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to load payroll summary", error: e.message });
    }
});

// Employee-wise Report 
router.get("/employee-wise", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const employeeId = String(req.query.employeeId || "").trim();

        const payslipFilter = { "payPeriod.period": period };
        if (employeeId) payslipFilter.employee = employeeId;

        const [payslips, anomalies, adjustments] = await Promise.all([
            Payslip.find(payslipFilter)
                .select("employee employeeSnapshot payPeriod totals status processingStatus payslipKind adjustmentSequence payrollRunId")
                .lean(),
            PayrollAnomaly.find({ period }).select("employee anomalyCount status severity").lean(),
            PayrollAdjustment.find({ period, status: "pending" }).select("employee amount type").lean(),
        ]);

        const anomMap = new Map();
        for (const a of anomalies) anomMap.set(String(a.employee), a);

        const adjMap = new Map();
        for (const ad of adjustments) {
            const k = String(ad.employee);
            const cur = adjMap.get(k) || { count: 0, total: 0 };
            cur.count += 1;
            cur.total += Number(ad.amount || 0);
            adjMap.set(k, cur);
        }

        const rows = payslips.map((p) => {
            const k = String(p.employee);
            const an = anomMap.get(k) || null;
            const ad = adjMap.get(k) || { count: 0, total: 0 };

            return {
                employeeId: k,
                employeeSnapshot: p.employeeSnapshot,
                totals: p.totals,
                status: p.status,
                processingStatus: p.processingStatus,
                payslipKind: p.payslipKind,
                adjustmentSequence: p.adjustmentSequence || 0,
                payrollRunId: p.payrollRunId || null,
                anomaly: an ? { anomalyCount: an.anomalyCount || 0, status: an.status, severity: an.severity } : null,
                pendingAdjustments: ad,
            };
        });

        res.json({ ok: true, period, count: rows.length, items: rows });
    } catch (e) {
        res.status(500).json({ message: "Failed to load employee-wise report", error: e.message });
    }
});

// Paycodes Report 
router.get("/paycodes", async (req, res) => {
    try {
        const status = String(req.query.status || "all").trim(); // all|active|archived

        const filter = {};
        if (status === "active") filter.archivedAt = null;
        if (status === "archived") filter.archivedAt = { $ne: null };

        const list = await Paycode.find(filter).sort({ type: 1, defaultPriority: 1, name: 1 }).lean();
        res.json({ ok: true, count: list.length, items: list });
    } catch (e) {
        res.status(500).json({ message: "Failed to load paycodes report", error: e.message });
    }
});

// Employee Setup Report 
router.get("/employee-setup", async (req, res) => {
    try {
        const status = String(req.query.status || "all").trim(); // all|active|terminated

        const filter = { role: "employee" };
        if (status === "active") filter.employmentStatus = "active";
        if (status === "terminated") filter.employmentStatus = "terminated";

        const list = await User.find(filter)
            .select("fullName email employeeId department isActive employmentType employmentStatus hireDate terminationDate rehireDate createdAt updatedAt")
            .sort({ fullName: 1 })
            .lean();

        res.json({ ok: true, count: list.length, items: list });
    } catch (e) {
        res.status(500).json({ message: "Failed to load employee setup report", error: e.message });
    }
});

// Payroll Run Report 
router.get("/payroll-runs", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const runs = await PayrollRun.find({ period })
            .sort({ createdAt: -1 })
            .populate("createdBy", "fullName email role")
            .lean();

        const payslips = await Payslip.find({ "payPeriod.period": period })
            .select("employee employeeSnapshot payPeriod totals status processingStatus payslipKind adjustmentSequence payrollRunId createdAt")
            .lean();

        const adjustments = await PayrollAdjustment.find({ period })
            .select("employee employeeSnapshot paycodeCode paycodeName type amount status createdBy createdAt")
            .populate("createdBy", "fullName email role")
            .lean();

        const employees = payslips.map((p) => ({
            employeeId: String(p.employee),
            employeeSnapshot: p.employeeSnapshot,
            payDate: p?.payPeriod?.payDate || null,
            totals: p.totals,
            status: p.status,
            processingStatus: p.processingStatus,
            payslipKind: p.payslipKind,
            adjustmentSequence: p.adjustmentSequence || 0,
            payrollRunId: p.payrollRunId || null,
            createdAt: p.createdAt,
        }));

        const runRows = runs.map((r) => ({
            _id: String(r._id),
            period: r.period,
            payDate: r.payDate,
            status: r.status,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
            counts: r.counts || {},
            error: r.error || "",
            createdAt: r.createdAt,
            trigger: r.createdBy ? { type: "manual", by: r.createdBy } : { type: "scheduler", by: null },
        }));

        res.json({
            ok: true,
            period,
            runs: runRows,
            employeesCount: employees.length,
            employees,
            adjustmentsCount: adjustments.length,
            adjustments,
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to load payroll run report", error: e.message });
    }
});

// Anomalies Report 
router.get("/anomalies", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const status = String(req.query.status || "all").trim(); // all|open|reviewed|dismissed
        const severity = String(req.query.severity || "").trim(); // low|medium|high

        const filter = { period };
        if (status !== "all" && ["open", "reviewed", "dismissed"].includes(status)) filter.status = status;
        if (severity && ["low", "medium", "high"].includes(severity)) filter.severity = severity;

        const list = await PayrollAnomaly.find(filter)
            .sort({ createdAt: -1 })
            .populate("reviewedBy", "fullName email role")
            .lean();

        res.json({ ok: true, period, count: list.length, items: list });
    } catch (e) {
        res.status(500).json({ message: "Failed to load anomalies report", error: e.message });
    }
});

// Access Rights Report 
router.get("/access-rights", async (req, res) => {
    try {
        const role = String(req.query.role || "all").trim(); // all|admin|payroll_manager
        const roles = ["admin", "payroll_manager"];

        const filter = { role: { $in: roles } };
        if (role !== "all" && roles.includes(role)) filter.role = role;

        const list = await User.find(filter)
            .select("fullName email role isActive department createdAt updatedAt")
            .sort({ role: 1, fullName: 1 })
            .lean();

        res.json({ ok: true, count: list.length, items: list });
    } catch (e) {
        res.status(500).json({ message: "Failed to load access rights report", error: e.message });
    }
});

// Email Report 
router.get("/emails", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const audience = String(req.query.audience || "all").trim(); // all|employee|admin_pm
        const status = String(req.query.status || "all").trim(); // all|sent|failed
        const eventType = String(req.query.eventType || "").trim();

        const filter = { period };
        if (audience !== "all" && ["employee", "admin_pm"].includes(audience)) filter.audience = audience;
        if (status !== "all" && ["sent", "failed"].includes(status)) filter.status = status;
        if (eventType) filter.eventType = eventType;

        const items = await EmailLog.find(filter).sort({ sentAt: -1 }).limit(2000).lean();

        const counts = {
            total: items.length,
            sent: 0,
            failed: 0,
            employee: 0,
            admin_pm: 0,
        };

        for (const it of items) {
            counts[it.status] = (counts[it.status] || 0) + 1;
            counts[it.audience] = (counts[it.audience] || 0) + 1;
        }

        res.json({ ok: true, period, count: items.length, counts, items });
    } catch (e) {
        res.status(500).json({ message: "Failed to load email report", error: e.message });
    }
});

export default router;
