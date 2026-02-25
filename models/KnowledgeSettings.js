import mongoose from "mongoose";

const KnowledgeSettingsSchema = new mongoose.Schema(
    {
        allowedCategories: {
            type: [String],
            default: ["payroll", "leave", "overtime", "it", "hr", "system"],
        },

        escalation: {
            minSimilarity: { type: Number, default: 0.75 },
            requireSources: { type: Boolean, default: true },
        },

        routingRules: {
            payrollKeywords: { type: [String], default: ["payslip", "salary", "tax", "deduction", "paycode"] },
            technicalKeywords: { type: [String], default: ["login", "password", "bug", "error", "browser", "access"] },
        },

        allowPmUploads: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export default mongoose.model("KnowledgeSettings", KnowledgeSettingsSchema);
