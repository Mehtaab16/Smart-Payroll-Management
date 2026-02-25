import mongoose from "mongoose";

const KnowledgeChatSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
        userRole: { type: String, index: true },

        messages: [
            {
                role: { type: String, enum: ["user", "assistant"], required: true },
                text: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
            },
        ],

        lastTopScore: Number,
        lastConfidence: Number,
        lastSources: [
            {
                docTitle: String,
                category: String,
                score: Number,
            },
        ],

        status: { type: String, enum: ["open", "needs_help", "escalated", "closed"], default: "open", index: true },
    },
    { timestamps: true }
);

export default mongoose.model("KnowledgeChat", KnowledgeChatSchema);
