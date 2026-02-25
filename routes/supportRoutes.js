import express from "express";
import SupportTicket from "../models/SupportTicket.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { uploadSupport } from "../middleware/uploadSupport.js";
import { authRequired } from "../middleware/auth.js";
import { sendAdminPmEmailLogged, sendEmailLogged } from "../utils/mailer.js";

const router = express.Router();

function toAttachment(file) {
    return {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/support/${file.filename}`,
    };
}

async function writeLog({ req, subjectId, action, message, entityId = "", meta = {}, module = "support" }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId,
            module,
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

function safeStr(v) {
    return String(v || "").trim();
}

// Create ticket
router.post("/tickets", authRequired, uploadSupport.array("files", 5), async (req, res) => {
    try {
        const { type, title, description = "", priority = "low", dueDate = null } = req.body;

        if (!type || !["technical", "payroll"].includes(type)) {
            return res.status(400).json({ message: "Invalid ticket type." });
        }
        if (!String(title || "").trim()) {
            return res.status(400).json({ message: "Title is required." });
        }

        const assignedToRole = type === "technical" ? "admin" : "payroll_manager";
        const attachments = (req.files || []).map(toAttachment);

        const u = await User.findById(req.user.userId).select("email employeeId fullName");
        const employeeEmail = safeStr(u?.email);
        const employeeNumber = safeStr(u?.employeeId);
        const employeeName = safeStr(u?.fullName);

        if (!employeeEmail || !employeeNumber) {
            return res.status(400).json({
                message: "Employee identity missing (email/employeeId). Please log out & log in again.",
            });
        }

        const ticket = await SupportTicket.create({
            createdBy: req.user.userId,
            type,
            title,
            description,
            priority,
            dueDate: dueDate ? new Date(dueDate) : null,
            assignedToRole,
            attachments,
            lastActionAt: new Date(),
            employeeEmail,
            employeeNumber,
        });

        await writeLog({
            req,
            subjectId: req.user.userId,
            action: "CREATE",
            entityId: ticket._id,
            message: `Created support ticket (${type})`,
            meta: { title: ticket.title, priority: ticket.priority, assignedToRole },
        });

        // Email admin/pm: new ticket awaiting response
        try {
            const subject = `AutoPay: New support ticket awaiting response`;
            const text =
                `A new support ticket was created.\n\n` +
                `Type: ${ticket.type}\n` +
                `Employee: ${employeeName || "-"} (${employeeEmail || "-"})\n` +
                `Employee ID: ${employeeNumber || "-"}\n` +
                `Title: ${ticket.title}\n` +
                `Priority: ${ticket.priority}\n\n` +
                `AutoPay\n`;

            await sendAdminPmEmailLogged({
                subject,
                text,
                eventType: "support_new_ticket",
                templateKey: "support_new_ticket",
                meta: {
                    ticketId: String(ticket._id),
                    type: ticket.type,
                    priority: ticket.priority,
                    mailText: text, // retry worker can resend
                },
            });
        } catch { }

        res.json(ticket);
    } catch (e) {
        console.error("SUPPORT CREATE ERROR:", e);
        res.status(400).json({ message: e.message || "Failed to create ticket." });
    }
});

// List tickets 
router.get("/tickets", authRequired, async (req, res) => {
    try {
        const { q = "", type = "" } = req.query;

        const filter = {};

        if (req.user.role === "employee") {
            filter.createdBy = req.user.userId;
        } else if (req.user.role === "admin") {
            filter.assignedToRole = "admin";
        } else if (req.user.role === "payroll_manager") {
            filter.assignedToRole = "payroll_manager";
        }

        if (type && ["technical", "payroll"].includes(type)) filter.type = type;
        if (q) filter.title = { $regex: String(q), $options: "i" };

        const list = await SupportTicket.find(filter).sort({ lastActionAt: -1, createdAt: -1 });
        res.json(list);
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to load tickets." });
    }
});

// Get one 
router.get("/tickets/:id", authRequired, async (req, res) => {
    try {
        const t = await SupportTicket.findById(req.params.id);
        if (!t) return res.status(404).json({ message: "Not found." });

        const isOwner = String(t.createdBy) === String(req.user.userId);
        const isAssignee =
            (req.user.role === "admin" && t.assignedToRole === "admin") ||
            (req.user.role === "payroll_manager" && t.assignedToRole === "payroll_manager");

        if (!isOwner && !isAssignee) return res.status(403).json({ message: "Forbidden." });

        res.json(t);
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to load ticket." });
    }
});

// Add message 
router.post("/tickets/:id/messages", authRequired, uploadSupport.array("files", 5), async (req, res) => {
    try {
        const t = await SupportTicket.findById(req.params.id);
        if (!t) return res.status(404).json({ message: "Not found." });

        const isOwner = String(t.createdBy) === String(req.user.userId);
        const isAssignee =
            (req.user.role === "admin" && t.assignedToRole === "admin") ||
            (req.user.role === "payroll_manager" && t.assignedToRole === "payroll_manager");

        if (!isOwner && !isAssignee) return res.status(403).json({ message: "Forbidden." });

        const text = String(req.body.text || "").trim();
        const attachments = (req.files || []).map(toAttachment);

        if (!text && attachments.length === 0) {
            return res.status(400).json({ message: "Message is empty." });
        }

        t.messages.push({
            senderId: req.user.userId,
            senderRole: req.user.role,
            text,
            attachments,
            createdAt: new Date(),
        });

        if (t.status === "not_started") t.status = "in_progress";
        t.lastActionAt = new Date();

        await t.save();

        await writeLog({
            req,
            subjectId: t.createdBy,
            action: "MESSAGE",
            entityId: t._id,
            message: `New message on ticket (${t.type})`,
            meta: { senderRole: req.user.role, hasAttachments: attachments.length > 0 },
        });

        // Email notifications:
        // if employee replied: notify ALL admin/pm
        // if admin/pm replied: notify the employee (ticket creator)
        try {
            if (req.user.role === "employee") {
                const subject = `AutoPay: New support response (employee)`;
                const snippet = text ? text.slice(0, 300) : "(attachment)";
                const mailText =
                    `An employee replied on a support ticket.\n\n` +
                    `Ticket: ${t.title}\n` +
                    `Type: ${t.type}\n` +
                    `Employee: ${t.employeeEmail} (${t.employeeNumber})\n` +
                    `Message: ${snippet}\n\n` +
                    `AutoPay\n`;

                await sendAdminPmEmailLogged({
                    subject,
                    text: mailText,
                    eventType: "support_response_to_admin_pm",
                    templateKey: "support_response",
                    meta: { ticketId: String(t._id), senderRole: "employee" },
                });
            } else {
                const employee = await User.findById(t.createdBy).select("email fullName").lean();
                const empEmail = safeStr(employee?.email);
                if (empEmail) {
                    const subject = `AutoPay: Support ticket update`;
                    const snippet = text ? text.slice(0, 300) : "(attachment)";
                    const mailText =
                        `You have a new response on your support ticket.\n\n` +
                        `Ticket: ${t.title}\n` +
                        `Message: ${snippet}\n\n` +
                        `AutoPay\n`;

                    await sendEmailLogged({
                        audience: "employee",
                        to: empEmail,
                        toUserId: t.createdBy,
                        eventType: "support_response_to_employee",
                        templateKey: "support_response",
                        subject,
                        text: mailText,
                        meta: { ticketId: String(t._id), senderRole: req.user.role },
                    });
                }
            }
        } catch { }

        res.json(t);
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to send message." });
    }
});

// Update ticket (assignee only) 
router.patch("/tickets/:id", authRequired, async (req, res) => {
    try {
        const t = await SupportTicket.findById(req.params.id);
        if (!t) return res.status(404).json({ message: "Not found." });

        const isAssignee =
            (req.user.role === "admin" && t.assignedToRole === "admin") ||
            (req.user.role === "payroll_manager" && t.assignedToRole === "payroll_manager");

        if (!isAssignee) return res.status(403).json({ message: "Forbidden." });

        const before = { status: t.status, priority: t.priority };

        const { status, priority } = req.body;

        if (status && ["not_started", "in_progress", "resolved", "closed"].includes(status)) t.status = status;
        if (priority && ["low", "medium", "high"].includes(priority)) t.priority = priority;

        t.lastActionAt = new Date();
        await t.save();

        await writeLog({
            req,
            subjectId: t.createdBy,
            action: "UPDATE",
            entityId: t._id,
            message: `Updated ticket (${t.type})`,
            meta: { before, after: { status: t.status, priority: t.priority } },
        });

        // Email employee if ticket is closed
        try {
            if (before.status !== "closed" && t.status === "closed") {
                const employee = await User.findById(t.createdBy).select("email fullName").lean();
                const empEmail = safeStr(employee?.email);
                if (empEmail) {
                    const subject = `AutoPay: Support ticket closed`;
                    const mailText =
                        `Your support ticket has been closed.\n\n` +
                        `Ticket: ${t.title}\n` +
                        `Type: ${t.type}\n\n` +
                        `AutoPay\n`;

                    await sendEmailLogged({
                        audience: "employee",
                        to: empEmail,
                        toUserId: t.createdBy,
                        eventType: "support_closed",
                        templateKey: "support_closed",
                        subject,
                        text: mailText,
                        meta: { ticketId: String(t._id) },
                    });
                }
            }
        } catch { }

        res.json(t);
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to update ticket." });
    }
});

// Delete (employee only if not resolved/closed) 
router.delete("/tickets/:id", authRequired, async (req, res) => {
    try {
        const t = await SupportTicket.findById(req.params.id);
        if (!t) return res.status(404).json({ message: "Not found." });

        if (req.user.role !== "employee") return res.status(403).json({ message: "Forbidden." });
        if (String(t.createdBy) !== String(req.user.userId)) return res.status(403).json({ message: "Forbidden." });
        if (["resolved", "closed"].includes(t.status)) {
            return res.status(400).json({ message: "Cannot delete resolved/closed ticket." });
        }

        await SupportTicket.deleteOne({ _id: t._id });

        await writeLog({
            req,
            subjectId: req.user.userId,
            action: "DELETE",
            entityId: t._id,
            message: `Deleted ticket (${t.type})`,
            meta: { title: t.title },
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to delete ticket." });
    }
});

export default router;
