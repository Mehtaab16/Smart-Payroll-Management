import mongoose from "mongoose";

const KnowledgeChunkSchema = new mongoose.Schema(
    {
        documentId: { type: mongoose.Schema.Types.ObjectId, ref: "KnowledgeDocument", index: true, required: true },

        docTitle: { type: String, trim: true },
        category: { type: String, index: true },
        tags: [{ type: String, trim: true }],

        chunkIndex: { type: Number, required: true },
        text: { type: String, required: true },

        // Real vector embedding
        embedding: { type: [Number], default: undefined },
        embeddingModel: { type: String, default: "text-embedding-3-small" },
    },
    { timestamps: true }
);

    
KnowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

export default mongoose.model("KnowledgeChunk", KnowledgeChunkSchema);
