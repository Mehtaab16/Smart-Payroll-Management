
import express from "express";
import CompanySettings from "../models/CompanySettings.js";
import { authRequired, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/company (any logged-in user can read)
router.get("/", authRequired, async (req, res) => {
    const settings = await CompanySettings.findOne().sort({ createdAt: -1 });
    res.json(settings || null);
});

// POST /api/company (admin only - create/update)
router.post("/", authRequired, requireRole("admin"), async (req, res) => {
    const { companyName, companyAddress, companyPhone, companyEmail, logoUrl } = req.body;

    if (!companyName || !companyAddress) {
        return res.status(400).json({ message: "companyName and companyAddress are required" });
    }

    // keep only one latest settings document
    const created = await CompanySettings.create({
        companyName,
        companyAddress,
        companyPhone,
        companyEmail,
        logoUrl,
    });

    res.status(201).json(created);
});

export default router;
