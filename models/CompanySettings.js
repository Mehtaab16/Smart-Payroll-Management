import mongoose from "mongoose";

const companySettingsSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, trim: true },
        companyAddress: { type: String, required: true, trim: true }, // multiline string
        companyPhone: { type: String, trim: true },
        companyEmail: { type: String, trim: true },
        logoUrl: { type: String, trim: true } 
    },
    { timestamps: true }
);

export default mongoose.model("CompanySettings", companySettingsSchema);
