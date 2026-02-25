import KnowledgeChunk from "../models/KnowledgeChunk.js";
import KnowledgeDocument from "../models/KnowledgeDocument.js";
import KnowledgeSettings from "../models/KnowledgeSettings.js";
import { embedTexts } from "../utils/embeddings.js";

function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}
function norm(a) {
    return Math.sqrt(dot(a, a));
}
function cosine(a, b) {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return 0;
    return dot(a, b) / (na * nb);
}

export async function retrieveTopChunks({ query, topK = 6 }) {
    const q = String(query || "").trim();
    if (!q) return { inScope: false, results: [] };

    // settings (allowed categories + threshold)
    let settings = await KnowledgeSettings.findOne();
    if (!settings) settings = await KnowledgeSettings.create({});

    const allowedCategoriesRaw =
        settings.allowedCategories || ["payroll", "leave", "overtime", "it", "hr", "system"];

    const allowedCategories = allowedCategoriesRaw
        .map((c) => String(c || "").trim().toLowerCase())
        .filter(Boolean);


    // embed query
    const [qVec] = await embedTexts([q], { model: "text-embedding-3-small" });
    if (!qVec) return { inScope: false, results: [] };

    // only active + ready docs
    const activeDocs = await KnowledgeDocument.find(
        {
            status: "ready",
            $or: [{ isActive: true }, { isActive: { $exists: false } }],
        },
        { _id: 1 }
    ).lean();

    const activeDocIds = activeDocs.map((d) => d._id);

    // pull candidate chunks (limit to keep it fast)
    const candidates = await KnowledgeChunk.find(
        { documentId: { $in: activeDocIds }, category: { $in: allowedCategories }, embedding: { $exists: true } },
        { text: 1, docTitle: 1, category: 1, tags: 1, embedding: 1, documentId: 1, chunkIndex: 1 }
    )
        .limit(5000) 
        .lean();

    const scored = candidates
        .map((c) => ({
            ...c,
            score: cosine(qVec, c.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    const topScore = scored[0]?.score ?? 0;
    const minSimilarity = settings?.escalation?.minSimilarity ?? 0.75;

    return {
        inScope: topScore >= 0.35, // scope gate 
        minSimilarity,
        topScore,
        results: scored.map((r) => ({
            score: r.score,
            docTitle: r.docTitle,
            category: r.category,
            tags: r.tags || [],
            documentId: r.documentId,
            chunkIndex: r.chunkIndex,
            text: r.text,
        })),
    };
}
