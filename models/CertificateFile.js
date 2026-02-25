import mongoose from "mongoose";

const CertificateFileSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        title: { type: String, default: "" },
        originalName: String,
        mimeType: String,
        size: Number,

        path: String,
        filename: String,
        uploadedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model("CertificateFile", CertificateFileSchema);
