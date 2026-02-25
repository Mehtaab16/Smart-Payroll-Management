import nodemailer from "nodemailer";

let cachedTransporter = null;

function env(name, fallback = "") {
    const v = process.env[name];
    return (v === undefined || v === null || v === "") ? fallback : v;
}

function mustEnv(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function getTransporter() {
    if (cachedTransporter) return cachedTransporter;

    // defaults 
    const host = env("SMTP_HOST", "smtp.gmail.com");
    const port = Number(env("SMTP_PORT", "587"));
    const user = mustEnv("SMTP_USER");
    const pass = mustEnv("SMTP_PASS");

    cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    return cachedTransporter;
}

/**
 * Core sender (NO LOGGING).
 * Throws on failure so retry worker can increment attempts.
 */
export async function sendEmailCore({ to, subject, text, html }) {
    const tx = getTransporter();
    const from = env("MAIL_FROM", env("SMTP_USER"));

    const toList = Array.isArray(to) ? to : [to].filter(Boolean);

    if (!toList.length) throw new Error("sendEmailCore: missing to");
    if (!subject) throw new Error("sendEmailCore: missing subject");
    if (!text && !html) throw new Error("sendEmailCore: missing text/html");

    await tx.sendMail({
        from,
        to: toList.join(","),
        subject,
        text: text || undefined,
        html: html || undefined,
    });

    return { ok: true };
}