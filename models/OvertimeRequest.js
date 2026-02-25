import mongoose from "mongoose";

const OvertimeRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // store date as Date like leave (easier for queries)
    date: { type: Date, required: true },

    startTime: { type: String, default: "" }, // "HH:MM"
    endTime: { type: String, default: "" },   // "HH:MM"
    hours: { type: Number, required: true },

    reason: { type: String, required: true },

    // match leave style: "inprogress" while pending approval
    status: {
      type: String,
      enum: ["inprogress", "accepted", "cancelled", "rejected"],
      default: "inprogress",
    },

    managerNote: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("OvertimeRequest", OvertimeRequestSchema);
