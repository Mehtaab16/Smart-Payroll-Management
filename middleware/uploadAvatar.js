// middleware/uploadAvatar.js
import multer from "multer";
import path from "path";
import fs from "fs";

const dir = path.join(process.cwd(), "uploads", "avatars");
fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
        cb(null, dir);
    },
    filename: function (_req, file, cb) {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
        const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
        cb(null, `avatar_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`);
    },
});

function fileFilter(_req, file, cb) {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
}

export const uploadAvatar = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
