import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/company.js";
import payslipRoutes from "./routes/payslips.js";
import leaveRoutes from "./routes/leave.js";
import overtimeRoutes from "./routes/overtime.js";
import progressionsRoutes from "./routes/progressions.js";
import supportRoutes from "./routes/supportRoutes.js";
import userRoutes from "./routes/users.js";
import auditRoutes from "./routes/audit.js";
import profileChangeRequestRoutes from "./routes/profileChangeRequests.js";
import paycodesRoutes from "./routes/paycodes.js";
import employeePaycodesRoutes from "./routes/employeePaycodes.js";
import pmRoutes from "./routes/pm.js";
import employeesRoutes from "./routes/employees.js";
import accessRightsRoutes from "./routes/accessRights.js";
import employeeDocumentsRoutes from "./routes/employeeDocuments.js";
import payrollAdjustmentsRoutes from "./routes/payrollAdjustments.js";
import payrollBankingRoutes from "./routes/payrollBanking.js";
import payrollAnomaliesRoutes from "./routes/payrollAnomalies.js";
import payrollScheduleRoutes from "./routes/payrollSchedule.js";
import payrollRunsRoutes from "./routes/payrollRuns.js";
import bankingExportRoutes from "./routes/bankingExport.js";
import impersonationRoutes from "./routes/impersonation.js";
import knowledgeRoutes from "./routes/knowledge.js";

import { startKnowledgeWorker } from "./services/knowledgeWorker.js";
import reportsRoutes from "./routes/reports.js";
import { runPayrollSystem } from "./services/payrollRunner.js";
import PayrollSchedule from "./models/PayrollSchedule.js";
import { startEmailRetryWorker } from "./services/emailRetryWorker.js";
import { authRequired } from "./middleware/auth.js";

mongoose.set("bufferCommands", false);

const app = express();

// middleware 
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map(s => s.trim()).filter(Boolean) : []),
];

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
    cors({
        origin: function (origin, cb) {
            if (!origin) return cb(null, true); // allow Postman / mobile / same-origin
            if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            return cb(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);

app.options(/.*/, cors());

app.use(express.json());

// static uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// routes 
app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/payslips", payslipRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/overtime", overtimeRoutes);
app.use("/api/progressions", progressionsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/profile-change-requests", profileChangeRequestRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/access-rights", accessRightsRoutes);
app.use("/api/employee-documents", employeeDocumentsRoutes);
app.use("/api/paycodes", paycodesRoutes);
app.use("/api/employee-paycodes", employeePaycodesRoutes);
app.use("/api/pm/adjustments", payrollAdjustmentsRoutes);
app.use("/api/pm/payroll-runs", payrollRunsRoutes);
app.use("/api/pm/scheduler", payrollScheduleRoutes);
app.use("/api/pm/banking", payrollBankingRoutes);
app.use("/api/pm/anomalies", payrollAnomaliesRoutes);
app.use("/api/impersonation", impersonationRoutes);
app.use("/api/knowledge", knowledgeRoutes);

app.use("/api/pm/reports", reportsRoutes);


// back-office namespace
app.use("/api/pm", pmRoutes);

//test routes
app.get("/api/me", authRequired, (req, res) => {
    res.json({ message: "You are authenticated", user: req.user });
});

app.get("/ping", (req, res) => {
    res.status(200).json({ ok: true, t: Date.now() });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "API running" });
});

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

// DB + server 
console.log("⏳ Attempting MongoDB connection...");

