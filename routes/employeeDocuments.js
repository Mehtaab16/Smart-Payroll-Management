// routes/employeeDocuments.js
import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import multer from "multer";

import { authRequired, requireAnyRole } from "../middleware/auth.js";
import EmployeeDocument from "../models/EmployeeDocuments.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { sendEmployeeDocumentEmail } from "../utils/mailer.js";


const router = express.Router();

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const DOC_FOLDER = "employee-docs";

function ensureDbReady() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Database not connected. Check MongoDB / MONGO_URI and restart backend.");
    }
}

async function writeLog({ req, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "employee_documents",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

function safeUnlink(absPath) {
    try {
        if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch { }
}

const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const storage = multer.diskStorage({
    destination: (_, __, cb) => {
        const dest = path.join(UPLOADS_ROOT, DOC_FOLDER);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (_, file, cb) => {
        const ext = path.extname(file.originalname || "");
        const base = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${base}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_, file, cb) => {
        const ok = ["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype);
        cb(ok ? null : new Error("Only PDF/PNG/JPG are allowed."), ok);
    },
});

// Health 
router.get("/ping", (req, res) => res.json({ ok: true, msg: "employee-documents route alive" }));

// Upload document for 1 or MANY employees 
router.post(
    "/",
    authRequired,
    requireAnyRole(["admin", "payroll_manager"]),
    upload.single("file"),
    async (req, res) => {
        try {
            ensureDbReady();
            if (!req.file) return res.status(400).json({ message: "file is required" });

            const { title, category = "other", period = "", employeeIds } = req.body;

            if (!String(title || "").trim()) return res.status(400).json({ message: "title is required" });
            if (!employeeIds) return res.status(400).json({ message: "employeeIds is required" });

            let ids = [];
            try {
                ids = Array.isArray(employeeIds) ? employeeIds : JSON.parse(employeeIds);
            } catch {
                ids = [employeeIds];
            }
            ids = ids.map(String).filter(Boolean);

            if (!ids.length) return res.status(400).json({ message: "No employeeIds provided" });

            const relPath = `/uploads/${DOC_FOLDER}/${req.file.filename}`;

            const created = [];
            for (const empId of ids) {
                const doc = await EmployeeDocument.create({
                    employee: empId,
                    category,
                    title: String(title).trim(),
                    period: String(period || ""),
                    originalName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    path: relPath,
                    filename: req.file.filename,
                    uploadedAt: new Date(),
                    uploadedBy: req.user.userId,
                });

                //notify employee by email
                try {
                    const emp = await User.findById(empId).select("email fullName").lean();
                    if (emp?.email) {
                        await sendEmployeeDocumentEmail({
                            to: emp.email,
                            fullName: emp.fullName || "Employee",
                            title: String(title).trim(),
                            category,
                        });
                    }
                } catch { }

                created.push({
                    id: doc._id,
                    employee: doc.employee,
                    title: doc.title,
                    category: doc.category,
                    period: doc.period,
                    url: doc.path,
                    uploadedAt: doc.uploadedAt,
                });
            }

            await writeLog({
                req,
                action: "UPLOAD",
                message: `Uploaded "${String(title).trim()}" for ${created.length} employee(s)`,
                meta: { title: String(title).trim(), category, period, employeeCount: created.length, file: req.file.originalname },
            });

            res.status(201).json({ ok: true, createdCount: created.length, created });
        } catch (e) {
            res.status(400).json({ message: e.message || "Failed to upload document" });
        }
    }
);

// Employee sees their docs
router.get("/mine", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const list = await EmployeeDocument.find({ employee: req.user.userId }).sort({ createdAt: -1 }).lean();

        res.json(
            list.map((d) => ({
                id: d._id,
                category: d.category,
                title: d.title,
                period: d.period || "",
                originalName: d.originalName,
                mimeType: d.mimeType,
                size: d.size,
                url: d.path,
                uploadedAt: d.uploadedAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load documents" });
    }
});

// Admin/PM list docs for one employee 
router.get("/by-employee/:employeeId", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const list = await EmployeeDocument.find({ employee: req.params.employeeId }).sort({ createdAt: -1 }).lean();

        res.json(
            list.map((d) => ({
                id: d._id,
                category: d.category,
                title: d.title,
                period: d.period || "",
                originalName: d.originalName,
                mimeType: d.mimeType,
                size: d.size,
                url: d.path,
                uploadedAt: d.uploadedAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load documents" });
    }
});

// Delete a doc 
router.delete("/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    try {
        ensureDbReady();

        const doc = await EmployeeDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Document not found" });

        const abs = path.join(process.cwd(), doc.path.replace(/^\/+/, ""));
        safeUnlink(abs);

        await EmployeeDocument.deleteOne({ _id: doc._id });

        await writeLog({
            req,
            action: "DELETE",
            entityId: doc._id,
            message: `Deleted employee document "${doc.title}"`,
            meta: { title: doc.title, employee: String(doc.employee), url: doc.path },
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to delete document" });
    }
});

export default router;
