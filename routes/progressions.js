import express from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

import { authRequired } from "../middleware/auth.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import CvFile from "../models/CvFile.js";
import CertificateFile from "../models/CertificateFile.js";
import AuditLog from "../models/AuditLog.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

function ensureDbReady() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("Database not connected. Check MongoDB / MONGO_URI and restart backend.");
    }
}

function requireBackOffice(req) {
    const role = req.user?.role;
    if (!["admin", "payroll_manager"].includes(role)) {
        const err = new Error("Forbidden");
        err.status = 403;
        throw err;
    }
}

function safeUnlink(absPath) {
    try {
        if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch { }
}

async function writeLog({ req, action, message, entityId = "", meta = {} }) {
    try {
        await AuditLog.create({
            actorId: req.user.actorId || req.user.userId,
            actorRole: req.user.actorRole || req.user.role,
            subjectId: req.user.userId,
            module: "progressions",
            action,
            entityId: entityId ? String(entityId) : "",
            message: message || "",
            meta,
        });
    } catch { }
}

// Upload config 
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function makeStorage(folder) {
    const dest = path.join(UPLOADS_ROOT, folder);
    fs.mkdirSync(dest, { recursive: true });

    return multer.diskStorage({
        destination: (_, __, cb) => cb(null, dest),
        filename: (_, file, cb) => {
            const ext = path.extname(file.originalname || "");
            const base = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `${base}${ext}`);
        },
    });
}

const cvUpload = multer({
    storage: makeStorage("cvs"),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_, file, cb) => {
        const ok = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ].includes(file.mimetype);
        cb(ok ? null : new Error("Only PDF/DOC/DOCX are allowed for CV."), ok);
    },
});

const certUpload = multer({
    storage: makeStorage("certificates"),
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_, file, cb) => {
        const ok = ["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype);
        cb(ok ? null : new Error("Only PDF/PNG/JPG are allowed for certificates."), ok);
    },
});

router.get("/ping", (req, res) => res.json({ ok: true, msg: "progressions route alive" }));

// Projects (Employee) 

router.get("/projects/mine", authRequired, async (req, res) => {
    try {
        ensureDbReady();
        const list = await Project.find({ employee: req.user.userId }).sort({ createdAt: -1 }).lean();
        res.json(
            list.map((p) => ({
                id: p._id,
                name: p.name,
                status: p.status,
                priority: p.priority,
                dueDate: p.dueDate,
                description: p.description || "",
                createdAt: p.createdAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load projects" });
    }
});

router.post("/projects", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const { name, status = "not_started", priority = "low", dueDate = null, description = "" } = req.body;
        if (!String(name || "").trim()) return res.status(400).json({ message: "Project name is required." });

        const doc = await Project.create({
            employee: req.user.userId,
            name: String(name).trim(),
            status,
            priority,
            dueDate: dueDate ? new Date(dueDate) : null,
            description,
        });

        await writeLog({
            req,
            action: "CREATE",
            entityId: doc._id,
            message: "Created project",
            meta: { name: doc.name, status: doc.status, priority: doc.priority },
        });

        res.status(201).json({
            id: doc._id,
            name: doc.name,
            status: doc.status,
            priority: doc.priority,
            dueDate: doc.dueDate,
            description: doc.description || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to create project" });
    }
});

router.put("/projects/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const doc = await Project.findOne({ _id: req.params.id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Project not found" });

        const before = { name: doc.name, status: doc.status, priority: doc.priority, dueDate: doc.dueDate, description: doc.description };

        if (req.body.name !== undefined) doc.name = String(req.body.name || "").trim();
        if (req.body.status !== undefined) doc.status = req.body.status;
        if (req.body.priority !== undefined) doc.priority = req.body.priority;
        if (req.body.dueDate !== undefined) doc.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        if (req.body.description !== undefined) doc.description = req.body.description;

        if (!doc.name) return res.status(400).json({ message: "Project name is required." });

        await doc.save();

        await writeLog({
            req,
            action: "UPDATE",
            entityId: doc._id,
            message: "Updated project",
            meta: { before, after: { name: doc.name, status: doc.status, priority: doc.priority, dueDate: doc.dueDate, description: doc.description } },
        });

        res.json({
            id: doc._id,
            name: doc.name,
            status: doc.status,
            priority: doc.priority,
            dueDate: doc.dueDate,
            description: doc.description || "",
            createdAt: doc.createdAt,
        });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to update project" });
    }
});

