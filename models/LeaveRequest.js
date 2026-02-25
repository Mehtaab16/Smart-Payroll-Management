import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        type: {
            type: String,
            enum: ["Annual Leave", "Sick Leave", "Wedding Leave", "Unpaid Leave", "Work From Home"],
            required: true,
        },

        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },

        status: {
            type: String,
            enum: ["inprogress", "accepted", "rejected", "cancelled"],
            default: "inprogress",
        },

        delegate: { type: String, trim: true, default: "" },
        comments: { type: String, trim: true, default: "" },

        // approval metadata (PM/Admin)
        decisionNote: { type: String, trim: true, default: "" },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        decidedByRole: { type: String, trim: true, default: "" },
        decidedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Basic validation: end must be >= start
leaveRequestSchema.pre("validate", function () {
    if (this.startDate && this.endDate && this.endDate < this.startDate) {
        throw new Error("endDate cannot be before startDate");
    }
});

export default mongoose.model("LeaveRequest", leaveRequestSchema);
