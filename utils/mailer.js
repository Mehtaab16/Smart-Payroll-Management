// server/utils/mailer.js
import nodemailer from "nodemailer";
import User from "../models/User.js";
import EmailLog from "../models/EmailLog.js";

let _transport = null;

export function getTransport() {
    if (_transport) return _transport;

    const host = String(process.env.SMTP_HOST || "").trim();
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim();
    const port = Number(String(process.env.SMTP_PORT || "465").trim());

    if (!host) throw new Error("SMTP_HOST is missing");
    if (!user) throw new Error("SMTP_USER is missing");
    if (!pass) throw new Error("SMTP_PASS is missing");
    if (!port || Number.isNaN(port)) throw new Error("SMTP_PORT is invalid");

    _transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    return _transport;
}

function fromAddress() {
    return process.env.MAIL_FROM || process.env.SMTP_USER;
}

function yyyymm(d) {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

function normToArray(to) {
    if (!to) return [];
    if (Array.isArray(to)) return to.map(String).filter(Boolean);
    return [String(to)].filter(Boolean);
}

async function logEmail({
    period,
    sentAt,
    audience,
    eventType,
    status,
    to,
    toUserId = null,
    subject = "",
    templateKey = "",
    meta = {},
    error = "",
}) {
    try {
        await EmailLog.create({
            period: period || yyyymm(sentAt || new Date()),
            sentAt: sentAt || new Date(),
            audience,
            eventType,
            status,
            to: normToArray(to),
            toUserId: toUserId || null,
            subject,
            templateKey,
            meta,
            error,
        });
    } catch {
        // ignore logging errors
    }
}

/**
 * CORE SENDER (NO LOGGING)
 * Retry worker must use this to avoid creating NEW EmailLog rows.
 */
export async function sendEmailCore({
    to,
    subject,
    text,
    html = null,
}) {
    const t = getTransport();
    const recipients = normToArray(to);

    if (!recipients.length) throw new Error("sendEmailCore: missing recipients");
    if (!String(subject || "").trim()) throw new Error("sendEmailCore: missing subject");
    if (!String(text || "").trim() && !String(html || "").trim()) {
        throw new Error("sendEmailCore: missing text/html");
    }

    try {
        await t.sendMail({
            from: fromAddress(),
            to: recipients,
            subject,
            ...(String(text || "").trim() ? { text: String(text) } : {}),
            ...(html ? { html } : {}),
        });

        return { ok: true };
    } catch (e) {
        const msg = e?.message || String(e);

        //if DNS/ENOTFOUND, reset transport so next retry recreates it
        if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
            _transport = null;
        }

        throw new Error(msg);
    }
}

/**
 * Generic sender that logs every email.
 * Always store the email body in meta.__text so retry worker can resend.
 */
export async function sendEmailLogged({
    audience,
    to,
    toUserId = null,
    eventType = "",
    subject,
    text,
    html = null,
    templateKey = "",
    meta = {},
    period = "",
}) {
    const t = getTransport();
    const sentAt = new Date();
    const recipients = normToArray(to);

    const safeMeta = { ...(meta || {}), __text: String(text || "") };

    try {
        await t.sendMail({
            from: fromAddress(),
            to: recipients,
            subject,
            text,
            ...(html ? { html } : {}),
        });

        await logEmail({
            period: period || yyyymm(sentAt),
            sentAt,
            audience,
            eventType,
            status: "sent",
            to: recipients,
            toUserId,
            subject,
            templateKey,
            meta: safeMeta,
        });

        return { ok: true };
    } catch (e) {
        const msg = e?.message || String(e);

        // if DNS/ENOTFOUND, reset transport so next retry recreates it
        if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
            _transport = null;
        }

        await logEmail({
            period: period || yyyymm(sentAt),
            sentAt,
            audience,
            eventType,
            status: "failed",
            to: recipients,
            toUserId,
            subject,
            templateKey,
            meta: safeMeta,
            error: msg,
        });

        console.error("❌ Email failed:", msg);
        return { ok: false, error: msg };
    }
}

/**
 * Get all active admin + payroll_manager recipients.
 */
export async function getAdminPmEmails() {
    const list = await User.find({
        role: { $in: ["admin", "payroll_manager"] },
        isActive: true,
    })
        .select("email")
        .lean();

    return list.map((u) => String(u.email || "").trim()).filter(Boolean);
}

/**
 * Send to all admin + payroll_manager + log it.
 */
export async function sendAdminPmEmailLogged({
    subject,
    text,
    html = null,
    eventType = "",
    templateKey = "",
    meta = {},
}) {
    const to = await getAdminPmEmails();
    if (!to.length) {
        await logEmail({
            audience: "admin_pm",
            eventType,
            status: "failed",
            to: [],
            subject,
            templateKey,
            meta: { ...(meta || {}), __text: String(text || "") },
            error: "No admin/payroll_manager recipients found",
        });
        return { ok: false, error: "No admin/payroll_manager recipients found" };
    }

    return sendEmailLogged({
        audience: "admin_pm",
        to,
        eventType,
        subject,
        text,
        html,
        templateKey,
        meta,
    });
}


