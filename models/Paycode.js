import mongoose from "mongoose";

const paycodeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },

        type: { type: String, enum: ["earning", "deduction"], required: true },

        visibleOnPayslip: { type: Boolean, default: true },
        active: { type: Boolean, default: true },
        archivedAt: { type: Date, default: null },

        calcType: { type: String, enum: ["fixed", "percentage", "hourly_rate", "manual"], default: "fixed" },

        // ordering / priority on payslip
        defaultPriority: { type: Number, default: 100 },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

paycodeSchema.index({ name: 1 });

export default mongoose.model("Paycode", paycodeSchema);
