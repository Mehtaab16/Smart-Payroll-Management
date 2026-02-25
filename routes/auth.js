import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

function signToken(user) {
    return jwt.sign(
        {
            userId: user._id,
            role: user.role,
            email: user.email,
            employeeId: user.employeeId || null,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "fullName, email and password are required" });
        }

        const cleanEmail = String(email).toLowerCase().trim();

        const existing = await User.findOne({ email: cleanEmail });
        if (existing) {
            return res.status(409).json({ message: "Email already exists" });
        }

        const passwordHash = await bcrypt.hash(String(password), 10);

        const allowedRoles = ["employee", "admin", "payroll_manager"];
        const finalRole = allowedRoles.includes(role) ? role : "employee";

        // Let User model generate employeeId ONLY for employees
        const user = await User.create({
            fullName: String(fullName).trim(),
            email: cleanEmail,
            passwordHash,
            role: finalRole,
        });

        const token = signToken(user);

        res.status(201).json({
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                employeeId: user.employeeId || null,
            },
        });
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ message: "Registration failed", error: err.message });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }

        const cleanEmail = String(email).toLowerCase().trim();

        const user = await User.findOne({ email: cleanEmail });
        if (!user || !user.isActive) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const ok = await bcrypt.compare(String(password), user.passwordHash);
        if (!ok) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = signToken(user);

        res.json({
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                employeeId: user.employeeId || null,
            },
        });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ message: "Login failed", error: err.message });
    }
});

// alias to stop UI breaking if it still calls /login_
router.post("/login_", async (req, res) => {
    req.url = "/login";
    return router.handle(req, res);
});

export default router;