export async function sendEmployeeWelcomeEmail({ to, fullName, tempPassword }) {
    const t = getTransport();
    const appUrl = process.env.APP_URL || "http://localhost:5173";

    const subject = "AutoPay account created";
    const text =
        `Hi ${fullName || ""}\n\n` +
        `Your AutoPay account has been created.\n\n` +
        `Login: ${to}\n` +
        `Temporary password: ${tempPassword}\n` +
        `Login URL: ${appUrl}/login\n\n` +
        `Please change your password after logging in.\n`;

    try {
        await t.sendMail({
            from: fromAddress(),
            to,
            subject,
            text,
        });

        await logEmail({
            audience: "employee",
            eventType: "welcome",
            status: "sent",
            to,
            subject,
            templateKey: "welcome",
            meta: { fullName: fullName || "", __text: text },
        });
    } catch (e) {
        const msg = e?.message || String(e);
        await logEmail({
            audience: "employee",
            eventType: "welcome",
            status: "failed",
            to,
            subject,
            templateKey: "welcome",
            meta: { fullName: fullName || "", __text: text },
            error: msg,
        });
        console.error("❌ Email failed:", msg);
    }
}

export async function sendPayslipReleasedEmail({
    to,
    fullName,
    period,
    payslipId,
    kind = "regular",
}) {
    const t = getTransport();
    const appUrl = process.env.APP_URL || "http://localhost:5173";

    const label = kind === "adjustment" ? "Adjustment payslip" : "Payslip";
    const subject =
        kind === "adjustment"
            ? `AutoPay: Adjustment payslip released (${period})`
            : `AutoPay: Payslip released (${period})`;

    const viewUrl = `${appUrl}/payslips/${payslipId}`;

    const text =
        `Hi ${fullName || ""}\n\n` +
        `${label} for ${period} has been released.\n\n` +
        `View: ${viewUrl}\n\n` +
        `AutoPay\n`;

    try {
        await t.sendMail({
            from: fromAddress(),
            to,
            subject,
            text,
        });

        await logEmail({
            audience: "employee",
            eventType:
                kind === "adjustment"
                    ? "payslip_adjustment_released"
                    : "payslip_released",
            status: "sent",
            to,
            subject,
            templateKey: "payslip_released",
            meta: { period, payslipId, kind, __text: text },
            period,
        });
    } catch (e) {
        const msg = e?.message || String(e);
        await logEmail({
            audience: "employee",
            eventType:
                kind === "adjustment"
                    ? "payslip_adjustment_released"
                    : "payslip_released",
            status: "failed",
            to,
            subject,
            templateKey: "payslip_released",
            meta: { period, payslipId, kind, __text: text },
            error: msg,
            period,
        });
        console.error("❌ Email failed:", msg);
    }
}

export async function sendEmployeeDocumentEmail({
    to,
    toUserId = null,
    fullName,
    title,
    category = "other",
}) {
    const appUrl = process.env.APP_URL || "http://localhost:5173";

    const subject = `AutoPay: New document available — ${title}`;
    const text =
        `Hi ${fullName || ""}\n\n` +
        `A new document has been sent to your AutoPay portal.\n\n` +
        `Title: ${title}\n` +
        `Category: ${category}\n\n` +
        `Open: ${appUrl}/documents\n\n` +
        `AutoPay\n`;

    // uses your generic sender + logs to EmailLog (with meta.__text stored)
    return sendEmailLogged({
        audience: "employee",
        to,
        toUserId,
        eventType: "employee_document_sent",
        subject,
        text,
        templateKey: "employee_document_sent",
        meta: { title, category },
    });
}

export async function sendAnomalyAlertEmail({
    to,
    period,
    employeeName,
    employeeEmail,
    payslipId,
    anomalyCount,
}) {
    const t = getTransport();
    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const listUrl = `${appUrl}/payroll?tab=anomalies&period=${encodeURIComponent(
        period
    )}`;
    const viewSlipUrl = `${appUrl}/payslips/${payslipId}`;

    const subject = `AutoPay: Anomaly detected (${period})`;
    const text =
        `An anomaly was detected during payroll processing.\n\n` +
        `Period: ${period}\n` +
        `Employee: ${employeeName || "-"} (${employeeEmail || "-"})\n` +
        `Anomaly count: ${anomalyCount}\n\n` +
        `Review anomalies: ${listUrl}\n` +
        `Payslip: ${viewSlipUrl}\n\n` +
        `AutoPay\n`;

    try {
        await t.sendMail({
            from: fromAddress(),
            to,
            subject,
            text,
        });

        await logEmail({
            audience: "admin_pm",
            eventType: "anomaly_alert",
            status: "sent",
            to,
            subject,
            templateKey: "anomaly_alert",
            meta: {
                period,
                employeeName,
                employeeEmail,
                payslipId,
                anomalyCount,
                __text: text,
            },
            period,
        });
    } catch (e) {
        const msg = e?.message || String(e);
        await logEmail({
            audience: "admin_pm",
            eventType: "anomaly_alert",
            status: "failed",
            to,
            subject,
            templateKey: "anomaly_alert",
            meta: {
                period,
                employeeName,
                employeeEmail,
                payslipId,
                anomalyCount,
                __text: text,
            },
            error: msg,
            period,
        });
        console.error("❌ Anomaly alert email failed:", msg);
    }
}