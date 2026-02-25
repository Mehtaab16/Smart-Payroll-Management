// server/utils/embeddings.js
import OpenAI from "openai";

console.log("API KEY EXISTS?", !!process.env.OPENAI_API_KEY);


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function safeText(t, maxChars = 2000) {
    const s = String(t ?? "");
    // remove null chars + trim + hard cap
    return s.replace(/\u0000/g, "").trim().slice(0, maxChars);
}

function shouldRetry(err) {
    const status = err?.status || err?.response?.status;
    // retry typical transient errors
    return status === 429 || status === 500 || status === 503 || status === 504;
}

async function withRetry(fn, { retries = 5, baseDelayMs = 500 } = {}) {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            if (attempt > retries || !shouldRetry(err)) throw err;

            // exponential backoff + jitter
            const delay = Math.min(8000, baseDelayMs * 2 ** (attempt - 1));
            const jitter = Math.floor(Math.random() * 250);
            await sleep(delay + jitter);
        }
    }
}

/**
 * embedTexts(texts, { model })
 * Returns: array of embedding vectors (same order)
 */
export async function embedTexts(texts = [], { model = "text-embedding-3-small" } = {}) {
    const arr = Array.isArray(texts) ? texts : [texts];

    // batch size small to avoid request payload issues
    const BATCH = 32;

    const out = [];
    for (let i = 0; i < arr.length; i += BATCH) {
        const batch = arr.slice(i, i + BATCH).map((t) => safeText(t, 2000));

        // Avoid hammering API
        if (i > 0) await sleep(250);

        const resp = await withRetry(() =>
            client.embeddings.create({
                model,
                input: batch,
            })
        );

        const data = resp?.data || [];
        for (const row of data) out.push(row.embedding);
    }

    return out;
}
