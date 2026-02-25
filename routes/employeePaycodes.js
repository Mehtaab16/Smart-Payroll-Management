import express from "express";
import EmployeePaycodeAssignment from "../models/EmployeePaycodeAssignment.js";
import Paycode from "../models/Paycode.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";

const router = express.Router();

function isYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}
function yyyymmToInt(v) {
    const [y, m] = v.split("-");
    return Number(y) * 100 + Number(m);
}
function overlaps(aFrom, aTo, bFrom, bTo) {
    const aF = yyyymmToInt(aFrom);
    const aT = aTo ? yyyymmToInt(aTo) : 999912;
    const bF = yyyymmToInt(bFrom);
    const bT = bTo ? yyyymmToInt(bTo) : 999912;
    return aF <= bT && bF <= aT;
}
async function audit({ req, action, message, subjectId, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId,
            module: "compensation",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

// GET /api/employee-paycodes/:employeeId
router.get("/:employeeId", async (req, res) => {
    try {
        const employeeId = req.params.employeeId;
        const emp = await User.findById(employeeId).lean();
        if (!emp) return res.status(404).json({ message: "Employee not found" });

        const list = await EmployeePaycodeAssignment.find({ employeeId })
            .populate("paycodeId")
            .sort({ effectiveFrom: -1, createdAt: -1 })
            .lean();

        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load employee paycodes", error: e.message });
    }
});

// POST /api/employee-paycodes/:employeeId
router.post("/:employeeId", async (req, res) => {
    try {
        const employeeId = req.params.employeeId;

        const {
            paycodeId,
            amount = null,
            percentage = null,
            hourlyRate = null,
            calcType = null,
            priority = null,
            effectiveFrom,
            effectiveTo = null,
            note = "",
        } = req.body || {};

        if (!paycodeId) return res.status(400).json({ message: "paycodeId is required" });
        if (!effectiveFrom || !isYYYYMM(effectiveFrom)) return res.status(400).json({ message: "effectiveFrom must be YYYY-MM" });
        if (effectiveTo && !isYYYYMM(effectiveTo)) return res.status(400).json({ message: "effectiveTo must be YYYY-MM or null" });
        if (effectiveTo && yyyymmToInt(effectiveTo) < yyyymmToInt(effectiveFrom)) {
            return res.status(400).json({ message: "effectiveTo cannot be before effectiveFrom" });
        }

        const pc = await Paycode.findById(paycodeId).lean();
        if (!pc) return res.status(404).json({ message: "Paycode not found" });
        if (pc.archivedAt) return res.status(400).json({ message: "Cannot assign an archived paycode" });

        const existing = await EmployeePaycodeAssignment.find({ employeeId, paycodeId }).lean();
        if (existing.some((x) => overlaps(x.effectiveFrom, x.effectiveTo, effectiveFrom, effectiveTo))) {
            return res.status(400).json({ message: "This paycode already has an assignment overlapping that period" });
        }

        const doc = await EmployeePaycodeAssignment.create({
            employeeId,
            paycodeId,
            amount,
            percentage,
            hourlyRate,
            calcType,
            priority,
            effectiveFrom,
            effectiveTo,
            note: String(note || "").trim(),
            createdBy: req.user.userId,
            updatedBy: req.user.userId,
        });

        await audit({
            req,
            action: "CREATE",
            subjectId: employeeId,
            entityId: doc._id,
            message: `Assigned paycode ${pc.code}`,
            meta: { paycodeCode: pc.code, effectiveFrom, effectiveTo },
        });

        const populated = await EmployeePaycodeAssignment.findById(doc._id).populate("paycodeId").lean();
        res.status(201).json(populated);
    } catch (e) {
        res.status(500).json({ message: "Failed to create assignment", error: e.message });
    }
});

// PATCH /api/employee-paycodes/:employeeId/:assignmentId
router.patch("/:employeeId/:assignmentId", async (req, res) => {
    try {
        const { employeeId, assignmentId } = req.params;
        const patch = req.body || {};

        if (patch.effectiveFrom && !isYYYYMM(patch.effectiveFrom)) return res.status(400).json({ message: "effectiveFrom must be YYYY-MM" });
        if (patch.effectiveTo && patch.effectiveTo !== null && !isYYYYMM(patch.effectiveTo)) return res.status(400).json({ message: "effectiveTo must be YYYY-MM or null" });

        const current = await EmployeePaycodeAssignment.findOne({ _id: assignmentId, employeeId });
        if (!current) return res.status(404).json({ message: "Assignment not found" });

        const nextFrom = patch.effectiveFrom || current.effectiveFrom;
        const nextTo = (patch.effectiveTo === undefined) ? current.effectiveTo : patch.effectiveTo;

        if (nextTo && yyyymmToInt(nextTo) < yyyymmToInt(nextFrom)) {
            return res.status(400).json({ message: "effectiveTo cannot be before effectiveFrom" });
        }

        const others = await EmployeePaycodeAssignment.find({
            employeeId,
            paycodeId: current.paycodeId,
            _id: { $ne: assignmentId },
        }).lean();

        if (others.some((x) => overlaps(x.effectiveFrom, x.effectiveTo, nextFrom, nextTo))) {
            return res.status(400).json({ message: "Update creates overlapping period for this paycode" });
        }

        Object.assign(current, patch);
        current.updatedBy = req.user.userId;
        await current.save();

        await audit({
            req,
            action: "UPDATE",
            subjectId: employeeId,
            entityId: current._id,
            message: `Updated assignment`,
        });

        const populated = await EmployeePaycodeAssignment.findById(current._id).populate("paycodeId").lean();
        res.json(populated);
    } catch (e) {
        res.status(500).json({ message: "Failed to update assignment", error: e.message });
    }
});

// POST /api/employee-paycodes/:employeeId/:assignmentId/end
router.post("/:employeeId/:assignmentId/end", async (req, res) => {
    try {
        const { employeeId, assignmentId } = req.params;
        const { effectiveTo } = req.body || {};

        if (!effectiveTo || !isYYYYMM(effectiveTo)) return res.status(400).json({ message: "effectiveTo must be YYYY-MM" });

        const current = await EmployeePaycodeAssignment.findOne({ _id: assignmentId, employeeId });
        if (!current) return res.status(404).json({ message: "Assignment not found" });

        if (yyyymmToInt(effectiveTo) < yyyymmToInt(current.effectiveFrom)) {
            return res.status(400).json({ message: "effectiveTo cannot be before effectiveFrom" });
        }

        current.effectiveTo = effectiveTo;
        current.updatedBy = req.user.userId;
        await current.save();

        await audit({
            req,
            action: "END",
            subjectId: employeeId,
            entityId: current._id,
            message: `Ended assignment at ${effectiveTo}`,
        });

        const populated = await EmployeePaycodeAssignment.findById(current._id).populate("paycodeId").lean();
        res.json(populated);
    } catch (e) {
        res.status(500).json({ message: "Failed to end assignment", error: e.message });
    }
});

export default router;
