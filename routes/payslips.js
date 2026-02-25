import express from "express";
import PDFDocument from "pdfkit";

import Payslip from "../models/Payslip.js";
import User from "../models/User.js";
import CompanySettings from "../models/CompanySettings.js";
import { authRequired, requireRole } from "../middleware/auth.js";

const router = express.Router();

function sum(items) {
    return (items || []).reduce((acc, it) => acc + Number(it?.amount || 0), 0);
}

// Ensure line items always have visibleOnPayslip (default true)
function normalizeLineItems(arr) {
    const a = Array.isArray(arr) ? arr : [];
    return a
        .map((x) => ({
            label: String(x?.label || "").trim(),
            amount: Number(x?.amount || 0),
            visibleOnPayslip: x?.visibleOnPayslip === false ? false : true,
        }))
        .filter((x) => x.label && x.amount >= 0);
}

function visibleOnly(arr) {
    return (arr || []).filter((x) => x?.visibleOnPayslip !== false);
}

   //ADMIN — Create Payslip
   P//OST /api/payslips

router.post("/", authRequired, requireRole("admin"), async (req, res) => {
    try {
        const { employeeId, payPeriod, earnings, deductions, status, payslipNumber } = req.body;

        if (!employeeId || !payPeriod?.period || !payPeriod?.payDate) {
            return res.status(400).json({
                message: "employeeId and payPeriod { period, payDate } are required",
            });
        }

        const employee = await User.findById(employeeId);
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        const safeEarnings = normalizeLineItems(earnings);
        const safeDeductions = normalizeLineItems(deductions);

        const grossPay = sum(safeEarnings);
        const totalDeductions = sum(safeDeductions);
        const netPay = grossPay - totalDeductions;

        const created = await Payslip.create({
            employee: employee._id,
            employeeSnapshot: {
                fullName: employee.fullName,
                email: employee.email,
                employeeId: employee.employeeId || "",
                address: employee.address || "",
            },
            payPeriod: {
                period: String(payPeriod.period),
                payDate: new Date(payPeriod.payDate),
            },
            earnings: safeEarnings,
            deductions: safeDeductions,
            totals: { grossPay, totalDeductions, netPay },
            status: ["draft", "approved", "released"].includes(status) ? status : "draft",
            payslipNumber: payslipNumber || "",
        });

        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ message: "Failed to create payslip", error: err.message });
    }
});


   //EMPLOYEE — Get My Payslips

router.get("/mine", authRequired, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const payslips = await Payslip.find({ employee: userId }).sort({ createdAt: -1 });
        res.json(payslips);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch payslips", error: err.message });
    }
});


  //ADMIN — Get All Payslips

router.get("/", authRequired, requireRole("admin"), async (req, res) => {
    try {
        const payslips = await Payslip.find()
            .populate("employee", "fullName email role")
            .sort({ createdAt: -1 });
        res.json(payslips);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch payslips", error: err.message });
    }
});


  //VIEW — Single Payslip 
router.get("/:id", authRequired, async (req, res) => {
    try {
        const payslip = await Payslip.findById(req.params.id);
        if (!payslip) return res.status(404).json({ message: "Payslip not found" });

        const userId = req.user?.userId;
        const isOwner = String(payslip.employee) === String(userId);
        const isAdmin = req.user?.role === "admin";

        if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

        res.json(payslip);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch payslip", error: err.message });
    }
});


   //VIEW: Payslip + Company (HTML rendering)

router.get("/:id/view", authRequired, async (req, res) => {
    try {
        const payslip = await Payslip.findById(req.params.id);
        if (!payslip) return res.status(404).json({ message: "Payslip not found" });

        const userId = req.user?.userId;
        const isOwner = String(payslip.employee) === String(userId);
        const isAdmin = req.user?.role === "admin";

        if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

        const company = await CompanySettings.findOne().sort({ createdAt: -1 });

        res.json({ company: company || null, payslip });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch payslip view", error: err.message });
    }
});


   //PDF: Download Payslip (respects visibleOnPayslip)

router.get("/:id/pdf", authRequired, async (req, res) => {
    try {
        const payslip = await Payslip.findById(req.params.id);
        if (!payslip) return res.status(404).json({ message: "Payslip not found" });

        const userId = req.user?.userId;
        const isOwner = String(payslip.employee) === String(userId);
        const isAdmin = req.user?.role === "admin";

        if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

        const company = await CompanySettings.findOne().sort({ createdAt: -1 });

        const doc = new PDFDocument({ size: "A4", margin: 50 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=payslip-${payslip.payslipNumber || payslip._id}.pdf`
        );

        doc.pipe(res);

        doc.fontSize(18).text(company?.companyName || "Company Name");
        doc.fontSize(10).text(company?.companyAddress || "");
        doc.moveDown();

        doc.fontSize(14).text("PAYSLIP", { align: "right" });
        doc.fontSize(10).text(`Period: ${payslip.payPeriod.period}`, { align: "right" });
        doc.text(`Pay Date: ${new Date(payslip.payPeriod.payDate).toLocaleDateString()}`, { align: "right" });
        doc.moveDown();

        doc.fontSize(11).text(`Employee: ${payslip.employeeSnapshot.fullName}`);
        doc.text(`Email: ${payslip.employeeSnapshot.email}`);
        doc.moveDown();

        const earningsToShow = visibleOnly(payslip.earnings);
        const deductionsToShow = visibleOnly(payslip.deductions);

        doc.fontSize(12).text("EARNINGS");
        earningsToShow.forEach((e) => {
            doc.fontSize(10).text(`${e.label}: ${e.amount}`);
        });
        if (earningsToShow.length === 0) doc.fontSize(10).text("No items");
        doc.moveDown();

        doc.fontSize(12).text("DEDUCTIONS");
        deductionsToShow.forEach((d) => {
            doc.fontSize(10).text(`${d.label}: ${d.amount}`);
        });
        if (deductionsToShow.length === 0) doc.fontSize(10).text("No items");
        doc.moveDown();

        doc.fontSize(11).text(`Gross Pay: ${payslip.totals.grossPay}`);
        doc.text(`Total Deductions: ${payslip.totals.totalDeductions}`);
        doc.fontSize(12).text(`Net Pay: ${payslip.totals.netPay}`);

        doc.end();
    } catch (err) {
        res.status(500).json({ message: "Failed to generate PDF", error: err.message });
    }
});

export default router;
