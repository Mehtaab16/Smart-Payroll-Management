import express from "express";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired } from "../middleware/auth.js";
import { uploadAvatar } from "../middleware/uploadAvatar.js";

import bcrypt from "bcrypt";


const router = express.Router();

function isPrivileged(role) {
    return role === "admin" || role === "payroll_manager";
}

const DEFAULT_PREFS = {
    darkMode: true,
    largeText: false,
    notifications: true,
    highContrast: false,
};

function pickBool(v, fallback) {
    if (v === true || v === false) return v;
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === 1 || v === "1") return true;
    if (v === 0 || v === "0") return false;
    return fallback;
}

function normalizePrefs(p) {
    return { ...DEFAULT_PREFS, ...(p || {}) };
}

// GET /api/users/me (full profile) 
router.get("/me", authRequired, async (req, res) => {
    try {
        const u = await User.findById(req.user.userId).lean();
        if (!u) return res.status(404).json({ message: "User not found" });

        res.json({
            id: u._id,
            fullName: u.fullName,
            email: u.email,
            role: u.role,
            employeeId: u.employeeId || "",
            department: u.department || "",
            profilePhotoUrl: u.profilePhotoUrl || "",
            bankDetails: u.bankDetails || {},
            accessibilityPrefs: normalizePrefs(u.accessibilityPrefs),
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to load profile", error: e.message });
    }
});

// GET /api/users/me/accessibility
router.get("/me/accessibility", authRequired, async (req, res) => {
    try {
        const u = await User.findById(req.user.userId).lean();
        if (!u) return res.status(404).json({ message: "User not found" });

        return res.json(normalizePrefs(u.accessibilityPrefs));
    } catch (e) {
        return res.status(500).json({ message: "Failed to load accessibility", error: e.message });
    }
});

// PUT /api/users/me/accessibility
router.put("/me/accessibility", authRequired, async (req, res) => {
    try {
        const u = await User.findById(req.user.userId);
        if (!u) return res.status(404).json({ message: "User not found" });

        const prev = normalizePrefs(u.accessibilityPrefs);

        const nextPrefs = normalizePrefs({
            darkMode: pickBool(req.body.darkMode, prev.darkMode),
            largeText: pickBool(req.body.largeText, prev.largeText),
            notifications: pickBool(req.body.notifications, prev.notifications),
            highContrast: pickBool(req.body.highContrast, prev.highContrast),
        });

        u.accessibilityPrefs = nextPrefs;
        await u.save();

        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "accessibility",
            action: "UPDATE",
            entityId: String(req.user.userId),
            message: "Updated accessibility preferences",
            meta: { from: prev, to: nextPrefs },
        });

        return res.json(nextPrefs);
    } catch (e) {
        return res.status(500).json({ message: "Failed to update accessibility", error: e.message });
    }
});

function isStrongPassword(pw) {
    const s = String(pw || "");
    const okLen = s.length >= 8;
    const okSpecial = /[^A-Za-z0-9]/.test(s); // at least 1 special char
    return okLen && okSpecial;
}

// PATCH /api/users/me/password (self service) 
router.patch("/me/password", authRequired, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "currentPassword and newPassword are required." });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({
                message: "Password must be at least 8 characters and include at least 1 special character.",
            });
        }

        const u = await User.findById(req.user.userId);
        if (!u) return res.status(404).json({ message: "User not found" });

        const ok = await bcrypt.compare(String(currentPassword), String(u.passwordHash));
        if (!ok) return res.status(400).json({ message: "Current password is incorrect." });

        const sameAsOld = await bcrypt.compare(String(newPassword), String(u.passwordHash));
        if (sameAsOld) {
            return res.status(400).json({ message: "New password must be different from current password." });
        }

        const salt = await bcrypt.genSalt(10);
        u.passwordHash = await bcrypt.hash(String(newPassword), salt);
        await u.save();

        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "profile",
            action: "UPDATE",
            entityId: String(req.user.userId),
            message: "Changed own password",
        });

        return res.json({ ok: true, message: "Password updated successfully." });
    } catch (e) {
        return res.status(500).json({ message: "Failed to update password", error: e.message });
    }
});


// PATCH /api/users/me 
router.patch("/me", authRequired, async (req, res) => {
    try {
        if (!isPrivileged(req.user.role)) {
            return res
                .status(403)
                .json({ message: "Employees cannot edit profile directly. Use Request Change." });
        }

        const allowed = ["fullName", "department", "email", "bankDetails", "profilePhotoUrl"];
        const patch = {};

        for (const k of allowed) {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        }

        delete patch.employeeId;
        delete patch.role;
        delete patch.passwordHash;

        const u = await User.findByIdAndUpdate(req.user.userId, patch, {
            new: true,
            runValidators: true,
        }).lean();

        if (!u) return res.status(404).json({ message: "User not found" });

        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "profile",
            action: "UPDATE",
            entityId: String(req.user.userId),
            message: "Profile updated by privileged user",
        });

        res.json({
            id: u._id,
            fullName: u.fullName,
            email: u.email,
            role: u.role,
            employeeId: u.employeeId || "",
            department: u.department || "",
            profilePhotoUrl: u.profilePhotoUrl || "",
            bankDetails: u.bankDetails || {},
            accessibilityPrefs: normalizePrefs(u.accessibilityPrefs),
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        });
    } catch (e) {
        res.status(400).json({ message: "Failed to update profile", error: e.message });
    }
});

// avatar routes
router.post("/me/avatar", authRequired, uploadAvatar.single("avatar"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });

        const url = `/uploads/avatars/${req.file.filename}`;

        const u = await User.findByIdAndUpdate(req.user.userId, { profilePhotoUrl: url }, { new: true }).lean();

        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "profile",
            action: "UPLOAD",
            entityId: String(req.user.userId),
            message: "Updated profile picture",
        });

        res.json({ profilePhotoUrl: u?.profilePhotoUrl || url });
    } catch (e) {
        res.status(400).json({ message: "Failed to upload avatar", error: e.message });
    }
});

router.delete("/me/avatar", authRequired, async (req, res) => {
    try {
        const u = await User.findByIdAndUpdate(req.user.userId, { profilePhotoUrl: "" }, { new: true }).lean();

        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "profile",
            action: "DELETE",
            entityId: String(req.user.userId),
            message: "Deleted profile picture",
        });

        res.json({ profilePhotoUrl: u?.profilePhotoUrl || "" });
    } catch (e) {
        res.status(400).json({ message: "Failed to delete avatar", error: e.message });
    }
});

export default router;