router.delete("/projects/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const doc = await Project.findOne({ _id: req.params.id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Project not found" });

        await Project.deleteOne({ _id: doc._id });

        await writeLog({
            req,
            action: "DELETE",
            entityId: doc._id,
            message: "Deleted project",
            meta: { name: doc.name },
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to delete project" });
    }
});

// CV (Employee) 

router.get("/cv", authRequired, async (req, res) => {
    try {
        ensureDbReady();
        const cv = await CvFile.findOne({ employee: req.user.userId }).lean();
        if (!cv) return res.json(null);

        res.json({
            id: cv._id,
            originalName: cv.originalName,
            mimeType: cv.mimeType,
            size: cv.size,
            url: cv.path,
            uploadedAt: cv.uploadedAt,
        });
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load CV" });
    }
});

router.post("/cv", authRequired, cvUpload.single("file"), async (req, res) => {
    try {
        ensureDbReady();
        if (!req.file) return res.status(400).json({ message: "File is required." });

        const relPath = `/uploads/cvs/${req.file.filename}`;

        const existing = await CvFile.findOne({ employee: req.user.userId });
        const replaced = !!existing;

        if (existing) {
            const absOld = path.join(process.cwd(), existing.path.replace(/^\/+/, ""));
            safeUnlink(absOld);
            await CvFile.deleteOne({ _id: existing._id });
        }

        const doc = await CvFile.create({
            employee: req.user.userId,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            path: relPath,
            filename: req.file.filename,
            uploadedAt: new Date(),
        });

        await writeLog({
            req,
            action: replaced ? "UPDATE" : "UPLOAD",
            entityId: doc._id,
            message: replaced ? "Replaced CV" : "Uploaded CV",
            meta: { originalName: doc.originalName, size: doc.size },
        });

        res.status(201).json({
            id: doc._id,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            size: doc.size,
            url: doc.path,
            uploadedAt: doc.uploadedAt,
        });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to upload CV" });
    }
});

// Certificates (Employee) 

router.get("/certificates/mine", authRequired, async (req, res) => {
    try {
        ensureDbReady();
        const list = await CertificateFile.find({ employee: req.user.userId }).sort({ createdAt: -1 }).lean();
        res.json(
            list.map((c) => ({
                id: c._id,
                title: c.title || "",
                originalName: c.originalName,
                mimeType: c.mimeType,
                size: c.size,
                url: c.path,
                uploadedAt: c.uploadedAt,
            }))
        );
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load certificates" });
    }
});

router.post("/certificates", authRequired, certUpload.single("file"), async (req, res) => {
    try {
        ensureDbReady();
        if (!req.file) return res.status(400).json({ message: "File is required." });

        const relPath = `/uploads/certificates/${req.file.filename}`;

        const doc = await CertificateFile.create({
            employee: req.user.userId,
            title: String(req.body.title || ""),
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            path: relPath,
            filename: req.file.filename,
            uploadedAt: new Date(),
        });

        await writeLog({
            req,
            action: "UPLOAD",
            entityId: doc._id,
            message: "Uploaded certificate",
            meta: { title: doc.title || "", originalName: doc.originalName },
        });

        res.status(201).json({
            id: doc._id,
            title: doc.title || "",
            originalName: doc.originalname,
            mimeType: doc.mimetype,
            size: doc.size,
            url: doc.path,
            uploadedAt: doc.uploadedAt,
        });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to upload certificate" });
    }
});

