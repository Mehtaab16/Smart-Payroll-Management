// routes/payrollRuns.js 
import express from "express";
import PayrollAdjustment from "../models/PayrollAdjustment.js";
import Payslip from "../models/Payslip.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import { runPayrollSystem } from "../services/payrollRunner.js";
import PayrollAnomaly from "../models/PayrollAnomaly.js";
import User from "../models/User.js";

const router = express.Router();

function isYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

async function writeLog({ req, action, message, meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user?.userId || null,
            actorRole: req.user?.role || "system",
            subjectId: null,
            module: "payroll_run",
            action,
            entityId: "",
            message,
            meta,
        });
    } catch { }
}

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

// Preview (POST) 
router.post("/preview", async (req, res) => {
    try {
        const { period } = req.body || {};
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const pendingAdjustments = await PayrollAdjustment.find({ period, status: "pending" }).lean();
        const byEmp = {};
        for (const a of pendingAdjustments) {
            const k = String(a.employee);
            byEmp[k] = byEmp[k] || [];
            byEmp[k].push(a);
        }

        res.json({
            period,
            pendingAdjustmentsCount: pendingAdjustments.length,
            employeesWithPendingAdjustments: Object.keys(byEmp).length,
            sample: pendingAdjustments.slice(0, 30),
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to preview payroll", error: e.message });
    }
});

// Preview (GET) 
router.get("/preview", async (req, res) => {
    try {
        const { period } = req.query;
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const adjustments = await PayrollAdjustment.find({ period, status: "pending" }).lean();
        const releasedCount = await Payslip.countDocuments({ "payPeriod.period": period, status: "released" });
        const totalAdj = adjustments.reduce((acc, a) => acc + Number(a.amount || 0), 0);

        const openHigh = await PayrollAnomaly.countDocuments({ period, status: "open", severity: "high" });

        res.json({
            period,
            pendingAdjustmentsCount: adjustments.length,
            pendingAdjustmentsTotal: totalAdj,
            releasedPayslipsCount: releasedCount,
            openHighAnomaliesCount: openHigh,
            sampleAdjustments: adjustments.slice(0, 10),
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to preview run", error: e.message });
    }
});

// Run List (GET) 
// Returns employees relevant for this period:
// unpaid employees (no released payslip for period)
// employees with pending adjustments 
router.get("/run-list", async (req, res) => {
    try {
        const { period } = req.query;
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const emps = await User.find({ role: "employee", isActive: true })
            .select("_id fullName email employeeId")
            .lean();

        const released = await Payslip.find({ "payPeriod.period": period, status: "released" })
            .select("employee")
            .lean();

        const releasedSet = new Set(released.map((p) => String(p.employee)));

        const pendingAdj = await PayrollAdjustment.find({ period, status: "pending" })
            .select("employee")
            .lean();

        const adjSet = new Set(pendingAdj.map((a) => String(a.employee)));

        const items = emps
            .map((e) => {
                const id = String(e._id);
                const alreadyReleased = releasedSet.has(id);
                const hasPendingAdjustments = adjSet.has(id);
                // include if unpaid OR has pending adjustments
                if (alreadyReleased && !hasPendingAdjustments) return null;

                return {
                    employeeId: id,
                    fullName: e.fullName || "",
                    email: e.email || "",
                    employeeCode: e.employeeId || "",
                    alreadyReleased,
                    hasPendingAdjustments,
                };
            })
            .filter(Boolean);

        res.json({ ok: true, period, items });
    } catch (e) {
        res.status(500).json({ message: "Failed to build run list", error: e.message });
    }
});

// Run (POST) 

router.post("/run", async (req, res) => {
    try {
        const { period, payDate, selectedEmployeeIds } = req.body || {};
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const payDateObj = payDate ? new Date(payDate) : new Date();
        if (Number.isNaN(payDateObj.getTime())) return res.status(400).json({ message: "Invalid payDate" });

        let ids = Array.isArray(selectedEmployeeIds) ? selectedEmployeeIds.filter(Boolean) : [];
        if (!ids.length) {
            return res.status(400).json({ message: "selectedEmployeeIds is required (frontend must send selection)" });
        }

        const result = await runPayrollSystem({
            period,
            payDate: payDateObj,
            selectedEmployeeIds: ids,
        });

        await writeLog({
            req,
            action: "RUN",
            message: `Payroll run executed for ${period}`,
            meta: { period, selectedCount: ids.length, ...result },
        });

        return res.json({
            ok: true,
            period,
            runId: result.runId,
            payslipsProcessed: result.processed ?? result.created ?? 0,
            payslipsReleased: result.released ?? 0,
            payslipsBlocked: result.blocked ?? 0,
            anomaliesFound: result.anomalies ?? 0,
            emailedCount: result.emailed ?? 0,
            anomalyAlertsSent: result.anomalyAlerts ?? 0,
            failed: result.failed ?? 0,
            selectedCount: ids.length,
        });
    } catch (e) {
        console.error("PAYROLL RUN ERROR:", e);
        return res.status(500).json({ message: "Failed to run payroll", error: e.message });
    }

});


export default router;
