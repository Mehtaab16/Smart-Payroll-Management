// routes/payrollAnomalies.js
import express from "express";
import PayrollAnomaly from "../models/PayrollAnomaly.js";
import Payslip from "../models/Payslip.js";
import User from "../models/User.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import { sendPayslipReleasedEmail } from "../utils/mailer.js";

const router = express.Router();

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

router.get("/", async (req, res) => {
    try {
        const { period = "", status = "", severity = "" } = req.query;

        const filter = {};
        if (period) filter.period = period;
        if (["open", "reviewed", "dismissed"].includes(status)) filter.status = status;
        if (["low", "medium", "high"].includes(severity)) filter.severity = severity;

        const list = await PayrollAnomaly.find(filter).sort({ createdAt: -1 }).limit(500).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load anomalies", error: e.message });
    }
});

router.get("/", async (req, res) => {
    try {
        const { period = "", status = "", severity = "" } = req.query;

        const filter = {};
        if (period) filter.period = period;
        if (["open", "reviewed", "dismissed"].includes(status)) filter.status = status;
        if (["low", "medium", "high"].includes(severity)) filter.severity = severity;

        const list = await PayrollAnomaly.find(filter).sort({ createdAt: -1 }).limit(500).lean();

        const out = list.map((a) => {
            const items = Array.isArray(a.items) && a.items.length
                ? a.items
                : [{
                    severity: a.severity || "medium",
                    type: a.type || "ANOMALY",
                    message: a.message || "Potential issue detected",
                    meta: a.meta || {},
                }];

            const payslipId = a.payslipId || a?.meta?.payslipId || null;

            return {
                ...a,
                payslipId,
                anomalyCount: Number(a.anomalyCount || items.length || 0),
                items,
            };
        });

        res.json(out);
    } catch (e) {
        res.status(500).json({ message: "Failed to load anomalies", error: e.message });
    }
});


// POST /:id/resolve { decision }
router.post("/:id/resolve", async (req, res) => {
    try {
        const { decision } = req.body || {};
        if (!["approve", "dismiss", "override"].includes(decision)) {
            return res.status(400).json({ message: "decision must be approve|dismiss|override" });
        }

        const doc = await PayrollAnomaly.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Anomaly not found" });

        if (decision === "dismiss") doc.status = "dismissed";
        else doc.status = "reviewed";

        doc.reviewedBy = req.user.userId;
        doc.reviewedAt = new Date();
        doc.decision = decision;
        await doc.save();

        // Approve = release blocked payslip + email employee
        if (decision === "approve") {
            const payslipId = doc.payslipId || doc?.meta?.payslipId;
            if (!payslipId) return res.json({ ok: true, note: "Approved anomaly, but payslipId missing." });

            const slip = await Payslip.findById(payslipId);
            if (!slip) return res.json({ ok: true, note: "Approved anomaly, but payslip not found." });

            if (slip.status !== "released") {
                slip.status = "released";
                await slip.save();
            }

            const emp = await User.findById(slip.employee).lean();
            const to = emp?.email || slip.employeeSnapshot?.email;
            const fullName = emp?.fullName || slip.employeeSnapshot?.fullName || "";

            // email subject/body becomes "Adjustment payslip released" ONLY when slip.payslipKind === "adjustment"
            if (to) {
                await sendPayslipReleasedEmail({
                    to,
                    fullName,
                    period: slip.payPeriod?.period || doc.period,
                    payslipId: slip._id,
                    kind: slip.payslipKind || "regular",
                });
            }

            // If old duplicates exist from before merge, auto-review them too
            await PayrollAnomaly.updateMany(
                {
                    _id: { $ne: doc._id },
                    period: doc.period,
                    employee: doc.employee,
                    $or: [{ payslipId }, { "meta.payslipId": payslipId }],
                    status: "open",
                },
                { $set: { status: "reviewed", reviewedBy: req.user.userId, reviewedAt: new Date(), decision: "approve" } }
            );
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: "Failed to resolve anomaly", error: e.message });
    }
});

export default router;
