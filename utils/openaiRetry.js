export async function withRetry(fn, { retries = 3, baseDelayMs = 800 } = {}) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            const status = e?.status || e?.response?.status;
            // retry only on transient errors
            const retryable = status === 500 || status === 502 || status === 503 || status === 504 || status === 429;
            if (!retryable || i === retries - 1) throw e;

            const delay = baseDelayMs * Math.pow(2, i);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
