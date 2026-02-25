import mongoose from "mongoose";

const CvFileSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

        originalName: String,
        mimeType: String,
        size: Number,

        path: String,     // e.g. /uploads/cvs/
        filename: String, // stored filename
        uploadedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model("CvFile", CvFileSchema);
