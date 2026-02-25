import express from "express";
import PayrollAdjustment from "../models/PayrollAdjustment.js";
import User from "../models/User.js";
import Paycode from "../models/Paycode.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";

const router = express.Router();

function normEmail(v) {
    return String(v || "").trim().toLowerCase();
}
function normCode(v) {
    return String(v || "").trim().toUpperCase();
}
function normStr(v) {
    return String(v ?? "").trim();
}
function isValidPeriod(p) {
    return /^\d{4}-\d{2}$/.test(String(p || "").trim());
}

async function writeLog({ req, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: null,
            module: "adjustments",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

/**
 * CSV supports header:
 * employeeEmail,paycode,amount,period,note
 * OR employeeId,paycode,amount,period,note
 */
function parseCsvText(csvText = "") {
    const raw = String(csvText || "").replace(/^\uFEFF/, "").trim();
    const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    if (!lines.length) return [];

    function splitCsvLine(line) {
        const out = [];
        let cur = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (ch === "," && !inQuotes) {
                out.push(cur.trim());
                cur = "";
                continue;
            }

            cur += ch;
        }
        out.push(cur.trim());
        return out;
    }

    const headerRaw = splitCsvLine(lines[0]).map((h) => String(h || "").trim().toLowerCase());

    const header = headerRaw.map((h) => {
        if (h === "employeeemail" || h === "email") return "employeeEmail";
        if (h === "employeeid" || h === "empid") return "employeeId";
        if (h === "paycode" || h === "code") return "paycode";
        return h;
    });

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        const obj = {};
        header.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
        rows.push(obj);
    }
    return rows;
}

// list
router.get("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        const period = normStr(req.query.period);
        const status = normStr(req.query.status);
        const search = normStr(req.query.search);

        const filter = {};
        if (period) filter.period = period;
        if (["pending", "applied", "cancelled"].includes(status)) filter.status = status;

        if (search) {
            filter.$or = [
                { paycodeCode: { $regex: search, $options: "i" } },
                { "employeeSnapshot.email": { $regex: search, $options: "i" } },
                { "employeeSnapshot.fullName": { $regex: search, $options: "i" } },
                { "employeeSnapshot.employeeId": { $regex: search, $options: "i" } },
            ];
        }

        const list = await PayrollAdjustment.find(filter).sort({ createdAt: -1 }).limit(500).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load adjustments", error: e.message });
    }
});

// create single
router.post("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        const { employeeEmail, employeeId, paycode, amount, period, note } = req.body || {};

        const p = normStr(period);
        if (!isValidPeriod(p)) return res.status(400).json({ message: "Invalid period. Use YYYY-MM" });

        const code = normCode(paycode);
        if (!code) return res.status(400).json({ message: "paycode is required" });

        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "amount must be > 0" });

        let emp = null;

        if (employeeId) {
            emp = await User.findOne({ _id: employeeId, role: "employee" });
        } else if (employeeEmail) {
            emp = await User.findOne({ email: normEmail(employeeEmail), role: "employee" });
        }

        if (!emp) return res.status(404).json({ message: "Employee not found" });

        const pc = await Paycode.findOne({ code }).lean();
        if (!pc) return res.status(404).json({ message: "Paycode not found" });

        if (pc.archivedAt) return res.status(400).json({ message: "Paycode is archived" });
        if (pc.active === false) return res.status(400).json({ message: "Paycode is inactive" });

        const doc = await PayrollAdjustment.create({
            employee: emp._id,
            employeeSnapshot: {
                fullName: emp.fullName || "",
                email: emp.email || "",
                employeeId: emp.employeeId || "",
            },
            paycodeCode: pc.code,
            paycodeName: pc.name || "",
            type: pc.type,
            amount: amt,
            period: p,
            note: normStr(note),
            status: "pending",
            createdBy: req.user.userId,
        });

        await writeLog({
            req,
            action: "CREATE",
            entityId: doc._id,
            message: `Created adjustment (${pc.code}) for ${emp.email} period ${p}`,
            meta: { employeeId: String(emp._id), paycode: pc.code, amount: amt, period: p },
        });

        res.status(201).json(doc);
    } catch (e) {
        res.status(500).json({ message: "Failed to create adjustment", error: e.message });
    }
});

