// services/payrollRunner.js
import User from "../models/User.js";
import Payslip from "../models/Payslip.js";
import PayrollRun from "../models/PayrollRun.js";
import PayrollAdjustment from "../models/PayrollAdjustment.js";
import EmployeePaycodeAssignment from "../models/EmployeePaycodeAssignment.js";
import PayrollAnomaly from "../models/PayrollAnomaly.js";
import OvertimeRequest from "../models/OvertimeRequest.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Paycode from "../models/Paycode.js";
import { sendPayslipReleasedEmail, sendAnomalyAlertEmail } from "../utils/mailer.js";

function isYYYYMM(v) {
    return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function sum(items) {
    return (items || []).reduce((acc, it) => acc + Number(it?.amount || 0), 0);
}

function sevRank(s) {
    if (s === "high") return 3;
    if (s === "medium") return 2;
    return 1;
}

function maxSeverity(items) {
    let best = "low";
    for (const it of items || []) {
        if (sevRank(it.severity) > sevRank(best)) best = it.severity;
    }
    return best;
}

function periodRange(period) {
    const [y, m] = String(period).split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    return { start, end };
}

function looksLikeOvertimePaycode(pc) {
    const code = String(pc?.code || "").toLowerCase();
    const name = String(pc?.name || "").toLowerCase();
    return code.includes("ot") || code.includes("overtime") || name.includes("overtime") || name.includes("ot");
}

function looksLikeUnpaidLeavePaycode(pc) {
    const code = String(pc?.code || "").toLowerCase();
    const name = String(pc?.name || "").toLowerCase();
    return code.includes("unpaid") || name.includes("unpaid") || name.includes("unpaid leave");
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function daysInclusive(a, b) {
    const A = startOfDay(a).getTime();
    const B = startOfDay(b).getTime();
    if (!Number.isFinite(A) || !Number.isFinite(B) || B < A) return 0;
    return Math.floor((B - A) / (24 * 60 * 60 * 1000)) + 1;
}

function daysInMonthFromPeriod(period) {
    const [y, m] = String(period).split("-").map(Number);
    return new Date(y, m, 0).getDate(); // last day of month
}

// BONUS (December) helpers

function isDecemberPeriod(period) {
    // period YYYY-MM 
    const m = String(period).split("-")[1];
    return m === "12";
}

async function ensureBonusPaycodeExists() {
    // Create only if missing. Never overwrite an existing BONUS paycode.
    const code = "BONUS";

    const existing = await Paycode.findOne({ code }).lean();
    if (existing) return existing;

    const created = await Paycode.create({
        name: "December Bonus",
        code,
        type: "earning",
        visibleOnPayslip: true,
        active: true,
        archivedAt: null,
        calcType: "fixed",
        defaultPriority: 60,
        createdBy: null,
        updatedBy: null,
    });

    return created?.toObject?.() || created;
}

function hasBonusAlready(earnings) {
    return (earnings || []).some((it) => String(it?.label || "").toUpperCase().startsWith("BONUS -"));
}

// Core compute 

async function computeEarningsDeductions({ employeeId, period }) {
    const assigns = await EmployeePaycodeAssignment.find({
        employeeId,
        effectiveFrom: { $lte: period },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: period } }],
    })
        .populate("paycodeId")
        .lean();

    const adjs = await PayrollAdjustment.find({
        employee: employeeId,
        period,
        status: "pending",
    }).lean();

    //Overtime (accepted only) within the payroll period
    const { start, end } = periodRange(period);
    const otList = await OvertimeRequest.find({
        employee: employeeId,
        status: "accepted",
        date: { $gte: start, $lt: end },
    })
        .select("hours")
        .lean();

    const totalOtHours =
        Math.round((otList || []).reduce((s, r) => s + Number(r?.hours || 0), 0) * 100) / 100;

    //Unpaid leave (accepted only) overlapping payroll period
    const unpaidLeaves = await LeaveRequest.find({
        employee: employeeId,
        status: "accepted",
        type: "Unpaid Leave",
        startDate: { $lt: end },
        endDate: { $gte: start },
    })
        .select("startDate endDate")
        .lean();

    let unpaidDays = 0;
    for (const l of unpaidLeaves || []) {
        const s = l?.startDate ? new Date(l.startDate) : null;
        const e = l?.endDate ? new Date(l.endDate) : null;
        if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;

        const overlapStart = s > start ? s : start;
        const overlapEnd = e < new Date(end.getTime() - 1) ? e : new Date(end.getTime() - 1);

        unpaidDays += daysInclusive(overlapStart, overlapEnd);
    }

    const earnings = [];
    const deductions = [];
    const percentPaycodes = [];
    let baseForUnpaid = 0;

    //fixed/manual + hourly_rate
    for (const a of assigns) {
        const pc = a.paycodeId;
        if (!pc || pc.archivedAt || pc.active === false) continue;

        const calcType = a.calcType || pc.calcType || "fixed";

        if (calcType === "percentage") {
            percentPaycodes.push({ a, pc });
            continue;
        }

        let amount = 0;

        if (calcType === "fixed") {
            amount = Number(a.amount ?? 0);
        } else if (calcType === "manual") {
            amount = Number(a.amount ?? 0);
        } else if (calcType === "hourly_rate") {
            // overtime auto-calc 
            if (totalOtHours > 0 && looksLikeOvertimePaycode(pc)) {
                const rate = Number(a.hourlyRate ?? 0);
                amount = rate * totalOtHours;
            } else {
                // non-overtime hourly_rate uses assignment.amount as "units/hours"
                const units = Number(a.amount ?? 0);
                const rate = Number(a.hourlyRate ?? 0);
                amount = units > 0 && rate > 0 ? units * rate : 0;
            }
        } else {
            amount = 0;
        }

        if (!Number.isFinite(amount) || amount < 0) amount = 0;

        const isOT = looksLikeOvertimePaycode(pc) && calcType === "hourly_rate" && totalOtHours > 0;

        const label = isOT
            ? `${pc.code} - ${pc.name} (${totalOtHours}h × ${Number(a.hourlyRate ?? 0)})`
            : calcType === "hourly_rate"
                ? `${pc.code} - ${pc.name} (${Number(a.amount ?? 0)} × ${Number(a.hourlyRate ?? 0)})`
                : `${pc.code} - ${pc.name}`;

        const item = {
            label,
            amount: Math.round(amount * 100) / 100,
            visibleOnPayslip: pc.visibleOnPayslip !== false,
        };

        if (pc.type === "earning") {
            earnings.push(item);

            // Base for unpaid leave: fixed/manual earnings that are NOT overtime
            if ((calcType === "fixed" || calcType === "manual") && !looksLikeOvertimePaycode(pc)) {
                baseForUnpaid += Number(item.amount || 0);
            }
        } else {
            deductions.push(item);
        }
    }

    // Adjustments
    for (const adj of adjs) {
        const item = {
            label: `${adj.paycodeCode} - ${adj.paycodeName || "Adjustment"}`,
            amount: Number(adj.amount || 0),
            visibleOnPayslip: true,
        };
        if (adj.type === "earning") earnings.push(item);
        else deductions.push(item);
    }

    // Unpaid leave deduction (computed)
    if (unpaidDays > 0) {
        const dim = daysInMonthFromPeriod(period);
        const dailyRate = dim > 0 ? baseForUnpaid / dim : 0;
        let unpaidAmt = dailyRate * unpaidDays;

        if (!Number.isFinite(unpaidAmt) || unpaidAmt < 0) unpaidAmt = 0;
        unpaidAmt = Math.round(unpaidAmt * 100) / 100;

        const unpaidPc = (assigns || [])
            .map((x) => x?.paycodeId)
            .find((pc) => pc && pc.type === "deduction" && looksLikeUnpaidLeavePaycode(pc) && pc.active !== false && !pc.archivedAt);

        deductions.push({
            label: unpaidPc ? `${unpaidPc.code} - ${unpaidPc.name} (${unpaidDays} day(s))` : `UNPAID_LEAVE - Unpaid Leave (${unpaidDays} day(s))`,
            amount: unpaidAmt,
            visibleOnPayslip: unpaidPc ? unpaidPc.visibleOnPayslip !== false : true,
        });
    }

    //December Bonus (auto for all employees in Dec)
    //Uses baseForUnpaid as the safest "monthly base" in your current model.
    //Will not add if it already exists (assignment/adjustment/custom).
    if (isDecemberPeriod(period) && baseForUnpaid > 0 && !hasBonusAlready(earnings)) {
        let bonusPc = null;

        try {
            bonusPc = await ensureBonusPaycodeExists();
        } catch {
            
            bonusPc = null;
        }

        const bonusAmt = Math.round(Number(baseForUnpaid || 0) * 100) / 100;

        if (Number.isFinite(bonusAmt) && bonusAmt > 0) {
            earnings.push({
                label: `BONUS - ${bonusPc?.name || "December Bonus"}`,
                amount: bonusAmt,
                visibleOnPayslip: bonusPc ? bonusPc.visibleOnPayslip !== false : true,
            });
        }
    }

    //percentage based on base gross (earnings+ adjustments + bonus)
    const baseGross = (earnings || []).reduce((s, it) => s + Number(it?.amount || 0), 0);

    for (const { a, pc } of percentPaycodes) {
        if (!pc || pc.archivedAt || pc.active === false) continue;

        const pct = Number(a.percentage ?? 0);
        let amount = (baseGross * pct) / 100;

        if (!Number.isFinite(amount) || amount < 0) amount = 0;

        const item = {
            label: `${pc.code} - ${pc.name} (${pct}%)`,
            amount: Math.round(amount * 100) / 100,
            visibleOnPayslip: pc.visibleOnPayslip !== false,
        };

        if (pc.type === "earning") earnings.push(item);
        else deductions.push(item);
    }

    return {
        earnings,
        deductions,
        adjustments: adjs,
        overtime: { hoursAccepted: totalOtHours },
        unpaidLeave: { daysAccepted: unpaidDays },
    };
}

