import mongoose from "mongoose";

const payrollScheduleSchema = new mongoose.Schema(
    {
        enabled: { type: Boolean, default: true },

        // pay day rule
        dayOfMonth: { type: Number, default: 25 }, 
        moveBackIfNonWorking: { type: Boolean, default: true },

        // scheduler run time (server local time)
        runHour: { type: Number, default: 9 },
        runMinute: { type: Number, default: 0 },

        // one-off test override
        overridePeriod: { type: String, default: "" },        // "2026-03"
        overrideRunDate: { type: String, default: "" },       // "2026-02-09" (YYYY-MM-DD)
      

        // store holidays as YYYY-MM-DD strings
        holidays: { type: [String], default: [] },

        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

export default mongoose.model("PayrollSchedule", payrollScheduleSchema);
