import mongoose from "mongoose";

const payrollRunSchema = new mongoose.Schema(
    {
        period: { type: String, required: true, trim: true, index: true }, // YYYY-MM
        payDate: { type: Date, required: true },

        status: {
            type: String,
            enum: ["queued", "running", "completed", "failed", "cancelled"],
            default: "queued",
            index: true,
        },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },

        counts: {
            employees: { type: Number, default: 0 },
            payslipsCreated: { type: Number, default: 0 },
            payslipsFailed: { type: Number, default: 0 },
            anomaliesFound: { type: Number, default: 0 },
            payslipsBlocked: { type: Number, default: 0 },
            emailedCount: { type: Number, default: 0 },
            anomalyAlertsSent: { type: Number, default: 0 },
        },

        error: { type: String, default: "" },
    },
    { timestamps: true }
);

payrollRunSchema.index({ period: 1, createdAt: -1 });

export default mongoose.model("PayrollRun", payrollRunSchema);
