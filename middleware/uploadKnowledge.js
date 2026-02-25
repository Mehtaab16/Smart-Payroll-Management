import multer from "multer";
import path from "path";
import fs from "fs";

const dir = path.join(process.cwd(), "server", "uploads", "knowledge");
fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
        const safe = (file.originalname || "doc").replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${Date.now()}_${safe}`);
    },
});

function fileFilter(req, file, cb) {
    const ok = [
        "application/pdf",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
    ].includes(file.mimetype);

    if (!ok) return cb(new Error("Unsupported file type. Only PDF, DOCX, TXT allowed."));
    cb(null, true);
}

export const uploadKnowledgeDoc = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
}).single("file");
