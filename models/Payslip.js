import mongoose from "mongoose";

const lineItemSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
        visibleOnPayslip: { type: Boolean, default: true },
    },
    { _id: false }
);

const payslipSchema = new mongoose.Schema(
    {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        employeeSnapshot: {
            fullName: { type: String, required: true },
            email: { type: String, required: true },
            employeeId: { type: String, trim: true },
            address: { type: String, trim: true },
        },

        payPeriod: {
            period: { type: String, required: true },
            payDate: { type: Date, required: true },
        },

        earnings: { type: [lineItemSchema], default: [] },
        deductions: { type: [lineItemSchema], default: [] },

        totals: {
            grossPay: { type: Number, required: true },
            totalDeductions: { type: Number, required: true },
            netPay: { type: Number, required: true },
        },

        processingStatus: {
            type: String,
            enum: ["in_progress", "completed", "failed"],
            default: "completed",
            index: true,
        },

        payrollRunId: { type: mongoose.Schema.Types.ObjectId, ref: "PayrollRun", default: null, index: true },

        status: { type: String, enum: ["draft", "approved", "released"], default: "draft" },

        payslipNumber: { type: String, trim: true },

        
        payslipKind: { type: String, enum: ["regular", "adjustment"], default: "regular", index: true },
        adjustmentSequence: { type: Number, default: 0 }, 
    },
    { timestamps: true }
);

export default mongoose.model("Payslip", payslipSchema);
