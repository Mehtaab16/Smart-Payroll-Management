// models/AuditLog.js
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
    {
        // who performed the action (employee/admin/payroll_manager)
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        actorRole: { type: String, default: "" },

        // what the action is about (important for impersonation later)
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

        module: { type: String, trim: true, default: "" }, // profile, leave, overtime, support, progressions
        action: { type: String, trim: true, default: "" }, // CREATE, UPDATE, DELETE, UPLOAD, REQUEST_CHANGE, APPROVE, REJECT

        entityId: { type: String, trim: true, default: "" }, // id of ticket/request/etc
        message: { type: String, trim: true, default: "" },

        meta: { type: Object, default: {} }, // optional extra info
    },
    { timestamps: true }
);

export default mongoose.model("AuditLog", auditLogSchema);
