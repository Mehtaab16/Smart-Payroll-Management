import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import { sendEmployeeWelcomeEmail } from "../utils/mailer.js";// uses your mailer

const router = express.Router();

function ensureDbReady() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Database not connected. Check MongoDB / MONGO_URI and restart backend.");
    }
}

function normEmail(e) {
    return String(e || "").trim().toLowerCase();
}

function makeTempPassword() {
    return `Auto@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
}

// Health 
router.get("/ping", (req, res) => res.json({ ok: true, msg: "access-rights route alive" }));

// List admins + PMs
router.get("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const list = await User.find({ role: { $in: ["admin", "payroll_manager"] } })
            .select("fullName email role isActive createdAt")
            .sort({ createdAt: -1 })
            .lean();

        res.json(
            list.map((u) => ({
                id: u._id,
                fullName: u.fullName,
                email: u.email,
                role: u.role,
                isActive: !!u.isActive,
                createdAt: u.createdAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load access rights" });
    }
});

// Create access (create user if not exists) + email password 
router.post("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const { fullName, email, role } = req.body;
        const em = normEmail(email);

        const targetRole =
            role === "admin" ? "admin" : role === "payroll_manager" ? "payroll_manager" : "";

        if (!String(fullName || "").trim()) return res.status(400).json({ message: "fullName is required" });
        if (!em) return res.status(400).json({ message: "email is required" });
        if (!targetRole) return res.status(400).json({ message: "role must be admin or payroll_manager" });

        let user = await User.findOne({ email: em });

        // If exists, just promote + activate
        if (user) {
            user.role = targetRole;
            user.isActive = true;
            await user.save();
            return res.status(201).json({ ok: true, id: user._id, email: user.email, role: user.role });
        }

        // Create new back-office user with temp password
        const tempPass = makeTempPassword();
        const passwordHash = await bcrypt.hash(tempPass, 10);

        user = await User.create({
            fullName: String(fullName).trim(),
            email: em,
            passwordHash,
            role: targetRole,
            isActive: true,
        });

        // Send welcome email (will throw if SMTP wrong)
        await sendEmployeeWelcomeEmail({
            to: user.email,
            fullName: user.fullName,
            tempPassword: tempPass,
        });

        res.status(201).json({ ok: true, id: user._id, email: user.email, role: user.role });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to create access" });
    }
});

// Update (allow email change + name + role + active) 
router.put("/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const { fullName, email, role, isActive } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // restrict to back office users only
        if (!["admin", "payroll_manager"].includes(user.role) && role === undefined) {
            // If they try editing a non back-office user by ID, block.
            return res.status(400).json({ message: "Only back office users can be edited here." });
        }

        if (fullName !== undefined) user.fullName = String(fullName || "").trim();
        if (!user.fullName) return res.status(400).json({ message: "fullName is required" });

        if (email !== undefined) {
            const em = normEmail(email);
            if (!em) return res.status(400).json({ message: "email is required" });

            const exists = await User.findOne({ email: em, _id: { $ne: user._id } });
            if (exists) return res.status(400).json({ message: "Email already exists" });

            user.email = em;
        }

        if (role !== undefined) {
            if (!["admin", "payroll_manager"].includes(role)) {
                return res.status(400).json({ message: "role must be admin or payroll_manager" });
            }
            user.role = role;
        }

        if (isActive !== undefined) user.isActive = !!isActive;

        await user.save();
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to update access" });
    }
});

// Resend email + reset password
router.post("/:id/resend", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!["admin", "payroll_manager"].includes(user.role)) {
            return res.status(400).json({ message: "Resend is only for Admin/Payroll Manager users." });
        }

        const tempPass = makeTempPassword();
        user.passwordHash = await bcrypt.hash(tempPass, 10);
        user.isActive = true;
        await user.save();

        await sendEmployeeWelcomeEmail({
            to: user.email,
            fullName: user.fullName,
            tempPassword: tempPass,
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to resend email" });
    }
});

// Remove access (demote to employee)
router.delete("/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.role = "employee";
        await user.save();

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to remove access" });
    }
});

export default router;