router.delete("/certificates/:id", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const doc = await CertificateFile.findOne({ _id: req.params.id, employee: req.user.userId });
        if (!doc) return res.status(404).json({ message: "Certificate not found" });

        const abs = path.join(process.cwd(), doc.path.replace(/^\/+/, ""));
        safeUnlink(abs);

        await CertificateFile.deleteOne({ _id: doc._id });

        await writeLog({
            req,
            action: "DELETE",
            entityId: doc._id,
            message: "Deleted certificate",
            meta: { title: doc.title || "", originalName: doc.originalName },
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ message: e.message || "Failed to delete certificate" });
    }
});

//Summary (Employee) 
router.get("/summary", authRequired, async (req, res) => {
    try {
        ensureDbReady();

        const [projectsTotal, cvExists, certCount] = await Promise.all([
            Project.countDocuments({ employee: req.user.userId }),
            CvFile.exists({ employee: req.user.userId }),
            CertificateFile.countDocuments({ employee: req.user.userId }),
        ]);

        res.json({
            projectsTotal,
            hasCv: !!cvExists,
            certificatesTotal: certCount,
        });
    } catch (e) {
        res.status(500).json({ message: e.message || "Failed to load summary" });
    }
});

// Backoffice (Admin / Payroll Manager) 

// dropdown list for employee selection
router.get("/backoffice/employees", authRequired, async (req, res) => {
    try {
        ensureDbReady();
        requireBackOffice(req);

        const list = await User.find({
            role: { $nin: ["admin", "payroll_manager"] }, 
        })
            .select("fullName name email employeeNumber role")
            .sort({ employeeNumber: 1, fullName: 1, name: 1 })
            .lean();

        res.json(
            list.map((u) => ({
                id: u._id,
                name: u.fullName || u.name || "Employee",
                email: u.email || "",
                employeeNumber: u.employeeNumber || "",
                role: u.role || "",
            }))
        );
    } catch (e) {
        res.status(e.status || 500).json({ message: e.message || "Failed to load employees" });
    }
});

// fetch a single employee's full progression data
router.get("/backoffice/:employeeId", authRequired, async (req, res) => {
    try {
        ensureDbReady();
        requireBackOffice(req);

        const { employeeId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: "Invalid employee id" });
        }

        const [emp, projects, cv, certs] = await Promise.all([
            User.findById(employeeId).select("fullName name email employeeNumber").lean(),
            Project.find({ employee: employeeId }).sort({ createdAt: -1 }).lean(),
            CvFile.findOne({ employee: employeeId }).lean(),
            CertificateFile.find({ employee: employeeId }).sort({ createdAt: -1 }).lean(),
        ]);

        if (!emp) return res.status(404).json({ message: "Employee not found" });

        res.json({
            employee: {
                id: emp._id,
                name: emp.fullName || emp.name || "Employee",
                email: emp.email || "",
                employeeNumber: emp.employeeNumber || "",
            },
            summary: {
                projectsTotal: projects.length,
                hasCv: !!cv,
                certificatesTotal: certs.length,
            },
            projects: projects.map((p) => ({
                id: p._id,
                name: p.name,
                status: p.status,
                priority: p.priority,
                dueDate: p.dueDate,
                description: p.description || "",
                createdAt: p.createdAt,
            })),
            cv: cv
                ? {
                    id: cv._id,
                    originalName: cv.originalName,
                    mimeType: cv.mimeType,
                    size: cv.size,
                    url: cv.path,
                    uploadedAt: cv.uploadedAt,
                }
                : null,
            certificates: certs.map((c) => ({
                id: c._id,
                title: c.title || "",
                originalName: c.originalName,
                mimeType: c.mimeType,
                size: c.size,
                url: c.path,
                uploadedAt: c.uploadedAt,
            })),
        });
    } catch (e) {
        res.status(e.status || 500).json({ message: e.message || "Failed to load employee progressions" });
    }
});

export default router;
