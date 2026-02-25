import express from "express";
import Paycode from "../models/Paycode.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireAnyRole, requireRole } from "../middleware/auth.js";

const router = express.Router();

async function audit({ req, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: null,
            module: "paycodes",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

function normStr(v) {
    return String(v ?? "").trim();
}
function normBool(v, def = false) {
    if (v === true || v === false) return v;
    const s = String(v ?? "").trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(s)) return true;
    if (["false", "0", "no", "n"].includes(s)) return false;
    return def;
}
function normCode(v) {
    return normStr(v).toUpperCase();
}

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

    const headerRaw = splitCsvLine(lines[0]).map((h) =>
        String(h || "")
            .replace(/^\uFEFF/, "")
            .trim()
            .toLowerCase()
    );

    const header = headerRaw.map((h) => {
        if (h === "priority" || h === "defaultpriority" || h === "order") return "defaultPriority";
        if (h === "visible" || h === "visibleonpayslip" || h === "payslip") return "visibleOnPayslip";
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

// GET list
router.get("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        const search = normStr(req.query.search);
        const type = normStr(req.query.type);
        const archived = normStr(req.query.archived);

        const filter = {};
        if (type === "earning" || type === "deduction") filter.type = type;

        if (archived === "true") filter.archivedAt = { $ne: null };
        if (archived === "false") filter.archivedAt = null;

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { code: { $regex: search, $options: "i" } },
            ];
        }

        const list = await Paycode.find(filter).sort({ defaultPriority: 1, name: 1 }).lean();
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: "Failed to load paycodes", error: e.message });
    }
});

// CREATE (admin only)
router.post("/", authRequired, requireRole("admin"), async (req, res) => {
    try {
        const body = req.body || {};
        const name = normStr(body.name);
        const code = normCode(body.code);
        const type = normStr(body.type);
        const visibleOnPayslip = normBool(body.visibleOnPayslip, true);
        const active = normBool(body.active, true);
        const calcType = normStr(body.calcType) || "fixed";
        const defaultPriority = Number(body.defaultPriority ?? 100) || 100;

        if (!name) return res.status(400).json({ message: "Name is required" });
        if (!code) return res.status(400).json({ message: "Code is required" });
        if (!["earning", "deduction"].includes(type)) return res.status(400).json({ message: "Invalid type" });
        if (!["fixed", "percentage", "hourly_rate", "manual"].includes(calcType)) {
            return res.status(400).json({ message: "Invalid calcType" });
        }

        const doc = await Paycode.create({
            name,
            code,
            type,
            visibleOnPayslip,
            active,
            calcType,
            defaultPriority,
            createdBy: req.user.userId,
            updatedBy: req.user.userId,
        });

        await audit({ req, action: "CREATE", entityId: doc._id, message: `Created paycode ${doc.code}` });
        res.status(201).json(doc);
    } catch (e) {
        if (String(e.message || "").includes("duplicate key")) {
            return res.status(400).json({ message: "Paycode code must be unique" });
        }
        res.status(500).json({ message: "Failed to create paycode", error: e.message });
    }
});

// UPDATE (admin only)
router.patch("/:id", authRequired, requireRole("admin"), async (req, res) => {
    try {
        const patch = { ...(req.body || {}) };

        if (patch.code !== undefined) patch.code = normCode(patch.code);
        if (patch.name !== undefined) patch.name = normStr(patch.name);

        if (patch.type !== undefined && !["earning", "deduction"].includes(patch.type)) {
            return res.status(400).json({ message: "Invalid type" });
        }
        if (patch.calcType !== undefined && !["fixed", "percentage", "hourly_rate", "manual"].includes(patch.calcType)) {
            return res.status(400).json({ message: "Invalid calcType" });
        }
        if (patch.defaultPriority !== undefined) patch.defaultPriority = Number(patch.defaultPriority) || 100;
        if (patch.visibleOnPayslip !== undefined) patch.visibleOnPayslip = normBool(patch.visibleOnPayslip, true);
        if (patch.active !== undefined) patch.active = normBool(patch.active, true);

        const updated = await Paycode.findByIdAndUpdate(
            req.params.id,
            { ...patch, updatedBy: req.user.userId },
            { new: true }
        );

        if (!updated) return res.status(404).json({ message: "Paycode not found" });

        await audit({ req, action: "UPDATE", entityId: updated._id, message: `Updated paycode ${updated.code}` });
        res.json(updated);
    } catch (e) {
        if (String(e.message || "").includes("duplicate key")) {
            return res.status(400).json({ message: "Paycode code must be unique" });
        }
        res.status(500).json({ message: "Failed to update paycode", error: e.message });
    }
});

// ARCHIVE (admin only)
router.post("/:id/archive", authRequired, requireRole("admin"), async (req, res) => {
    try {
        const doc = await Paycode.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Paycode not found" });

        doc.active = false;
        doc.archivedAt = new Date();
        doc.updatedBy = req.user.userId;
        await doc.save();

        await audit({ req, action: "ARCHIVE", entityId: doc._id, message: `Archived paycode ${doc.code}` });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: "Failed to archive paycode", error: e.message });
    }
});

// BULK (admin only)
router.post("/bulk", authRequired, requireRole("admin"), async (req, res) => {
    try {
        const { csvText } = req.body || {};
        const rows = parseCsvText(csvText);

        if (!rows.length) return res.status(400).json({ message: "No rows found in CSV" });

        const created = [];
        const skipped = [];

        for (const r of rows) {
            const code = normCode(r.code);
            const name = normStr(r.name);
            const type = normStr(r.type);
            const calcType = normStr(r.calcType || "fixed") || "fixed";
            const visibleOnPayslip = normBool(r.visibleOnPayslip, true);
            const active = normBool(r.active, true);
            const defaultPriority = Number(r.defaultPriority ?? r.priority ?? 100) || 100;

            if (!code || !name) {
                skipped.push({ row: r, reason: "Missing code or name" });
                continue;
            }
            if (!["earning", "deduction"].includes(type)) {
                skipped.push({ row: r, reason: "Invalid type (use earning/deduction)" });
                continue;
            }
            if (!["fixed", "percentage", "hourly_rate", "manual"].includes(calcType)) {
                skipped.push({ row: r, reason: "Invalid calcType" });
                continue;
            }

            const exists = await Paycode.findOne({ code }).lean();
            if (exists) {
                skipped.push({ row: r, reason: "Duplicate code (already exists)" });
                continue;
            }

            const doc = await Paycode.create({
                name,
                code,
                type,
                calcType,
                visibleOnPayslip,
                active,
                defaultPriority,
                createdBy: req.user.userId,
                updatedBy: req.user.userId,
            });

            created.push(doc);
        }

        await audit({
            req,
            action: "BULK_CREATE",
            message: `Bulk add paycodes (created: ${created.length}, skipped: ${skipped.length})`,
            meta: { createdCount: created.length, skippedCount: skipped.length },
        });

        res.json({ createdCount: created.length, skippedCount: skipped.length, created, skipped });
    } catch (e) {
        res.status(500).json({ message: "Failed to bulk add paycodes", error: e.message });
    }
});

export default router;
