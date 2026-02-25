// models/ProfileChangeRequest.js
import mongoose from "mongoose";

const profileChangeRequestSchema = new mongoose.Schema(
    {
        employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        // personal | bank
        category: { type: String, enum: ["personal", "bank"], required: true },

        // store only the fields they want changed
        payload: { type: Object, default: {} },

        // Employee note (saved)
        note: { type: String, trim: true, default: "" },

        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },

        // reviewer
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        reviewNote: { type: String, trim: true, default: "" },
    },
    { timestamps: true }
);

export default mongoose.model("ProfileChangeRequest", profileChangeRequestSchema);
