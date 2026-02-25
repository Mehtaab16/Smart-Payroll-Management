import KnowledgeDocument from "../models/KnowledgeDocument.js";
import { processKnowledgeDocument } from "./knowledgeProcessor.js";

let started = false;
let timer = null;

export function startKnowledgeWorker(opts = {}) {
    if (started) return;
    started = true;

    const intervalMs = Number(opts.intervalMs || 8000); // every 8s
    const maxPerTick = Number(opts.maxPerTick || 1); 

    async function tick() {
        try {
            // find oldest pending doc
            const pending = await KnowledgeDocument.find({ status: "pending" })
                .sort({ createdAt: 1 })
                .limit(maxPerTick);

            if (!pending.length) return;

            for (const d of pending) {
                await processKnowledgeDocument(d._id);
            }
        } catch (e) {
            console.error("Knowledge worker error:", e);
        }
    }

    timer = setInterval(tick, intervalMs);
    tick();

    return () => {
        try {
            clearInterval(timer);
        } catch { }
        timer = null;
        started = false;
    };
}