// edit (no delete)
router.patch("/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        const doc = await PayrollAdjustment.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Adjustment not found" });

        if (doc.status !== "pending") {
            return res.status(400).json({ message: "Only pending adjustments can be edited" });
        }

        const patch = req.body || {};
        const before = {
            paycodeCode: doc.paycodeCode,
            amount: doc.amount,
            period: doc.period,
            note: doc.note,
        };

        if (patch.period !== undefined) {
            const p = normStr(patch.period);
            if (!isValidPeriod(p)) return res.status(400).json({ message: "Invalid period. Use YYYY-MM" });
            doc.period = p;
        }

        if (patch.amount !== undefined) {
            const amt = Number(patch.amount);
            if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "amount must be > 0" });
            doc.amount = amt;
        }

        if (patch.note !== undefined) doc.note = normStr(patch.note);

        if (patch.paycode !== undefined) {
            const code = normCode(patch.paycode);
            if (!code) return res.status(400).json({ message: "paycode is required" });

            const pc = await Paycode.findOne({ code }).lean();
            if (!pc) return res.status(404).json({ message: "Paycode not found" });
            if (pc.archivedAt) return res.status(400).json({ message: "Paycode is archived" });
            if (pc.active === false) return res.status(400).json({ message: "Paycode is inactive" });

            doc.paycodeCode = pc.code;
            doc.paycodeName = pc.name || "";
            doc.type = pc.type;
        }

        doc.updatedBy = req.user.userId;
        await doc.save();

        await writeLog({
            req,
            action: "UPDATE",
            entityId: doc._id,
            message: `Updated adjustment ${doc._id}`,
            meta: { before, after: { paycodeCode: doc.paycodeCode, amount: doc.amount, period: doc.period, note: doc.note } },
        });

        res.json(doc);
    } catch (e) {
        res.status(500).json({ message: "Failed to update adjustment", error: e.message });
    }
});

//  cancel 
router.post("/:id/cancel", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        const doc = await PayrollAdjustment.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Adjustment not found" });

        if (doc.status !== "pending") {
            return res.status(400).json({ message: "Only pending adjustments can be cancelled" });
        }

        doc.status = "cancelled";
        doc.cancelledAt = new Date();
        doc.cancelledBy = req.user.userId;
        doc.updatedBy = req.user.userId;
        await doc.save();

        await writeLog({
            req,
            action: "CANCEL",
            entityId: doc._id,
            message: `Cancelled adjustment ${doc._id}`,
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: "Failed to cancel adjustment", error: e.message });
    }
});

// bulk import (paste CSV)
router.post("/bulk", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        const { csvText } = req.body || {};
        const rows = parseCsvText(csvText);

        if (!rows.length) return res.status(400).json({ message: "No rows found in CSV" });

        const created = [];
        const skipped = [];

        for (const r of rows) {
            const employeeEmail = normEmail(r.employeeEmail);
            const employeeId = normStr(r.employeeId);
            const code = normCode(r.paycode);
            const period = normStr(r.period);
            const note = normStr(r.note);
            const amt = Number(r.amount);

            if (!code || !isValidPeriod(period) || !Number.isFinite(amt) || amt <= 0) {
                skipped.push({ row: r, reason: "Invalid paycode/period/amount" });
                continue;
            }

            let emp = null;
            if (employeeId) emp = await User.findOne({ _id: employeeId, role: "employee" });
            else if (employeeEmail) emp = await User.findOne({ email: employeeEmail, role: "employee" });

            if (!emp) {
                skipped.push({ row: r, reason: "Employee not found" });
                continue;
            }

            const pc = await Paycode.findOne({ code }).lean();
            if (!pc) {
                skipped.push({ row: r, reason: "Paycode not found" });
                continue;
            }
            if (pc.archivedAt || pc.active === false) {
                skipped.push({ row: r, reason: "Paycode archived/inactive" });
                continue;
            }

            const doc = await PayrollAdjustment.create({
                employee: emp._id,
                employeeSnapshot: { fullName: emp.fullName || "", email: emp.email || "", employeeId: emp.employeeId || "" },
                paycodeCode: pc.code,
                paycodeName: pc.name || "",
                type: pc.type,
                amount: amt,
                period,
                note,
                status: "pending",
                createdBy: req.user.userId,
            });

            created.push(doc);
        }

        await writeLog({
            req,
            action: "BULK_CREATE",
            message: `Bulk add adjustments (created: ${created.length}, skipped: ${skipped.length})`,
            meta: { createdCount: created.length, skippedCount: skipped.length },
        });

        res.json({ createdCount: created.length, skippedCount: skipped.length, created, skipped });
    } catch (e) {
        res.status(500).json({ message: "Failed bulk import", error: e.message });
    }
});

export default router;
