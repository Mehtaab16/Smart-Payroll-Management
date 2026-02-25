import express from "express";
import Payslip from "../models/Payslip.js";
import User from "../models/User.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";

const router = express.Router();

function isYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

/**
 * GET /api/pm/banking/export?period=YYYY-MM
 * returns CSV text
 */
router.get("/export", async (req, res) => {
    try {
        const { period } = req.query;
        if (!isYYYYMM(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const slips = await Payslip.find({
            "payPeriod.period": period,
            processingStatus: "completed",
        }).lean();

        // map employee bank details
        const empIds = slips.map((s) => String(s.employee));
        const emps = await User.find({ _id: { $in: empIds } }).select("bankDetails fullName email employeeId").lean();
        const byId = new Map(emps.map((e) => [String(e._id), e]));

        const rows = [];
        rows.push([
            "employeeId",
            "fullName",
            "email",
            "bankName",
            "accountName",
            "accountNumber",
            "sortCode",
            "iban",
            "netPay",
            "period",
        ].join(","));

        for (const s of slips) {
            const emp = byId.get(String(s.employee));
            const bd = emp?.bankDetails || {};
            const net = Number(s?.totals?.netPay || 0);

            rows.push(
                [
                    JSON.stringify(emp?.employeeId || ""),
                    JSON.stringify(emp?.fullName || ""),
                    JSON.stringify(emp?.email || ""),
                    JSON.stringify(bd.bankName || ""),
                    JSON.stringify(bd.accountName || ""),
                    JSON.stringify(bd.accountNumber || ""),
                    JSON.stringify(bd.sortCode || ""),
                    JSON.stringify(bd.iban || ""),
                    String(net),
                    JSON.stringify(period),
                ].join(",")
            );
        }

        const csv = rows.join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=banking-export-${period}.csv`);
        res.send(csv);
    } catch (e) {
        res.status(500).json({ message: "Failed to export banking CSV", error: e.message });
    }
});

export default router;
