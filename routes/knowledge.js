import express from "express";
import KnowledgeDocument from "../models/KnowledgeDocument.js";
import KnowledgeSettings from "../models/KnowledgeSettings.js";
import { uploadKnowledgeDoc } from "../middleware/uploadKnowledge.js";

import OpenAI from "openai";
import KnowledgeChat from "../models/KnowledgeChat.js";
import { retrieveTopChunks } from "../services/knowledgeRetrieval.js";
import { withRetry } from "../utils/openaiRetry.js";
import SupportTicket from "../models/SupportTicket.js";



import fs from "fs";
import path from "path";


import { authRequired, requireAnyRole, requireRole } from "../middleware/auth.js";

const router = express.Router();

function pickRouteTeam({ question, settings }) {
    const q = String(question || "").toLowerCase();

    const payroll = (settings?.routingRules?.payrollKeywords || []).map((x) => String(x).toLowerCase());
    const tech = (settings?.routingRules?.technicalKeywords || []).map((x) => String(x).toLowerCase());

    const payrollHits = payroll.filter((k) => k && q.includes(k)).length;
    const techHits = tech.filter((k) => k && q.includes(k)).length;

    if (techHits > payrollHits) return "technical";
    return "payroll";
}


// Settings (Admin only) 
router.get("/settings", authRequired, requireRole("admin"), async (req, res) => {
    let s = await KnowledgeSettings.findOne();
    if (!s) s = await KnowledgeSettings.create({});
    res.json(s);
});

router.put("/settings", authRequired, requireRole("admin"), async (req, res) => {
    let s = await KnowledgeSettings.findOne();
    if (!s) s = await KnowledgeSettings.create({});

    const body = req.body || {};

    if ("allowedCategories" in body) s.allowedCategories = body.allowedCategories;
    if ("allowPmUploads" in body) s.allowPmUploads = body.allowPmUploads;

    if ("escalation" in body) {
        const next = { ...(s.escalation || {}), ...(body.escalation || {}) };

        if (typeof next.minSimilarity === "number") {
            // clamp to [0, 1]
            next.minSimilarity = Math.max(0, Math.min(1, next.minSimilarity));
        }

        s.escalation = next;
    }

    if ("routingRules" in body) {
        const rr = { ...(s.routingRules || {}), ...(body.routingRules || {}) };

        rr.payrollKeywords = Array.isArray(rr.payrollKeywords) ? rr.payrollKeywords : [];
        rr.technicalKeywords = Array.isArray(rr.technicalKeywords) ? rr.technicalKeywords : [];

        // defaults if empty
        if (!rr.payrollKeywords.length) rr.payrollKeywords = ["payslip", "salary", "tax", "deduction", "allowance", "paycode", "leave balance"];
        if (!rr.technicalKeywords.length) rr.technicalKeywords = ["login", "password", "error", "cannot", "access", "timeout", "bug"];

        s.routingRules = rr;
    }


    await s.save();
    res.json(s);
});

router.delete(
    "/docs/:id",
    authRequired,
    requireAnyRole(["admin", "payroll_manager"]),
    async (req, res) => {
        const doc = await KnowledgeDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: "Not found" });

        // remove file from disk (if exists)
        try {
            if (doc.storedFilename) {
                const p = path.join(process.cwd(), "server", "uploads", "knowledge", doc.storedFilename);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
        } catch {
            // do not block deletion if file missing
        }

        // await KnowledgeChunk.deleteMany({ documentId: doc._id });

        await KnowledgeDocument.deleteOne({ _id: doc._id });

        res.json({ ok: true });
    }
);


// Documents (Admin + PM) 
router.get("/docs", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    const docs = await KnowledgeDocument.find().sort({ createdAt: -1 });
    res.json(docs);
});

router.post("/docs", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    // enforce PM upload setting
    if (req.user?.role === "payroll_manager") {
        const s = await KnowledgeSettings.findOne();
        const allow = s ? s.allowPmUploads !== false : true;
        if (!allow) return res.status(403).json({ message: "PM uploads are disabled" });
    }

    uploadKnowledgeDoc(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err.message || "Upload failed" });
        if (!req.file) return res.status(400).json({ message: "File is required" });

        const { title, category, tags } = req.body || {};
        const cat = String(category || "").trim().toLowerCase();
        if (!cat) return res.status(400).json({ message: "Category is required" });

        const doc = await KnowledgeDocument.create({
            title: title || req.file.originalname,
            category: cat,
            tags: typeof tags === "string" ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
            uploadedBy: { userId: req.user?.userId, role: req.user?.role },
            status: "pending",
            isActive: true,
            originalFilename: req.file.originalname,
            storedFilename: req.file.filename,
            mimeType: req.file.mimetype,
            size: req.file.size,
        });

        res.json(doc);
    });
});

