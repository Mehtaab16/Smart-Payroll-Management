import mongoose from "mongoose";

const payrollAdjustmentSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        // stored for easier reporting
        employeeSnapshot: {
            fullName: { type: String, default: "" },
            email: { type: String, default: "", lowercase: true, trim: true },
            employeeId: { type: String, default: "", trim: true },
        },

        // paycode ref 
        paycodeCode: { type: String, required: true, uppercase: true, trim: true, index: true },
        paycodeName: { type: String, default: "", trim: true },
        type: { type: String, enum: ["earning", "deduction"], required: true },

        amount: { type: Number, required: true }, 
        period: { type: String, required: true, trim: true, index: true }, // "YYYY-MM"
        note: { type: String, default: "", trim: true },

        status: { type: String, enum: ["pending", "applied", "cancelled"], default: "pending", index: true },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        cancelledAt: { type: Date, default: null },
    },
    { timestamps: true }
);

export default mongoose.model("PayrollAdjustment", payrollAdjustmentSchema);
