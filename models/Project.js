import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        name: { type: String, required: true, trim: true },
        status: { type: String, enum: ["not_started", "in_progress", "completed"], default: "not_started" },
        priority: { type: String, enum: ["low", "medium", "high"], default: "low" },

        dueDate: { type: Date, default: null },
        description: { type: String, default: "" },
    },
    { timestamps: true }
);

export default mongoose.model("Project", ProjectSchema);