router.post("/chat", authRequired, async (req, res) => {
    try {
        const question = String(req.body?.question || "").trim();
        if (!question) return res.status(400).json({ message: "Question is required" });

        // load settings (threshold + routing keywords)
        let settings = await KnowledgeSettings.findOne();
        if (!settings) settings = await KnowledgeSettings.create({});

        const routeTeam = pickRouteTeam({ question, settings });

        const r = await retrieveTopChunks({ query: question, topK: 6 });

        // Out-of-scope
        if (!r.inScope || !r.results.length) {
            const text =
                "I can only help with AutoPay and internal topics like payroll, leave, overtime, HR/IT policies and system support. Please ask a question related to the system or company policies.";

            await KnowledgeChat.findOneAndUpdate(
                { userId: req.user.userId },
                {
                    $set: {
                        userRole: req.user.role,
                        lastTopScore: r.topScore || 0,
                        lastConfidence: 0,
                        status: "needs_help",
                        lastRouteTeam: routeTeam,
                    },
                    $push: {
                        messages: { $each: [{ role: "user", text: question }, { role: "assistant", text }], $slice: -40 },
                    },
                },
                { upsert: true, new: true }
            );

            return res.json({
                answer: text,
                confidence: 0,
                sources: [],
                inScope: false,
                suggestTicket: true,
                routeTeam, 
            });
        }

        const topScore = r.topScore || 0;

        // use settings threshold if set; fallback to r.minSimilarity; fallback 0.75
        const threshold =
            typeof settings?.escalation?.minSimilarity === "number"
                ? settings.escalation.minSimilarity
                : typeof r.minSimilarity === "number"
                    ? r.minSimilarity
                    : 0.75;

        // Confidence heuristic 
        const confidence = Math.max(0, Math.min(1, (topScore - 0.45) / 0.45));
        const suggestTicket = topScore < threshold;

        // include text so employee UI can preview sources
        const sources = r.results.slice(0, 4).map((x) => ({
            docTitle: x.docTitle,
            category: x.category,
            score: x.score,
            text: x.text, 
        }));

        const context = r.results
            .map(
                (x, idx) =>
                    `Source ${idx + 1} (Category: ${x.category}, Doc: ${x.docTitle}, Score: ${x.score.toFixed(3)}):\n${x.text}`
            )
            .join("\n\n---\n\n");

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await withRetry(() =>
            client.chat.completions.create({
                model: "gpt-5-mini",
                messages: [
                    { role: "system", content: "You are AutoPay Knowledge Hub..." },
                    { role: "user", content: `Question:\n${question}\n\nSources:\n${context}` },
                ],
            })
        );

        const answer = completion.choices?.[0]?.message?.content?.trim() || "I could not generate an answer.";

        await KnowledgeChat.findOneAndUpdate(
            { userId: req.user.userId },
            {
                $set: {
                    userRole: req.user.role,
                    lastTopScore: topScore,
                    lastConfidence: confidence,
                    lastSources: sources,
                    lastRouteTeam: routeTeam, 
                    status: suggestTicket ? "needs_help" : "open",
                },
                $push: {
                    messages: { $each: [{ role: "user", text: question }, { role: "assistant", text: answer }], $slice: -40 },
                },
            },
            { upsert: true, new: true }
        );

        return res.json({
            answer,
            confidence,
            sources,
            inScope: true,
            suggestTicket,
            routeTeam, 
        });
    } catch (e) {
        return res.status(500).json({ message: e?.message || "Chat failed" });
    }
});


router.patch("/docs/:id", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};

    const allowed = {};
    if ("isActive" in patch) allowed.isActive = patch.isActive;
    if ("title" in patch) allowed.title = patch.title;
    if ("category" in patch)
        allowed.category = String(patch.category || "").trim().toLowerCase();

    if ("tags" in patch) allowed.tags = patch.tags;

    const doc = await KnowledgeDocument.findByIdAndUpdate(id, allowed, { new: true });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
});

router.post("/docs/:id/reprocess", authRequired, requireAnyRole(["admin", "payroll_manager"]), async (req, res) => {
    const doc = await KnowledgeDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });

    doc.status = "pending";
    doc.error = "";
    await doc.save();

    res.json({ ok: true, doc });
});

export default router;
