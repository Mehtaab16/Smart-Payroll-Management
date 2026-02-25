import express from "express";
import mongoose from "mongoose";
import { authRequired } from "../middleware/auth.js";
import OvertimeRequest from "../models/OvertimeRequest.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { sendAdminPmEmailLogged, sendEmailLogged } from "../utils/mailer.js";

const router = express.Router();

function ensureDbReady() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Database not connected. Check MongoDB / MONGO_URI and restart backend.");
    }
}

function isValidTimeHHMM(t) {
    if (!t) return true;
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(t));
}

function calcHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    if (!isValidTimeHHMM(startTime) || !isValidTimeHHMM(endTime)) return 0;

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const diff = end - start;
    if (diff <= 0) return 0;

    return Math.round((diff / 60) * 100) / 100;
}

function startEndFromMonth(month) {
    if (!month) return null;
    const [y, m] = String(month).split("-").map(Number);
    if (!y || !m) return null;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    return { start, end };
}

function ymd(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// avoid timezone issues 
function dateAtMidday(ymdStr) {
    return new Date(`${ymdStr}T12:00:00`);
}

async function writeLog({ req, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "overtime",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

//Health checks 
router.get("/ping", (req, res) => res.json({ ok: true, msg: "overtime route alive" }));

router.get("/db-status", (req, res) => {
    const state = mongoose.connection.readyState;
    res.json({
        readyState: state,
        meaning: { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" },
    });
});

// GET /api/overtime/mine?month=YYYY-MM 
router.get("/mine", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const range = startEndFromMonth(req.query.month);
        const q = { employee: req.user.userId };

        if (range) q.date = { $gte: range.start, $lt: range.end };

        const list = await OvertimeRequest.find(q).sort({ date: -1, createdAt: -1 }).lean();

        res.json(
            list.map((r) => ({
                id: r._id,
                date: ymd(new Date(r.date)),
                startTime: r.startTime || "",
                endTime: r.endTime || "",
                hours: r.hours,
                reason: r.reason,
                status: r.status,
                managerNote: r.managerNote || "",
                createdAt: r.createdAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load overtime requests" });
    }
});

// GET /api/overtime/summary?month=YYYY-MM
router.get("/summary", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const range = startEndFromMonth(req.query.month);
        const q = { employee: req.user.userId };
        if (range) q.date = { $gte: range.start, $lt: range.end };

        const list = await OvertimeRequest.find(q).select("hours status").lean();

        const totalHours = Math.round(list.reduce((a, r) => a + (Number(r.hours) || 0), 0) * 100) / 100;
        const pendingCount = list.filter((r) => (r.status || "inprogress") === "inprogress").length;

        res.json({ totalHours, pendingCount });
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load summary" });
    }
});

// POST /api/overtime 
router.post("/", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { date, startTime = "", endTime = "", hours, reason = "" } = req.body;

        if (!date) return res.status(400).json({ message: "date is required" });
        if (!String(reason).trim()) return res.status(400).json({ message: "reason is required" });

        if (!isValidTimeHHMM(startTime) || !isValidTimeHHMM(endTime)) {
            return res.status(400).json({ message: "Invalid time format. Use HH:MM" });
        }

        const computed = calcHours(startTime, endTime);
        const finalHours = Number(hours) > 0 ? Number(hours) : computed;

        if (!finalHours || finalHours <= 0) {
            return res.status(400).json({ message: "hours must be > 0 (enter hours or valid start/end time)" });
        }

        const doc = await OvertimeRequest.create({
            employee: req.user.userId,
            date: dateAtMidday(date),
            startTime,
            endTime,
            hours: finalHours,
            reason: String(reason).trim(),
            status: "inprogress",
        });

        await writeLog({
            req,
            action: "CREATE",
            entityId: doc._id,
            message: `Created overtime (${ymd(new Date(doc.date))}, ${doc.hours}h)`,
        });

        // Email admin/pm: new overtime awaiting approval
        try {
            const employee = await User.findById(req.user.userId).select("fullName email employeeId").lean();
            const subject = `AutoPay: New overtime request awaiting approval`;
            const text =
                `A new overtime request was submitted.\n\n` +
                `Employee: ${employee?.fullName || "-"} (${employee?.email || "-"})\n` +
                `Employee ID: ${employee?.employeeId || "-"}\n` +
                `Date: ${ymd(new Date(doc.date))}\n` +
                `Hours: ${doc.hours}\n` +
                `Reason: ${doc.reason}\n\n` +
                `AutoPay\n`;

            const r = await sendAdminPmEmailLogged({
                subject,
                text,
                eventType: "overtime_new",
                templateKey: "overtime_new",
                meta: { overtimeId: String(doc._id), employeeId: String(req.user.userId), hours: doc.hours },
            });

            if (!r?.ok) console.log("⚠️ Overtime email failed (admin/pm):", r?.error || "unknown");
        } catch (e) {
            console.log("⚠️ Overtime email error (admin/pm):", e?.message || e);
        }

        return res.status(201).json({
            id: doc._id,
            date: ymd(new Date(doc.date)),
            startTime: doc.startTime || "",
            endTime: doc.endTime || "",
            hours: doc.hours,
            reason: doc.reason,
            status: doc.status,
            managerNote: doc.managerNote || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        console.log("POST /api/overtime error:", e);
        return res.status(400).json({ message: e.message || "Failed to create overtime request" });
    }
});

// PUT /api/overtime/:id (only owner + only inprogress)
router.put("/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { id } = req.params;
        const doc = await OvertimeRequest.findOne({ _id: id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Overtime request not found" });

        if (doc.status !== "inprogress") {
            return res.status(400).json({ message: "Only in-progress overtime can be edited" });
        }

        const before = {
            date: doc.date,
            startTime: doc.startTime,
            endTime: doc.endTime,
            hours: doc.hours,
            reason: doc.reason,
        };

        const { date, startTime, endTime, hours, reason } = req.body;

        if (date) doc.date = dateAtMidday(date);

        if (startTime !== undefined) {
            if (!isValidTimeHHMM(startTime)) return res.status(400).json({ message: "Invalid startTime (HH:MM)" });
            doc.startTime = startTime;
        }

        if (endTime !== undefined) {
            if (!isValidTimeHHMM(endTime)) return res.status(400).json({ message: "Invalid endTime (HH:MM)" });
            doc.endTime = endTime;
        }

        if (reason !== undefined) {
            if (!String(reason).trim()) return res.status(400).json({ message: "reason is required" });
            doc.reason = String(reason).trim();
        }

        if (hours !== undefined) {
            doc.hours = Number(hours);
        } else {
            const computed = calcHours(doc.startTime, doc.endTime);
            if (computed > 0) doc.hours = computed;
        }

        if (!doc.hours || doc.hours <= 0) {
            return res.status(400).json({ message: "hours must be > 0" });
        }

        await doc.save();

        await writeLog({
            req,
            action: "UPDATE",
            entityId: doc._id,
            message: `Updated overtime (${ymd(new Date(doc.date))}, ${doc.hours}h)`,
            meta: {
                before,
                after: { date: doc.date, startTime: doc.startTime, endTime: doc.endTime, hours: doc.hours, reason: doc.reason },
            },
        });

        return res.json({
            id: doc._id,
            date: ymd(new Date(doc.date)),
            startTime: doc.startTime || "",
            endTime: doc.endTime || "",
            hours: doc.hours,
            reason: doc.reason,
            status: doc.status,
            managerNote: doc.managerNote || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        return res.status(400).json({ message: e.message || "Failed to update overtime request" });
    }
});

// DELETE /api/overtime/:id (only owner + only inprogress) 
router.delete("/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { id } = req.params;
        const doc = await OvertimeRequest.findOne({ _id: id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Overtime request not found" });

        if (doc.status !== "inprogress") {
            return res.status(400).json({ message: "Only in-progress overtime can be deleted" });
        }

        await OvertimeRequest.deleteOne({ _id: id });

        await writeLog({
            req,
            action: "DELETE",
            entityId: id,
            message: `Deleted overtime (${ymd(new Date(doc.date))}, ${doc.hours}h)`,
        });

        return res.json({ ok: true });
    } catch (e) {
        return res.status(400).json({ message: e.message || "Failed to delete overtime request" });
    }
});

// GET /api/overtime/approvals?status=...&month=YYYY-MM 
router.get("/approvals", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const role = req.user.role;
        if (!["payroll_manager", "admin"].includes(role)) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const status = String(req.query.status || "inprogress");
        const month = req.query.month;
        const range = startEndFromMonth(month);

        const q = {};
        if (status && status !== "all") q.status = status;
        if (range) q.date = { $gte: range.start, $lt: range.end };

        const list = await OvertimeRequest.find(q)
            .populate("employee", "fullName name email employeeNumber employeeId")
            .sort({ date: -1, createdAt: -1 })
            .lean();

        res.json(
            list.map((r) => ({
                id: r._id,
                employee: {
                    name: r.employee?.fullName || r.employee?.name || "Employee",
                    email: r.employee?.email || "",
                    employeeNumber: r.employee?.employeeNumber || r.employee?.employeeId || "",
                },
                date: ymd(new Date(r.date)),
                startTime: r.startTime || "",
                endTime: r.endTime || "",
                hours: r.hours,
                reason: r.reason,
                status: r.status,
                managerNote: r.managerNote || "",
                createdAt: r.createdAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load overtime approvals" });
    }
});

// PUT /api/overtime/approvals/:id 
router.put("/approvals/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const role = req.user.role;
        if (!["payroll_manager", "admin"].includes(role)) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const { id } = req.params;
        const { status, managerNote = "" } = req.body;

        if (!["accepted", "rejected"].includes(status)) {
            return res.status(400).json({ message: "status must be accepted or rejected" });
        }

        const doc = await OvertimeRequest.findById(id).populate("employee", "fullName name email employeeNumber employeeId");
        if (!doc) return res.status(404).json({ message: "Overtime request not found" });

        if (doc.status !== "inprogress") {
            return res.status(400).json({ message: "Only in-progress overtime can be decided" });
        }

        const before = { status: doc.status, managerNote: doc.managerNote || "" };

        doc.status = status;
        doc.managerNote = String(managerNote || "").trim();
        await doc.save();

        await writeLog({
            req,
            action: "DECIDE",
            entityId: doc._id,
            message: `${status === "accepted" ? "Accepted" : "Rejected"} overtime (${ymd(new Date(doc.date))}, ${doc.hours}h)`,
            meta: { before, after: { status: doc.status, managerNote: doc.managerNote } },
        });

        // Email employee decision
        try {
            const empEmail = String(doc.employee?.email || "").trim();
            const empName = doc.employee?.fullName || doc.employee?.name || "Employee";
            if (empEmail) {
                const subject = `AutoPay: Overtime request ${status}`;
                const text =
                    `Your overtime request has been ${status}.\n\n` +
                    `Date: ${ymd(new Date(doc.date))}\n` +
                    `Hours: ${doc.hours}\n` +
                    (doc.managerNote ? `Manager note: ${doc.managerNote}\n\n` : "\n") +
                    `AutoPay\n`;

                await sendEmailLogged({
                    audience: "employee",
                    to: empEmail,
                    toUserId: doc.employee?._id || null,
                    eventType: "overtime_decision",
                    templateKey: "overtime_decision",
                    subject,
                    text,
                    meta: { overtimeId: String(doc._id), decision: status, employeeName: empName },
                });
            }
        } catch (e) {
            console.log("⚠️ Overtime decision email failed (employee):", e?.message || e);
        }

        return res.json({
            id: doc._id,
            employee: {
                name: doc.employee?.fullName || doc.employee?.name || "Employee",
                email: doc.employee?.email || "",
                employeeNumber: doc.employee?.employeeNumber || doc.employee?.employeeId || "",
            },
            date: ymd(new Date(doc.date)),
            startTime: doc.startTime || "",
            endTime: doc.endTime || "",
            hours: doc.hours,
            reason: doc.reason,
            status: doc.status,
            managerNote: doc.managerNote || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        return res.status(400).json({ message: e.message || "Failed to decide overtime request" });
    }
});

export default router;