connectDB()
    .then(() => {

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
        // start knowledge worker only after MongoDB is connected
        startKnowledgeWorker({ intervalMs: 8000, maxPerTick: 1 });
        console.log("Knowledge worker enabled (every 8s)");

        // after DB connected:
        startEmailRetryWorker({ intervalMs: 60_000, batchSize: 10 });
        console.log("Email worker enabled");

        function isWeekend(d) {
            const day = d.getDay();
            return day === 0 || day === 6;
        }

        function yyyymm(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            return `${y}-${m}`;
        }

        function yyyymmddLocal(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${dd}`;
        }

        function isYYYYMM(v) {
            return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v).trim());
        }

        function isYYYYMMDD(v) {
            return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(v).trim());
        }

        function adjustToWorkday(payDate, holidays = []) {
            let d = new Date(payDate);
            while (isWeekend(d) || holidays.includes(yyyymmddLocal(d))) {
                d.setDate(d.getDate() - 1);
            }
            return d;
        }

        async function buildEligibleEmployeeIds(period) {
            // scheduler runs for all active employees,
            //avoid re-paying those already released (unless they have pending adjustments)
            const emps = await mongoose
                .model("User")
                .find({ role: "employee", isActive: true })
                .select("_id")
                .lean();

            const ids = emps.map((e) => String(e._id));

            const released = await mongoose
                .model("Payslip")
                .find({ "payPeriod.period": period, status: "released" })
                .select("employee")
                .lean();

            const releasedSet = new Set(released.map((p) => String(p.employee)));

            const pendingAdj = await mongoose
                .model("PayrollAdjustment")
                .find({ period, status: "pending" })
                .select("employee")
                .lean();

            const adjSet = new Set(pendingAdj.map((a) => String(a.employee)));

            // include unpaid OR has pending adjustments
            return ids.filter((id) => !releasedSet.has(id) || adjSet.has(id));
        }

        async function schedulerTick() {
            try {
                const sched = await PayrollSchedule.findOne().sort({ createdAt: -1 }).lean();
                if (!sched || !sched.enabled) return;

                const now = new Date();

                // Build run time (today at runHour:runMinute)
                const runTime = new Date(now);
                runTime.setHours(Number(sched.runHour || 9), Number(sched.runMinute || 0), 0, 0);

                const diff = Math.abs(now.getTime() - runTime.getTime());
                if (diff > 60 * 1000) return;

                //If overrideRunDate is set, run on that date instead of normal pay date rule
                const todayISO = yyyymmddLocal(now);

                const hasOverrideDate = isYYYYMMDD(sched.overrideRunDate);
                const hasOverridePeriod = isYYYYMM(sched.overridePeriod);

                // Normal monthly final pay date
                const basePayDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    Number(sched.dayOfMonth || 25),
                    12,
                    0,
                    0,
                    0
                );

                const normalFinalPayDate = sched.moveBackIfNonWorking
                    ? adjustToWorkday(basePayDate, sched.holidays || [])
                    : basePayDate;

                const normalPayISO = yyyymmddLocal(normalFinalPayDate);

                // Decide if we should run today
                const shouldRunToday = hasOverrideDate ? (todayISO === sched.overrideRunDate) : (todayISO === normalPayISO);
                if (!shouldRunToday) return;

                // Decide period + payDate to use
                const period = hasOverridePeriod ? sched.overridePeriod : yyyymm(basePayDate);
                const payDateToUse = hasOverrideDate ? new Date(`${sched.overrideRunDate}T12:00:00`) : normalFinalPayDate;

                // Build eligible employees and run
                const selectedEmployeeIds = await buildEligibleEmployeeIds(period);
                if (!selectedEmployeeIds.length) return;

                await runPayrollSystem({ period, payDate: payDateToUse, selectedEmployeeIds });

                // one-off override auto-clear after successful run
                if (hasOverrideDate || hasOverridePeriod) {
                    await PayrollSchedule.updateOne(
                        { _id: sched._id },
                        { $set: { overridePeriod: "", overrideRunDate: "" } }
                    );
                }
            } catch {
                
            }
        }

        setInterval(schedulerTick, 60 * 1000);
        console.log("Payroll scheduler tick enabled (every 60s)");

    })
    .catch((err) => {
        console.error("MongoDB connection failed:", err.message);
        process.exit(1);
    });

