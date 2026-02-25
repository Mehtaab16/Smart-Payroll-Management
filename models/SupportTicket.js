import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
    {
        originalName: String,
        mimeType: String,
        size: Number,
        url: String,
    },
    { _id: false }
);

const MessageSchema = new mongoose.Schema(
    {
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        senderRole: { type: String, required: true }, // "employee" | "admin" | "payroll_manager"
        text: { type: String, default: "" },
        attachments: { type: [AttachmentSchema], default: [] },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const SupportTicketSchema = new mongoose.Schema(
    {
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: ["technical", "payroll"], required: true },

        employeeNumber: { type: String, required: true },
        employeeEmail: { type: String, required: true },


        title: { type: String, required: true },
        description: { type: String, default: "" },

        status: { type: String, enum: ["not_started", "in_progress", "resolved", "closed"], default: "not_started" },
        priority: { type: String, enum: ["low", "medium", "high"], default: "low" },
        dueDate: { type: Date, default: null },

        assignedToRole: { type: String, enum: ["admin", "payroll_manager"], required: true },

        attachments: { type: [AttachmentSchema], default: [] }, // initial attachments
        messages: { type: [MessageSchema], default: [] },

        lastActionAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model("SupportTicket", SupportTicketSchema);
