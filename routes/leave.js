import express from "express";
import mongoose from "mongoose";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import LeaveRequest from "../models/LeaveRequest.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { sendAdminPmEmailLogged, sendEmailLogged } from "../utils/mailer.js";

const router = express.Router();

function normalizeType(t) {
    const x = String(t || "").toLowerCase();
    if (x.includes("sick")) return "Sick Leave";
    if (x.includes("annual")) return "Annual Leave";
    if (x.includes("wedding")) return "Wedding Leave";
    if (x.includes("unpaid")) return "Unpaid Leave";
    if (x.includes("work")) return "Work From Home";
    return t;
}

function daysInclusive(startDate, endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    const ms = e.getTime() - s.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(0, days);
}

function ensureDbReady() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Database not connected. Check MongoDB / MONGO_URI and restart backend.");
    }
}

async function writeLog({ req, subjectId, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: subjectId || req.user.userId,
            module: "leave",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

function fmtDate(d) {
    try {
        const x = new Date(d);
        return x.toISOString().slice(0, 10);
    } catch {
        return "";
    }
}

router.get("/ping", (req, res) => res.json({ ok: true, msg: "leave route alive" }));
router.get("/db-status", (req, res) => {
    const state = mongoose.connection.readyState;
    res.json({
        readyState: state,
        meaning: { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" },
    });
});

// EMPLOYEE 

// GET /api/leave/mine
router.get("/mine", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const list = await LeaveRequest.find({ employee: req.user.userId })
            .sort({ createdAt: -1 })
            .lean();

        res.json(
            list.map((r) => ({
                id: r._id,
                type: r.type,
                start: r.startDate,
                end: r.endDate,
                status: r.status,
                delegate: r.delegate || "",
                comments: r.comments || "",
                decisionNote: r.decisionNote || "",
                decidedByRole: r.decidedByRole || "",
                decidedAt: r.decidedAt,
                createdAt: r.createdAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load leave requests" });
    }
});

router.post("/", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const type = normalizeType(req.body.type);
        const { startDate, endDate, delegate = "", comments = "" } = req.body;

        if (!type || !startDate || !endDate) {
            return res.status(400).json({ message: "type, startDate, endDate are required" });
        }

        const doc = await LeaveRequest.create({
            employee: req.user.userId,
            type,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            status: "inprogress",
            delegate,
            comments,
        });

        await writeLog({
            req,
            subjectId: req.user.userId,
            action: "CREATE",
            entityId: doc._id,
            message: `Created leave request (${doc.type})`,
        });

        //  Email to all admin/pm 
        try {
            const employee = await User.findById(req.user.userId).select("fullName email employeeId").lean();
            const subject = `AutoPay: New leave request awaiting approval`;
            const text =
                `A new leave request was submitted.\n\n` +
                `Employee: ${employee?.fullName || "-"} (${employee?.email || "-"})\n` +
                `Employee ID: ${employee?.employeeId || "-"}\n` +
                `Type: ${doc.type}\n` +
                `From: ${fmtDate(doc.startDate)}\n` +
                `To: ${fmtDate(doc.endDate)}\n\n` +
                `AutoPay\n`;

            const r = await sendAdminPmEmailLogged({
                subject,
                text,
                eventType: "leave_new",
                templateKey: "leave_new",
                meta: { leaveId: String(doc._id), employeeId: String(req.user.userId), type: doc.type },
            });

            if (!r?.ok) console.log("⚠️ Leave email failed (admin/pm):", r?.error || "unknown");
        } catch (e) {
            console.log("⚠️ Leave email error (admin/pm):", e?.message || e);
        }

        return res.status(201).json({
            id: doc._id,
            type: doc.type,
            start: doc.startDate,
            end: doc.endDate,
            status: doc.status,
            delegate: doc.delegate || "",
            comments: doc.comments || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        console.log("POST /api/leave error:", e);
        return res.status(400).json({ message: e.message || "Failed to create request" });
    }
});

// PUT /api/leave/:id  (only owner + only inprogress)
router.put("/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { id } = req.params;
        const doc = await LeaveRequest.findOne({ _id: id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Request not found" });

        if (doc.status !== "inprogress") {
            return res.status(400).json({ message: "Only in-progress requests can be edited" });
        }

        const before = {
            type: doc.type,
            startDate: doc.startDate,
            endDate: doc.endDate,
            delegate: doc.delegate,
            comments: doc.comments,
        };

        if (req.body.type) doc.type = normalizeType(req.body.type);
        if (req.body.startDate) doc.startDate = new Date(req.body.startDate);
        if (req.body.endDate) doc.endDate = new Date(req.body.endDate);
        if (req.body.delegate !== undefined) doc.delegate = req.body.delegate;
        if (req.body.comments !== undefined) doc.comments = req.body.comments;

        await doc.save();

        await writeLog({
            req,
            subjectId: req.user.userId,
            action: "UPDATE",
            entityId: doc._id,
            message: `Updated leave request (${doc.type})`,
            meta: {
                before,
                after: { type: doc.type, startDate: doc.startDate, endDate: doc.endDate, delegate: doc.delegate, comments: doc.comments },
            },
        });

        return res.json({
            id: doc._id,
            type: doc.type,
            start: doc.startDate,
            end: doc.endDate,
            status: doc.status,
            delegate: doc.delegate || "",
            comments: doc.comments || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        return res.status(400).json({ message: e.message || "Failed to update request" });
    }
});

// DELETE /api/leave/:id (only owner + only inprogress)
router.delete("/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { id } = req.params;
        const doc = await LeaveRequest.findOne({ _id: id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Request not found" });

        if (doc.status !== "inprogress") {
            return res.status(400).json({ message: "Only in-progress requests can be deleted" });
        }

        await LeaveRequest.deleteOne({ _id: id });

        await writeLog({
            req,
            subjectId: req.user.userId,
            action: "DELETE",
            entityId: id,
            message: `Deleted leave request (${doc.type})`,
        });

        return res.json({ ok: true });
    } catch (e) {
        return res.status(400).json({ message: e.message || "Failed to delete request" });
    }
});

// GET /api/leave/balance (accepted only deduction)
router.get("/balance", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const totals = { annualTotal: 18, sickTotal: 10, weddingTotal: 5 };

        const accepted = await LeaveRequest.find({
            employee: req.user.userId,
            status: "accepted",
        }).lean();

        let annualUsed = 0;
        let sickUsed = 0;
        let weddingUsed = 0;

        for (const r of accepted) {
            const days = daysInclusive(r.startDate, r.endDate);
            if (r.type === "Annual Leave") annualUsed += days;
            if (r.type === "Sick Leave") sickUsed += days;
            if (r.type === "Wedding Leave") weddingUsed += days;
        }

        return res.json({
            ...totals,
            annualUsed,
            sickUsed,
            weddingUsed,
            annualRemaining: Math.max(0, totals.annualTotal - annualUsed),
            sickRemaining: Math.max(0, totals.sickTotal - sickUsed),
            weddingRemaining: Math.max(0, totals.weddingTotal - weddingUsed),
        });
    } catch (e) {
        return res.status(500).json({ message: e.message || "Failed to load balance" });
    }
});

// BACK OFFICE 

// GET /api/leave/approvals?status=inprogress|accepted|rejected|cancelled|all
router.get("/approvals", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const status = String(req.query.status || "inprogress").trim();
        const filter = {};
        if (status && status !== "all") filter.status = status;

        const list = await LeaveRequest.find(filter)
            .populate("employee", "name username email employeeId employeeNumber fullName")
            .sort({ createdAt: -1 })
            .lean();

        const mapped = list.map((r) => ({
            id: r._id,
            type: r.type,
            start: r.startDate,
            end: r.endDate,
            status: r.status,
            delegate: r.delegate || "",
            comments: r.comments || "",
            decisionNote: r.decisionNote || "",
            decidedByRole: r.decidedByRole || "",
            decidedAt: r.decidedAt,
            createdAt: r.createdAt,

            employee: r.employee
                ? {
                    id: r.employee._id,
                    name: r.employee.fullName || r.employee.name || r.employee.username || "Employee",
                    email: r.employee.email || "",
                    employeeNumber: String(r.employee.employeeNumber || r.employee.employeeId || "").trim(),
                }
                : null,
        }));

        res.json(mapped);
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load approvals" });
    }
});

// GET /api/leave/delegate-availability?employeeId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/delegate-availability", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const employeeId = String(req.query.employeeId || "").trim();
        const startDate = String(req.query.startDate || "").trim();
        const endDate = String(req.query.endDate || "").trim();

        if (!employeeId || !startDate || !endDate) {
            return res.status(400).json({ message: "employeeId, startDate, endDate are required" });
        }

        const s = new Date(startDate);
        const e = new Date(endDate);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
            return res.status(400).json({ message: "Invalid startDate/endDate" });
        }

        // overlap: existing.start <= selected.end AND existing.end >= selected.start
        const conflict = await LeaveRequest.findOne({
            employee: employeeId,
            status: { $in: ["inprogress", "accepted"] },
            startDate: { $lte: e },
            endDate: { $gte: s },
        })
            .select("_id type startDate endDate status")
            .lean();

        return res.json({
            ok: true,
            available: !conflict,
            conflict: conflict
                ? {
                    id: conflict._id,
                    type: conflict.type,
                    start: conflict.startDate,
                    end: conflict.endDate,
                    status: conflict.status,
                }
                : null,
        });
    } catch (e) {
        return res.status(500).json({ message: e.message || "Failed to check availability" });
    }
});


