// models/PayrollAnomaly.js
import mongoose from "mongoose";

const anomalyItemSchema = new mongoose.Schema(
    {
        severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        type: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
        meta: { type: Object, default: {} },
    },
    { _id: false }
);

const payrollAnomalySchema = new mongoose.Schema(
    {
        period: { type: String, required: true, trim: true, index: true }, // YYYY-MM
        payrollRunId: { type: mongoose.Schema.Types.ObjectId, ref: "PayrollRun", default: null, index: true },

        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        employeeSnapshot: {
            fullName: { type: String, default: "" },
            email: { type: String, default: "", lowercase: true, trim: true },
            employeeId: { type: String, default: "", trim: true },
        },

        // one anomaly doc, multiple reasons
        payslipId: { type: mongoose.Schema.Types.ObjectId, ref: "Payslip", default: null, index: true },
        items: { type: [anomalyItemSchema], default: [] },
        anomalyCount: { type: Number, default: 0 },

        // kept for backward compatibility + UI display
        severity: { type: String, enum: ["low", "medium", "high"], default: "medium", index: true },
        type: { type: String, required: true, trim: true, index: true },
        message: { type: String, required: true, trim: true },

        meta: { type: Object, default: {} },

        status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open", index: true },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },

        
        decision: { type: String, default: "" },
    },
    { timestamps: true }
);

// one anomaly record per payslip (so 3 anomalies become 1 record)
payrollAnomalySchema.index({ period: 1, employee: 1, payrollRunId: 1, payslipId: 1 }, { unique: true });

export default mongoose.model("PayrollAnomaly", payrollAnomalySchema);
