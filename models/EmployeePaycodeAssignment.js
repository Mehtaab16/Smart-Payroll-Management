import mongoose from "mongoose";

function isYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

const employeePaycodeAssignmentSchema = new mongoose.Schema(
    {
        employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        paycodeId: { type: mongoose.Schema.Types.ObjectId, ref: "Paycode", required: true, index: true },

        amount: { type: Number, default: null },
        percentage: { type: Number, default: null },
        hourlyRate: { type: Number, default: null },

        calcType: { type: String, enum: ["fixed", "percentage", "hourly_rate", "manual"], default: null },
        priority: { type: Number, default: null },

        effectiveFrom: { type: String, required: true, validate: { validator: isYYYYMM, message: "effectiveFrom must be YYYY-MM" } },
        effectiveTo: { type: String, default: null, validate: { validator: (v) => v === null || isYYYYMM(v), message: "effectiveTo must be YYYY-MM or null" } },

        note: { type: String, trim: true, default: "" },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

employeePaycodeAssignmentSchema.index({ employeeId: 1, effectiveFrom: 1, effectiveTo: 1 });
employeePaycodeAssignmentSchema.index({ employeeId: 1, paycodeId: 1, effectiveFrom: 1 });

export default mongoose.model("EmployeePaycodeAssignment", employeePaycodeAssignmentSchema);
