import express from "express";
import Payslip from "../models/Payslip.js";
import User from "../models/User.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";

const router = express.Router();

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

// GET /api/pm/banking-export?period=YYYY-MM
router.get("/", async (req, res) => {
    try {
        const period = String(req.query.period || "").trim();
        if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ message: "period must be YYYY-MM" });

        const payslips = await Payslip.find({ "payPeriod.period": period }).lean();

        const rows = [];
        for (const p of payslips) {
            const emp = await User.findById(p.employee).lean();
            const net = Number(p?.totals?.netPay || 0);

            rows.push({
                employeeId: emp?.employeeId || "",
                name: emp?.fullName || p?.employeeSnapshot?.fullName || "",
                email: emp?.email || p?.employeeSnapshot?.email || "",
                bankName: emp?.bankName || "",
                bankAccountNumber: emp?.bankAccountNumber || "",
                amount: net,
            });
        }

        // basic CSV
        const header = "employeeId,name,email,bankName,bankAccountNumber,amount";
        const lines = rows.map((r) =>
            [r.employeeId, r.name, r.email, r.bankName, r.bankAccountNumber, r.amount]
                .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
                .join(",")
        );

        const csv = [header, ...lines].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="banking-export-${period}.csv"`);
        res.send(csv);
    } catch (e) {
        res.status(500).json({ message: "Failed to export banking CSV", error: e.message });
    }
});

export default router;
