import express from "express";
import AuditLog from "../models/AuditLog.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

// GET /api/audit/mine?limit=50&module=profile
//logs ABOUT this user (subjectId)
router.get("/mine", authRequired, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
        const module = String(req.query.module || "").trim();

        const filter = {
            subjectId: req.user.userId,
        };
        if (module) filter.module = module;

        const list = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load logs", error: e.message });
    }
});

// GET /api/audit/my-actions?limit=80&module=support
// Logs DONE BY this user (actorId)
// GET /api/audit/my-actions?limit=80&module=support
router.get("/my-actions", authRequired, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || "80", 10), 200);
        const module = String(req.query.module || "").trim();

        const actorId = req.user.actorId || req.user.userId; // ✅ admin id when impersonating

        const filter = { actorId };
        if (module) filter.module = module;

        const list = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load logs", error: e.message });
    }
});

//Admin/Payroll can see all logs
router.get("/", authRequired, async (req, res) => {
    try {
        if (!["admin", "payroll_manager"].includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
        const module = String(req.query.module || "").trim();
        const subjectId = String(req.query.subjectId || "").trim();

        const filter = {};
        if (module) filter.module = module;
        if (subjectId) filter.subjectId = subjectId;

        const list = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load logs", error: e.message });
    }
});

export default router;
