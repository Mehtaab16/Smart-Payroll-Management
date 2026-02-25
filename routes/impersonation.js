// routes/impersonation.js
import express from "express";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import jwt from "jsonwebtoken";

const router = express.Router();

function signImpersonationToken({ actingUser, impersonator }) {
    return jwt.sign(
        {
            // effective user (the one acting as)
            userId: actingUser._id,
            role: actingUser.role,
            email: actingUser.email,
            employeeId: actingUser.employeeId || null,

            // impersonation flags + actor fields (admin)
            imp: true,
            actorId: impersonator._id,
            actorRole: impersonator.role,   // "admin"
            actorEmail: impersonator.email,
            originalUserId: impersonator._id,

            // keep nested object 
            impersonator: {
                userId: impersonator._id,
                role: impersonator.role,
                email: impersonator.email,
            },
        },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
    );
}


// GET /api/impersonation/targets?role=employee&department=HR
router.get("/targets", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
        const role = String(req.query.role || "").trim();
        const department = String(req.query.department || "").trim();

        if (!["employee", "payroll_manager"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        const q = {
            role,
            isActive: true,
            // never show admins as targets
            role: role,
            _id: { $ne: req.user.userId }, // cannot impersonate yourself
        };

        if (role === "employee" && department) {
            q.department = department;
        }

        const users = await User.find(q)
            .select("_id fullName email role department employeeId")
            .sort({ fullName: 1 })
            .lean();

        // departments list only for employees
        let departments = [];
        if (role === "employee") {
            const deps = await User.distinct("department", { role: "employee", isActive: true });
            departments = (deps || []).filter(Boolean).sort();
        }

        res.json({
            departments,
            users: users.map((u) => ({
                id: u._id,
                fullName: u.fullName,
                email: u.email,
                role: u.role,
                department: u.department || "",
                employeeId: u.employeeId || "",
            })),
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to load targets", error: e.message });
    }
});

// POST /api/impersonation/start { role, userId }
router.post("/start", authRequired, requireRole(["admin"]), async (req, res) => {
    try {
        const { role, userId } = req.body || {};
        const targetRole = String(role || "").trim();

        if (!["employee", "payroll_manager"].includes(targetRole)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        const target = await User.findOne({
            _id: userId,
            role: targetRole,
            isActive: true,
        }).lean();

        if (!target) return res.status(404).json({ message: "Target user not found" });

        // block impersonating admins (already blocked by role filter)
        if (target.role === "admin") {
            return res.status(403).json({ message: "Cannot impersonate admin" });
        }

        const admin = await User.findById(req.user.userId).lean();
        if (!admin || admin.role !== "admin") return res.status(403).json({ message: "Forbidden" });

        const token = signImpersonationToken({ actingUser: target, impersonator: admin });

        await AuditLog.create({
            actorId: admin._id,
            actorRole: admin.role,
            subjectId: target._id,
            module: "impersonation",
            action: "START",
            entityId: String(target._id),
            message: `Admin started impersonation`,
            meta: { actingAs: { userId: String(target._id), role: target.role, email: target.email } },
        });

        res.json({
            token,
            user: {
                id: target._id,
                fullName: target.fullName,
                email: target.email,
                role: target.role,
                employeeId: target.employeeId || null,
                department: target.department || "",
                impersonating: true,
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to start impersonation", error: e.message });
    }
});

export default router;
