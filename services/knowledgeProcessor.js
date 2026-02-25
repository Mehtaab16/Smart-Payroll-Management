import fs from "fs";
import path from "path";
import { createRequire } from "module";
import mammoth from "mammoth";

import KnowledgeDocument from "../models/KnowledgeDocument.js";
import KnowledgeChunk from "../models/KnowledgeChunk.js";

import { embedTexts } from "../utils/embeddings.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

function cleanText(s) {
    return String(s || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function splitIntoChunks(text, opts = {}) {
    const maxChars = Number(opts.maxChars || 900);
    const overlap = Number(opts.overlap || 120);

    const t = cleanText(text);
    if (!t) return [];

    // split by paragraphs, then pack into chunks
    const paras = t.split(/\n\s*\n/g).map((p) => p.trim()).filter(Boolean);

    const chunks = [];
    let buf = "";

    function pushBuf() {
        const v = buf.trim();
        if (!v) return;
        chunks.push(v);
        buf = "";
    }

    for (const p of paras) {
        if (!buf) {
            buf = p;
            continue;
        }
        // +2 for paragraph spacing
        if (buf.length + p.length + 2 <= maxChars) {
            buf += "\n\n" + p;
        } else {
            pushBuf();
            buf = p;
        }
    }
    pushBuf();

    // overlap by chars
    if (overlap > 0 && chunks.length > 1) {
        const out = [];
        for (let i = 0; i < chunks.length; i++) {
            const prev = i > 0 ? chunks[i - 1] : "";
            const cur = chunks[i];

            const prevTail = prev ? prev.slice(Math.max(0, prev.length - overlap)) : "";
            const combined = cleanText(prevTail ? `${prevTail}\n\n${cur}` : cur);
            out.push(combined);
        }
        return out;
    }

    return chunks;
}

async function extractTextFromFile({ fullPath, mimeType }) {
    if (!fs.existsSync(fullPath)) throw new Error("Stored file missing on server.");

    if (mimeType === "text/plain") {
        return fs.readFileSync(fullPath, "utf8");
    }

    if (mimeType === "application/pdf") {
        const require = createRequire(import.meta.url);
        const pdfParse = require("pdf-parse"); 

        const buf = fs.readFileSync(fullPath);
        const parsed = await pdfParse(buf);
        return parsed?.text || "";
    }


    // DOCX
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ path: fullPath });
        return result?.value || "";
    }

    throw new Error("Unsupported file type for processing.");
}

export async function processKnowledgeDocument(documentId, opts = {}) {
    const doc = await KnowledgeDocument.findById(documentId);
    if (!doc) throw new Error("Document not found");

    // mark processing
    doc.status = "processing";
    doc.error = "";
    await doc.save();

    try {
        const fullPath = path.join(process.cwd(), "server", "uploads", "knowledge", doc.storedFilename || "");

        const raw = await extractTextFromFile({ fullPath, mimeType: doc.mimeType });
        const text = cleanText(raw);

        if (!text || text.length < 20) {
            throw new Error("No readable text extracted from this file.");
        }

        // wipe old chunks (reprocess safe)
        await KnowledgeChunk.deleteMany({ documentId: doc._id });

        const chunks = splitIntoChunks(text, {
            maxChars: opts.maxChars || 600,
            overlap: opts.overlap || 80,
        });

        if (!chunks.length) throw new Error("Chunking produced no output.");

        // create embeddings for each chunk
        const vectors = await embedTexts(chunks, { model: "text-embedding-3-small" });

        const bulk = chunks.map((c, i) => ({
            documentId: doc._id,
            docTitle: doc.title,
            category: String(doc.category || "").trim().toLowerCase(),
            tags: doc.tags || [],
            chunkIndex: i,
            text: c,
            embedding: vectors[i],
            embeddingModel: "text-embedding-3-small",
        }));

        await KnowledgeChunk.insertMany(bulk, { ordered: true });

        doc.status = "ready";
        doc.error = "";
        await doc.save();

        return { ok: true, chunks: chunks.length };
    } catch (e) {
        doc.status = "failed";
        doc.error = e?.message || "Processing failed";
        await doc.save();
        return { ok: false, error: doc.error };
    }
}
