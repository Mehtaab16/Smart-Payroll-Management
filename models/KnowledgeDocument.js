import mongoose from "mongoose";

const KnowledgeDocumentSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        category: {
            type: String,
            enum: ["payroll", "leave", "overtime", "it", "hr", "system"],
            required: true,
            index: true,
        },
        tags: [{ type: String, trim: true }],

        uploadedBy: {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            role: { type: String, enum: ["admin", "payroll_manager"] },
        },

        version: { type: Number, default: 1 },
        isActive: { type: Boolean, default: true },

        status: {
            type: String,
            enum: ["pending", "processing", "ready", "failed"],
            default: "pending",
            index: true,
        },

        originalFilename: String,
        storedFilename: String,
        mimeType: String,
        size: Number,

        error: String,
    },
    { timestamps: true }
);

export default mongoose.model("KnowledgeDocument", KnowledgeDocumentSchema);