async function addHistoricalAnomalyChecks({ period, employeeId, grossPay, netPay, deductions }) {
    const prev = await Payslip.find({
        employee: employeeId,
        "payPeriod.period": { $lt: period },
        status: "released",
    })
        .sort({ "payPeriod.period": -1, createdAt: -1 })
        .limit(3)
        .lean();

    if (!prev.length) return [];

    const avgNet = prev.reduce((s, p) => s + Number(p?.totals?.netPay || 0), 0) / prev.length;
    const avgGross = prev.reduce((s, p) => s + Number(p?.totals?.grossPay || 0), 0) / prev.length;

    const anomalies = [];

    if (avgNet > 0 && netPay > avgNet * 1.4) {
        anomalies.push({
            severity: "medium",
            type: "NET_SPIKE",
            message: "Net pay unusually high vs recent history",
            meta: { netPay, avgNet, multiplier: Number((netPay / avgNet).toFixed(2)) },
        });
    }

    if (avgGross > 0 && grossPay > avgGross * 1.4) {
        anomalies.push({
            severity: "medium",
            type: "GROSS_SPIKE",
            message: "Gross pay unusually high vs recent history",
            meta: { grossPay, avgGross, multiplier: Number((grossPay / avgGross).toFixed(2)) },
        });
    }

    if (grossPay > 0 && deductions > grossPay * 0.6) {
        anomalies.push({
            severity: "high",
            type: "DEDUCTIONS_TOO_HIGH",
            message: "Deductions exceed 60% of gross pay",
            meta: { grossPay, deductions, ratio: Number((deductions / grossPay).toFixed(2)) },
        });
    }

    return anomalies;
}

