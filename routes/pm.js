import express from "express";
import SupportTicket from "../models/SupportTicket.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/pm/summary
 * Rules:
 * payroll_manager sees payroll support
 * admin sees technical support
 */
router.get(
    "/summary",
    authRequired,
    requireAnyRole(["payroll_manager", "admin"]),
    async (req, res) => {
        try {
            const role = req.user.role;

            const assignedToRole = role === "admin" ? "admin" : "payroll_manager";

            const total = await SupportTicket.countDocuments({ assignedToRole });

            const open = await SupportTicket.countDocuments({
                assignedToRole,
                status: { $in: ["not_started", "in_progress"] },
            });

            const resolved = await SupportTicket.countDocuments({
                assignedToRole,
                status: { $in: ["resolved", "closed"] },
            });

            res.json({
                role,
                support: { total, open, resolved, assignedToRole },
                // placeholders 
                profileChangeRequests: { pending: 0 },
                leave: { pending: 0 },
                overtime: { pending: 0 },
            });
        } catch (e) {
            res.status(400).json({ message: e.message || "Failed to load PM summary." });
        }
    }
);

export default router;