// PATCH /api/leave/:id/decision  body: { status: "accepted"|"rejected", note?: "" }
router.patch("/:id/decision", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const { id } = req.params;
        const status = String(req.body.status || "").trim();
        const note = String(req.body.note || "").trim();

        if (!["accepted", "rejected"].includes(status)) {
            return res.status(400).json({ message: "status must be accepted or rejected" });
        }

        const doc = await LeaveRequest.findById(id);
        if (!doc) return res.status(404).json({ message: "Request not found" });

        if (doc.status !== "inprogress") {
            return res.status(400).json({ message: "Only in-progress requests can be decided" });
        }

        doc.status = status;
        doc.decisionNote = note;
        doc.decidedBy = req.user.userId;
        doc.decidedByRole = req.user.role;
        doc.decidedAt = new Date();

        await doc.save();

        // Email delegate (if selected) when approved
        if (status === "accepted") {
            try {
                const delegateId = String(doc.delegate || "").trim();

                // delegateId is expected to be a User _id (string)
                if (delegateId) {
                    const [employee, delegateUser] = await Promise.all([
                        User.findById(doc.employee).select("fullName email").lean(),
                        User.findById(delegateId).select("fullName email").lean(),
                    ]);

                    if (delegateUser?.email) {
                        const subject = `AutoPay: You have been assigned as a delegate`;
                        const text =
                            `Hi ${delegateUser.fullName || ""}\n\n` +
                            `You have been assigned as delegate for ${employee?.fullName || "an employee"}.\n\n` +
                            `Type: ${doc.type}\n` +
                            `From: ${fmtDate(doc.startDate)}\n` +
                            `To: ${fmtDate(doc.endDate)}\n\n` +
                            `AutoPay\n`;

                        await sendEmailLogged({
                            audience: "employee",
                            to: delegateUser.email,
                            toUserId: delegateId,
                            eventType: "leave_delegate_assigned",
                            templateKey: "leave_delegate_assigned",
                            subject,
                            text,
                            meta: {
                                leaveId: String(doc._id),
                                employeeId: String(doc.employee),
                                delegateId,
                                type: doc.type,
                            },
                        });
                    }
                }
            } catch (e) {
                console.log("⚠️ Leave delegate email failed:", e?.message || e);
            }
        }


        await writeLog({
            req,
            subjectId: doc.employee,
            action: status === "accepted" ? "APPROVE" : "REJECT",
            entityId: doc._id,
            message: `${status === "accepted" ? "Approved" : "Rejected"} leave request (${doc.type})`,
            meta: { note },
        });

        // Email employee decision
        try {
            const employee = await User.findById(doc.employee).select("fullName email").lean();
            if (employee?.email) {
                const subject = `AutoPay: Leave request ${status}`;
                const text =
                    `Your leave request has been ${status}.\n\n` +
                    `Type: ${doc.type}\n` +
                    `From: ${fmtDate(doc.startDate)}\n` +
                    `To: ${fmtDate(doc.endDate)}\n` +
                    (note ? `Note: ${note}\n\n` : "\n") +
                    `AutoPay\n`;

                await sendEmailLogged({
                    audience: "employee",
                    to: employee.email,
                    toUserId: doc.employee,
                    eventType: "leave_decision",
                    templateKey: "leave_decision",
                    subject,
                    text,
                    meta: { leaveId: String(doc._id), decision: status, type: doc.type },
                });
            }
        } catch (e) {
            console.log("⚠️ Leave decision email failed:", e?.message || e);
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to update decision" });
    }
});

export default router;