async function detectAnomalies({ period, payrollRunId, employee, payslip }) {
    const items = [];
    const gross = Number(payslip?.totals?.grossPay || 0);
    const ded = Number(payslip?.totals?.totalDeductions || 0);
    const net = Number(payslip?.totals?.netPay || 0);

    if (net < 0) items.push({ severity: "high", type: "NEGATIVE_NET", message: "Net pay is negative", meta: { net } });
    if (ded > gross) items.push({ severity: "high", type: "DEDUCTIONS_GT_GROSS", message: "Deductions exceed gross pay", meta: { gross, deductions: ded } });

    const hist = await addHistoricalAnomalyChecks({
        period,
        employeeId: employee._id,
        grossPay: gross,
        netPay: net,
        deductions: ded,
    });
    items.push(...hist);

    if (!items.length) return { count: 0, hasHigh: false };

    const payslipId = payslip?._id;
    const sev = maxSeverity(items);

    await PayrollAnomaly.findOneAndUpdate(
        { period, payrollRunId, employee: employee._id, payslipId },
        {
            $set: {
                employeeSnapshot: {
                    fullName: employee.fullName || "",
                    email: employee.email || "",
                    employeeId: employee.employeeId || "",
                },
                items,
                anomalyCount: items.length,
                severity: sev,
                type: "MULTI",
                message: items.length === 1 ? items[0].message : `Multiple anomalies detected (${items.length})`,
                meta: { payslipId },
                status: "open",
                reviewedBy: null,
                reviewedAt: null,
                decision: "",
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { count: items.length, hasHigh: items.some((a) => a.severity === "high") };
}

async function notifyAdminsAndPM({ period, employee, payslipId, anomalyCount }) {
    const users = await User.find({ role: { $in: ["admin", "payroll_manager"] }, isActive: true }).lean();
    const emails = Array.from(new Set(users.map((u) => u.email).filter(Boolean)));
    if (!emails.length) return;

    await sendAnomalyAlertEmail({
        to: emails,
        period,
        employeeName: employee.fullName,
        employeeEmail: employee.email,
        payslipId,
        anomalyCount,
    });
}

export async function runPayrollSystem({ period, payDate, selectedEmployeeIds }) {
    if (!isYYYYMM(period)) throw new Error("period must be YYYY-MM");

    const pd = new Date(payDate);
    if (Number.isNaN(pd.getTime())) throw new Error("Invalid payDate");

    //allow scheduler to run ALL employees if no selectedEmployeeIds
    const ids = Array.isArray(selectedEmployeeIds) ? selectedEmployeeIds.filter(Boolean) : [];

    const run = await PayrollRun.create({
        period,
        payDate: pd,
        status: "running",
        createdBy: null,
        startedAt: new Date(),
        meta: { selectedCount: ids.length || 0 },
        counts: {
            employees: 0,
            payslipsCreated: 0,
            payslipsFailed: 0,
            anomaliesFound: 0,
            payslipsBlocked: 0,
            emailedCount: 0,
            anomalyAlertsSent: 0,
        },
    });

    const empQuery = { role: "employee", isActive: true };
    if (ids.length) empQuery._id = { $in: ids };

    const employees = await User.find(empQuery).lean();

    let created = 0;
    let failed = 0;
    let anomalyCount = 0;
    let blockedCount = 0;
    let emailedCount = 0;
    let anomalyAlertCount = 0;
    let processed = 0;
    let released = 0;

    for (const emp of employees) {
        try {
            const alreadyReleased = await Payslip.findOne({
                employee: emp._id,
                "payPeriod.period": period,
                status: "released",
            })
                .select("_id")
                .lean();

            const { earnings, deductions, adjustments } = await computeEarningsDeductions({ employeeId: emp._id, period });
            const hasAdjustments = !!(adjustments && adjustments.length);

            if (alreadyReleased && !hasAdjustments) {
                continue;
            }

            processed += 1;

            const slip = await Payslip.create({
                employee: emp._id,
                employeeSnapshot: {
                    fullName: emp.fullName,
                    email: emp.email,
                    employeeId: emp.employeeId || "",
                    address: emp.address || "",
                },
                payPeriod: { period, payDate: pd },
                earnings: [],
                deductions: [],
                totals: { grossPay: 0, totalDeductions: 0, netPay: 0 },
                status: "draft",
                payslipNumber: "",
                processingStatus: "in_progress",
                payrollRunId: run._id,
                payslipKind: hasAdjustments ? "adjustment" : "regular",
            });

            const grossPay = sum(earnings);
            const totalDeductions = sum(deductions);
            const netPay = grossPay - totalDeductions;

            slip.earnings = earnings;
            slip.deductions = deductions;
            slip.totals = { grossPay, totalDeductions, netPay };
            slip.processingStatus = "completed";

            const anomRes = await detectAnomalies({
                period,
                payrollRunId: run._id,
                employee: emp,
                payslip: slip.toObject(),
            });

            anomalyCount += anomRes.count;

            if (anomRes.hasHigh) {
                slip.status = "draft";
                await slip.save();

                blockedCount += 1;
                await notifyAdminsAndPM({ period, employee: emp, payslipId: slip._id, anomalyCount: anomRes.count });
                anomalyAlertCount += 1;

                created += 1;
                continue;
            }

            slip.status = "released";
            await slip.save();

            if (hasAdjustments) {
                await PayrollAdjustment.updateMany(
                    { _id: { $in: adjustments.map((a) => a._id) } },
                    { $set: { status: "applied", updatedBy: null } }
                );
            }

            await sendPayslipReleasedEmail({
                to: emp.email,
                fullName: emp.fullName,
                period,
                payslipId: slip._id,
                kind: slip.payslipKind || (hasAdjustments ? "adjustment" : "regular"),
            });

            emailedCount += 1;
            released += 1;
            created += 1;
        } catch {
            failed += 1;
            await Payslip.updateMany(
                { employee: emp._id, "payPeriod.period": period, payrollRunId: run._id, processingStatus: "in_progress" },
                { $set: { processingStatus: "failed" } }
            );
        }
    }

    run.set("counts", {
        ...(run.counts || {}),
        employees: employees.length,
        payslipsCreated: created,
        payslipsFailed: failed,
        anomaliesFound: anomalyCount,
        payslipsBlocked: blockedCount,
        emailedCount: emailedCount,
        anomalyAlertsSent: anomalyAlertCount,
    });

    run.status = "completed";
    run.completedAt = new Date();
    await run.save();

    return {
        runId: run._id,
        processed,
        created,
        released,
        failed,
        anomalies: anomalyCount,
        blocked: blockedCount,
        emailed: emailedCount,
        anomalyAlerts: anomalyAlertCount,
    };
}