// routes/profileChangeRequests.js
import express from "express";
import mongoose from "mongoose";
import ProfileChangeRequest from "../models/ProfileChangeRequest.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import User from "../models/User.js";
import { sendAdminPmEmailLogged, sendEmailLogged } from "../utils/mailer.js";

const router = express.Router();

function pick(obj, keys) {
    const out = {};
    for (const k of keys) {
        if (obj?.[k] !== undefined) out[k] = obj[k];
    }
    return out;
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
            module: "profile",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

// EMPLOYEE 

// POST /api/profile-change-requests
router.post("/", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { category } = req.body;

        if (!["personal", "bank"].includes(category)) {
            return res.status(400).json({ message: "Invalid category (personal|bank)." });
        }

        const employeeId = req.user.userId;

        const allowedPersonal = ["fullName", "department", "email"];
        const allowedBank = ["bankName", "accountName", "accountNumber", "sortCode", "iban"];

        let payload = {};

        if (category === "personal") {
            payload = pick(req.body, allowedPersonal);
        } else {
            const src = req.body.bankDetails ? req.body.bankDetails : req.body;
            payload = pick(src, allowedBank);
        }

        if (!Object.keys(payload).length) {
            return res.status(400).json({ message: "No changes provided." });
        }

        delete payload.role;
        delete payload.employeeId;

        const note = String(req.body.note || "").trim();

        const r = await ProfileChangeRequest.create({
            employeeId,
            category,
            payload,
            note,
            status: "pending",
        });

        await writeLog({
            req,
            subjectId: employeeId,
            action: "REQUEST_CHANGE",
            entityId: String(r._id),
            message: `Requested ${category} changes`,
            meta: { category },
        });

        // Email admin/pm: new profile change request awaiting approval
        try {
            const employee = await User.findById(employeeId).select("fullName email employeeId department").lean();
            const subject = `AutoPay: New profile change request awaiting approval`;
            const text =
                `A new profile change request was submitted.\n\n` +
                `Employee: ${employee?.fullName || "-"} (${employee?.email || "-"})\n` +
                `Employee ID: ${employee?.employeeId || "-"}\n` +
                `Category: ${category}\n` +
                (note ? `Employee note: ${note}\n\n` : "\n") +
                `AutoPay\n`;

            await sendAdminPmEmailLogged({
                subject,
                text,
                eventType: "profile_change_new",
                templateKey: "profile_change_new",
                meta: { requestId: String(r._id), employeeId: String(employeeId), category },
            });
        } catch { }

        res.status(201).json(r);
    } catch (e) {
        res.status(400).json({ message: "Failed to create request", error: e.message });
    }
});

// GET /api/profile-change-requests/mine
router.get("/mine", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const list = await ProfileChangeRequest.find({ employeeId: req.user.userId })
            .sort({ createdAt: -1 })
            .lean();

        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load requests", error: e.message });
    }
});

// BACK OFFICE (PM/Admin) 

// GET /api/profile-change-requests?status=pending|approved|rejected
router.get("/", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        if (!["admin", "payroll_manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const { status = "" } = req.query;
        const filter = {};
        if (status && ["pending", "approved", "rejected"].includes(status)) filter.status = status;

        const list = await ProfileChangeRequest.find(filter).sort({ createdAt: -1 }).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load requests", error: e.message });
    }
});

// GET /api/profile-change-requests/approvals?status=pending|approved|rejected|all
router.get("/approvals", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const status = String(req.query.status || "pending").trim();
        const filter = {};
        if (status && status !== "all") filter.status = status;

        const list = await ProfileChangeRequest.find(filter)
            .populate("employeeId", "fullName name username email employeeId employeeNumber department bankDetails")
            .sort({ createdAt: -1 })
            .lean();

        const mapped = list.map((r) => ({
            id: r._id,
            category: r.category,
            payload: r.payload || {},
            note: r.note || "",
            status: r.status,
            reviewedBy: r.reviewedBy,
            reviewedAt: r.reviewedAt,
            reviewNote: r.reviewNote || "",
            createdAt: r.createdAt,

            employee: r.employeeId
                ? {
                    id: r.employeeId._id,
                    fullName: r.employeeId.fullName || r.employeeId.name || r.employeeId.username || "Employee",
                    email: r.employeeId.email || "",
                    employeeNumber: String(r.employeeId.employeeNumber || r.employeeId.employeeId || "").trim(),
                    department: r.employeeId.department || "",
                    bankDetails: r.employeeId.bankDetails || {},
                }
                : null,
        }));

        res.json(mapped);
    } catch (e) {
        res.status(500).json({ message: "Failed to load requests", error: e.message });
    }
});

// PATCH /api/profile-change-requests/:id/decision
router.patch("/:id/decision", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const { id } = req.params;
        const status = String(req.body.status || "").trim();
        const reviewNote = String(req.body.reviewNote || "").trim();

        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "status must be approved or rejected" });
        }

        const r = await ProfileChangeRequest.findById(id);
        if (!r) return res.status(404).json({ message: "Request not found" });

        if (r.status !== "pending") {
            return res.status(400).json({ message: "Only pending requests can be decided" });
        }

        if (status === "approved") {
            const employee = await User.findById(r.employeeId);
            if (!employee) return res.status(404).json({ message: "Employee not found" });

            if (r.category === "personal") {
                const allowed = ["fullName", "department", "email"];
                for (const k of allowed) {
                    if (r.payload?.[k] !== undefined) employee[k] = r.payload[k];
                }
            } else if (r.category === "bank") {
                employee.bankDetails = employee.bankDetails || {};
                const allowed = ["bankName", "accountName", "accountNumber", "sortCode", "iban"];
                for (const k of allowed) {
                    if (r.payload?.[k] !== undefined) employee.bankDetails[k] = r.payload[k];
                }
            }

            await employee.save();
        }

        r.status = status;
        r.reviewedBy = req.user.userId;
        r.reviewedAt = new Date();
        r.reviewNote = reviewNote;

        await r.save();

        await writeLog({
            req,
            subjectId: r.employeeId,
            action: status === "approved" ? "APPROVE" : "REJECT",
            entityId: String(r._id),
            message: `${status === "approved" ? "Approved" : "Rejected"} ${r.category} change request`,
            meta: { category: r.category, reviewNote },
        });

        // Email employee decision
        try {
            const employee = await User.findById(r.employeeId).select("fullName email").lean();
            if (employee?.email) {
                const subject = `AutoPay: Profile change request ${status}`;
                const text =
                    `Your profile change request has been ${status}.\n\n` +
                    `Category: ${r.category}\n` +
                    (reviewNote ? `Review note: ${reviewNote}\n\n` : "\n") +
                    `AutoPay\n`;

                await sendEmailLogged({
                    audience: "employee",
                    to: employee.email,
                    toUserId: r.employeeId,
                    eventType: "profile_change_decision",
                    templateKey: "profile_change_decision",
                    subject,
                    text,
                    meta: { requestId: String(r._id), decision: status, category: r.category },
                });
            }
        } catch { }

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: "Failed to decide request", error: e.message });
    }
});

export default router;
