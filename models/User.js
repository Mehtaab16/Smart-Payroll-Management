import mongoose from "mongoose";

/**
 * Counter model (for sequential employee numbers)
 * Stores a single doc like: { _id: "employeeId", seq: 12 }
 */
const counterSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 },
    },
    { versionKey: false }
);

const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

const bankDetailsSchema = new mongoose.Schema(
    {
        bankName: { type: String, trim: true, default: "" },
        accountName: { type: String, trim: true, default: "" },
        accountNumber: { type: String, trim: true, default: "" },
        sortCode: { type: String, trim: true, default: "" },
        iban: { type: String, trim: true, default: "" },
    },
    { _id: false }
);

const accessibilityPrefsSchema = new mongoose.Schema(
    {
        darkMode: { type: Boolean, default: true },
        largeText: { type: Boolean, default: false },
        notifications: { type: Boolean, default: true },
        highContrast: { type: Boolean, default: false },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true },

        role: { type: String, enum: ["employee", "admin", "payroll_manager"], default: "employee" },
        isActive: { type: Boolean, default: true },

        employeeId: { type: String, unique: true, sparse: true, index: true, trim: true },

        department: { type: String, trim: true, default: "" },
        profilePhotoUrl: { type: String, trim: true, default: "" },

        bankDetails: { type: bankDetailsSchema, default: () => ({}) },

        accessibilityPrefs: { type: accessibilityPrefsSchema, default: () => ({}) },

        // Employment lifecycle 
        employmentType: { type: String, enum: ["permanent", "contract", "intern"], default: "permanent" },
        employmentStatus: { type: String, enum: ["active", "terminated"], default: "active" },

        hireDate: { type: Date, default: null },
        terminationDate: { type: Date, default: null },
        rehireDate: { type: Date, default: null },

        // Termination rule: revoke access after 3 months
        accessRevokedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

/**
 * Auto-generate employeeId for employees only.
 * Format: EMP000001
 */
userSchema.pre("validate", async function () {
    if (this.employeeId) return;
    if (this.role !== "employee") return;

    const c = await Counter.findByIdAndUpdate(
        { _id: "employeeId" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    const seq = c.seq;
    this.employeeId = `EMP${String(seq).padStart(6, "0")}`;
});

export default mongoose.model("User", userSchema);
