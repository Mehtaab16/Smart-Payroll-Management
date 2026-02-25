// models/EmployeeDocument.js
import mongoose from "mongoose";

const EmployeeDocumentSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        category: {
            type: String,
            enum: ["tax_year_end", "hr", "other"],
            default: "other",
            index: true,
        },

        title: { type: String, required: true, trim: true }, // e.g. "Tax Year End 2025"
        period: { type: String, default: "" },               // e.g. "2025"

        originalName: String,
        mimeType: String,
        size: Number,

        path: String,     // /uploads/employee-docs/
        filename: String,
        uploadedAt: { type: Date, default: Date.now },

        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
);

export default mongoose.model("EmployeeDocument", EmployeeDocumentSchema);
