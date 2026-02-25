import EmailLog from "../models/EmailLog.js";
import { sendEmailCore } from "../utils/mailerCore.js";

let started = false;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function pickText(row) {
    
    const meta = row?.meta || {};
    return (
        meta.__text ||
        meta.text ||
        meta.mailText ||
        row.text ||
        ""
    );
}

export function startEmailRetryWorker({ intervalMs = 8000, maxBatch = 10 } = {}) {
    if (started) return;
    started = true;

    setInterval(async () => {
        try {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

            //  filter by createdAt/updatedAt (NOT sentAt)
            const failed = await EmailLog.find({
                status: "failed",
                createdAt: { $gte: since },
                // stop after 10 retries
                $or: [
                    { "meta.__retryCount": { $exists: false } },
                    { "meta.__retryCount": { $lt: 10 } },
                ],
            })
                .sort({ createdAt: -1 })
                .limit(maxBatch)
                .lean();

            for (const row of failed) {
                const subject = String(row.subject || "").trim();

                const to = Array.isArray(row.to)
                    ? row.to.filter(Boolean)
                    : (String(row.to || "").trim() ? [String(row.to).trim()] : []);

                const text = String(pickText(row) || "").trim();

                if (!subject || !to.length || !text) continue;

                const prevRetryCount = Number(row?.meta?.__retryCount || 0);
                if (prevRetryCount >= 10) continue;

                const nextMeta = { ...(row.meta || {}), __retryCount: prevRetryCount + 1 };

                try {
                    // Send WITHOUT creating another EmailLog row
                    await sendEmailCore({ to, subject, text });

                    await EmailLog.updateOne(
                        { _id: row._id },
                        {
                            $set: {
                                status: "sent",
                                sentAt: new Date(),
                                meta: nextMeta,
                                error: "",
                            },
                        }
                    );
                } catch (e) {
                    const errMsg = String(e?.message || e);

                    await EmailLog.updateOne(
                        { _id: row._id },
                        {
                            $set: {
                                meta: nextMeta,
                                error: errMsg.slice(0, 500),
                            },
                        }
                    );

                    await sleep(600);
                }
            }
        } catch (e) {
            console.log("Email retry worker error:", e?.message || e);
        }
    }, intervalMs);
}