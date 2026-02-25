import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import { sendEmployeeWelcomeEmail } from "../utils/mailer.js";

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
    return `Emp@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
}

async function writeLog({ req, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "employees",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

function addMonths(d, months) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + months);
    return x;
}

/**
 * CSV parser:
 * Handles BOM
 * Supports quoted values with commas
 * Normalizes headers to exact keys: fullName,email,department
 */
function parseCsvText(csvText = "") {
    const raw = String(csvText || "")
        .replace(/^\uFEFF/, "")
        .trim();

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
        if (h === "fullname" || h === "full_name" || h === "name") return "fullName";
        if (h === "email" || h === "mail") return "email";
        if (h === "department" || h === "dept") return "department";
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

// Health 
router.get("/ping", (req, res) => res.json({ ok: true, msg: "employees route alive" }));

// List employees (Admin + PM)
router.get("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const list = await User.find({ role: "employee" })
            .select(
                "fullName email employeeId department isActive profilePhotoUrl bankDetails employmentType employmentStatus hireDate terminationDate rehireDate accessRevokedAt createdAt updatedAt"
            )
            .sort({ createdAt: -1 })
            .lean();

        res.json(
            list.map((u) => ({
                id: u._id,
                fullName: u.fullName,
                email: u.email,
                employeeId: u.employeeId || "",
                department: u.department || "",
                isActive: !!u.isActive,
                profilePhotoUrl: u.profilePhotoUrl || "",
                bankDetails: u.bankDetails || {},

                employmentType: u.employmentType || "permanent",
                employmentStatus: u.employmentStatus || "active",
                hireDate: u.hireDate || null,
                terminationDate: u.terminationDate || null,
                rehireDate: u.rehireDate || null,
                accessRevokedAt: u.accessRevokedAt || null,

                createdAt: u.createdAt,
                updatedAt: u.updatedAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load employees" });
    }
});

// Create employee (Admin + PM) 
router.post("/", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const {
            fullName,
            email,
            department = "",
            bankDetails = {},
            password,

            employmentType = "permanent",
            hireDate = null,
        } = req.body;

        if (!String(fullName || "").trim()) return res.status(400).json({ message: "fullName is required" });
        const em = normEmail(email);
        if (!em) return res.status(400).json({ message: "email is required" });

        const exists = await User.findOne({ email: em });
        if (exists) return res.status(400).json({ message: "Email already exists" });

        const tempPass = password || makeTempPassword();
        const passwordHash = await bcrypt.hash(tempPass, 10);

        const user = await User.create({
            fullName: String(fullName).trim(),
            email: em,
            passwordHash,
            role: "employee",
            isActive: true,
            department: String(department || "").trim(),
            bankDetails: bankDetails || {},

            employmentType,
            employmentStatus: "active",
            hireDate: hireDate ? new Date(hireDate) : null,
        });

        await sendEmployeeWelcomeEmail({
            to: user.email,
            fullName: user.fullName,
            tempPassword: tempPass,
        });

        await writeLog({
            req,
            action: "CREATE",
            entityId: user._id,
            message: `Created employee (${user.email})`,
            meta: { fullName: user.fullName, email: user.email, employeeId: user.employeeId || "", employmentType: user.employmentType },
        });

        res.status(201).json({
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            employeeId: user.employeeId || "",
            department: user.department || "",
            isActive: user.isActive,
            tempPassword: tempPass,

            employmentType: user.employmentType || "permanent",
            employmentStatus: user.employmentStatus || "active",
            hireDate: user.hireDate || null,
            terminationDate: user.terminationDate || null,
            rehireDate: user.rehireDate || null,
            accessRevokedAt: user.accessRevokedAt || null,
        });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to create employee" });
    }
});

// Update employee (Admin + PM) 
router.put("/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const emp = await User.findOne({ _id: req.params.id, role: "employee" });
        if (!emp) return res.status(404).json({ message: "Employee not found" });

        const before = {
            fullName: emp.fullName,
            department: emp.department,
            isActive: emp.isActive,
            bankDetails: emp.bankDetails,
            profilePhotoUrl: emp.profilePhotoUrl,

            employmentType: emp.employmentType,
            employmentStatus: emp.employmentStatus,
            hireDate: emp.hireDate,
            terminationDate: emp.terminationDate,
            rehireDate: emp.rehireDate,
            accessRevokedAt: emp.accessRevokedAt,
        };

        const {
            fullName,
            department,
            bankDetails,
            profilePhotoUrl,
            isActive,

            employmentType,
            employmentStatus,
            hireDate,
            terminationDate,
            rehireDate,
            accessRevokedAt,
        } = req.body;

        if (fullName !== undefined) emp.fullName = String(fullName || "").trim();
        if (!emp.fullName) return res.status(400).json({ message: "fullName is required" });

        if (department !== undefined) emp.department = String(department || "").trim();
        if (bankDetails !== undefined) emp.bankDetails = bankDetails || {};
        if (profilePhotoUrl !== undefined) emp.profilePhotoUrl = String(profilePhotoUrl || "").trim();
        if (isActive !== undefined) emp.isActive = !!isActive;

        if (employmentType !== undefined) emp.employmentType = employmentType;
        if (employmentStatus !== undefined) emp.employmentStatus = employmentStatus;

        if (hireDate !== undefined) emp.hireDate = hireDate ? new Date(hireDate) : null;
        if (terminationDate !== undefined) emp.terminationDate = terminationDate ? new Date(terminationDate) : null;
        if (rehireDate !== undefined) emp.rehireDate = rehireDate ? new Date(rehireDate) : null;
        if (accessRevokedAt !== undefined) emp.accessRevokedAt = accessRevokedAt ? new Date(accessRevokedAt) : null;

        await emp.save();

        await writeLog({
            req,
            action: "UPDATE",
            entityId: emp._id,
            message: `Updated employee (${emp.email})`,
            meta: { before, after: { fullName: emp.fullName, department: emp.department, isActive: emp.isActive, employmentType: emp.employmentType, employmentStatus: emp.employmentStatus } },
        });

        res.json({
            id: emp._id,
            fullName: emp.fullName,
            email: emp.email,
            employeeId: emp.employeeId || "",
            department: emp.department || "",
            isActive: !!emp.isActive,
            bankDetails: emp.bankDetails || {},
            profilePhotoUrl: emp.profilePhotoUrl || "",

            employmentType: emp.employmentType || "permanent",
            employmentStatus: emp.employmentStatus || "active",
            hireDate: emp.hireDate || null,
            terminationDate: emp.terminationDate || null,
            rehireDate: emp.rehireDate || null,
            accessRevokedAt: emp.accessRevokedAt || null,
        });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to update employee" });
    }
});

// Deactivate employee (Admin + PM)
router.delete("/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const emp = await User.findOne({ _id: req.params.id, role: "employee" });
        if (!emp) return res.status(404).json({ message: "Employee not found" });

        emp.isActive = false;
        await emp.save();

        await writeLog({
            req,
            action: "DEACTIVATE",
            entityId: emp._id,
            message: `Deactivated employee (${emp.email})`,
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to deactivate employee" });
    }
});

// Activate employee (Admin + PM)
router.post("/:id/activate", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const emp = await User.findOne({ _id: req.params.id, role: "employee" });
        if (!emp) return res.status(404).json({ message: "Employee not found" });

        emp.isActive = true;
        await emp.save();

        await writeLog({
            req,
            action: "ACTIVATE",
            entityId: emp._id,
            message: `Activated employee (${emp.email})`,
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to activate employee" });
    }
});

//Terminate employee (Admin + PM) 
router.post("/:id/terminate", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const emp = await User.findOne({ _id: req.params.id, role: "employee" });
        if (!emp) return res.status(404).json({ message: "Employee not found" });

        const td = req.body?.terminationDate ? new Date(req.body.terminationDate) : new Date();
        if (Number.isNaN(td.getTime())) return res.status(400).json({ message: "Invalid terminationDate" });

        emp.employmentStatus = "terminated";
        emp.terminationDate = td;
        emp.accessRevokedAt = addMonths(td, 3);

        await emp.save();

        await writeLog({
            req,
            action: "TERMINATE",
            entityId: emp._id,
            message: `Terminated employee (${emp.email})`,
            meta: { terminationDate: emp.terminationDate, accessRevokedAt: emp.accessRevokedAt },
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to terminate employee" });
    }
});

// Rehire employee (Admin + PM) 
router.post("/:id/rehire", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const emp = await User.findOne({ _id: req.params.id, role: "employee" });
        if (!emp) return res.status(404).json({ message: "Employee not found" });

        const rd = req.body?.rehireDate ? new Date(req.body.rehireDate) : new Date();
        if (Number.isNaN(rd.getTime())) return res.status(400).json({ message: "Invalid rehireDate" });

        emp.employmentStatus = "active";
        emp.rehireDate = rd;
        emp.terminationDate = null;
        emp.accessRevokedAt = null;

        // also reactivate
        emp.isActive = true;

        await emp.save();

        await writeLog({
            req,
            action: "REHIRE",
            entityId: emp._id,
            message: `Rehired employee (${emp.email})`,
            meta: { rehireDate: emp.rehireDate },
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to rehire employee" });
    }
});

// GET /api/employees/delegates  ( list for delegate dropdown)
router.get("/delegates", authRequired, async (req, res) => {
    try {
        
        const rows = await User.find({ role: "employee", isActive: { $ne: false } })
            .select("_id fullName name email employeeNumber employeeId")
            .sort({ fullName: 1, name: 1, email: 1 })
            .lean();

        const out = (rows || []).map((u) => ({
            id: String(u._id),
            fullName: u.fullName || u.name || "",
            email: u.email || "",
            employeeNumber: u.employeeNumber || u.employeeId || "",
        }));

        return res.json(out);
    } catch (e) {
        return res.status(500).json({ message: "Failed to load delegates" });
    }
});

// Bulk add (Admin + PM) 
router.post("/bulk", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const { csvText } = req.body;
        const rows = parseCsvText(csvText);

        if (!rows.length) return res.status(400).json({ message: "No rows found in CSV" });

        const created = [];
        const skipped = [];

        for (const r of rows) {
            const fullName = String(r.fullName || "").trim();
            const email = normEmail(r.email);
            const department = String(r.department || "").trim();

            if (!fullName || !email) {
                skipped.push({ row: r, reason: "Missing fullName or email" });
                continue;
            }

            const exists = await User.findOne({ email });
            if (exists) {
                skipped.push({ row: r, reason: "Email already exists" });
                continue;
            }

            const tempPass = makeTempPassword();
            const passwordHash = await bcrypt.hash(tempPass, 10);

            const user = await User.create({
                fullName,
                email,
                passwordHash,
                role: "employee",
                isActive: true,
                department,
            });

            created.push({
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                employeeId: user.employeeId || "",
                department: user.department || "",
                tempPassword: tempPass,
            });
        }

        await writeLog({
            req,
            action: "BULK_CREATE",
            message: `Bulk add employees (created: ${created.length}, skipped: ${skipped.length})`,
            meta: { createdCount: created.length, skippedCount: skipped.length },
        });

        res.json({ createdCount: created.length, skippedCount: skipped.length, created, skipped });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to bulk add employees" });
    }
});

export default router;
