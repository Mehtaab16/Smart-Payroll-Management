// models/EmailLog.js
import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
    {
        period: { type: String, trim: true, index: true }, // YYYY-MM (based on sentAt)
        sentAt: { type: Date, default: Date.now, index: true },

        audience: { type: String, enum: ["employee", "admin_pm"], required: true, index: true },
        eventType: { type: String, trim: true, default: "", index: true }, // e.g. leave_new, overtime_decision, support_reply

        status: { type: String, enum: ["sent", "failed"], default: "sent", index: true },

        to: { type: [String], default: [] },
        toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

        subject: { type: String, trim: true, default: "" },
        templateKey: { type: String, trim: true, default: "" },

        meta: { type: Object, default: {} },
        error: { type: String, default: "" },
    },
    { timestamps: true }
);

emailLogSchema.index({ period: 1, audience: 1, eventType: 1, sentAt: -1 });

export default mongoose.model("EmailLog", emailLogSchema);
