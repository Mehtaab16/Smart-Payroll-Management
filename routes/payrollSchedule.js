// server/routes/payrollSchedule.js
import express from "express";
import PayrollSchedule from "../models/PayrollSchedule.js";
import { authRequired, requireAnyRole } from "../middleware/auth.js";
import fetch from "node-fetch";


const router = express.Router();

function uniq(arr) {
    return Array.from(new Set(arr));
}

function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
}

function adjustToWorkday(payDate, holidays = []) {
    let d = new Date(payDate);
    while (isWeekend(d) || holidays.includes(d.toISOString().slice(0, 10))) {
        d.setDate(d.getDate() - 1);
    }
    return d;
}

function nextPayDateFromSchedule(sched, now = new Date()) {
    const rawPayDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        Number(sched.dayOfMonth || 25),
        12,
        0,
        0,
        0
    );

    const finalPayDate = sched.moveBackIfNonWorking
        ? adjustToWorkday(rawPayDate, sched.holidays || [])
        : rawPayDate;

    const runTime = new Date(now);
    runTime.setHours(Number(sched.runHour || 9), Number(sched.runMinute || 0), 0, 0);

    return { rawPayDate, finalPayDate, runTime };
}

async function getOrCreateSchedule(userId) {
    let sched = await PayrollSchedule.findOne().sort({ createdAt: -1 });
    if (!sched) {
        sched = await PayrollSchedule.create({ updatedBy: userId || null });
    }
    return sched;
}

router.use(authRequired, requireAnyRole(["admin", "payroll_manager"]));

// shared handlers

async function saveSchedule(req, res) {
    try {
        const body = req.body || {};

        const allowed = {
            enabled: body.enabled,
            dayOfMonth: body.dayOfMonth,
            moveBackIfNonWorking: body.moveBackIfNonWorking,
            runHour: body.runHour,
            runMinute: body.runMinute,
            holidays: Array.isArray(body.holidays) ? body.holidays : undefined,
            overridePeriod: body.overridePeriod,
            overrideRunDate: body.overrideRunDate,

            updatedBy: req.user?.userId,
        };

        const sched = await getOrCreateSchedule(req.user?.userId);

        Object.keys(allowed).forEach((k) => {
            if (allowed[k] !== undefined) sched[k] = allowed[k];
        });

        await sched.save();
        res.json(sched.toObject());
    } catch (e) {
        res.status(500).json({ message: "Failed to save payroll schedule", error: e.message });
    }
}

async function fetchHolidays(req, res) {
    try {
        const year = Number(req.query.year || new Date().getFullYear());
        const country = String(req.query.country || "MU").toUpperCase();

        const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;

        const r = await fetch(url, {
            method: "GET",
            headers: { "Accept": "application/json" },
        });

        if (!r.ok) {
            const txt = await r.text().catch(() => "");
            return res.status(502).json({
                message: "Holiday API failed",
                status: r.status,
                detail: txt || `HTTP ${r.status}`,
                url,
            });
        }

        const data = await r.json().catch(() => []);
        const holidays = uniq(
            (Array.isArray(data) ? data : [])
                .map((x) => x?.date)
                .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
        );

        const sched = await getOrCreateSchedule(req.user?.userId);
        sched.holidays = holidays;
        sched.updatedBy = req.user?.userId;
        await sched.save();

        res.json({ holidays, year, country, count: holidays.length });
    } catch (e) {
        res.status(500).json({
            message: "Failed to auto-fetch holidays",
            error: e?.message || String(e),
        });
    }
}

 //GET /api/pm/scheduler

router.get("/", async (req, res) => {
    try {
        const sched = await getOrCreateSchedule(req.user?.userId);
        res.json(sched.toObject());
    } catch (e) {
        res.status(500).json({ message: "Failed to load payroll schedule", error: e.message });
    }
});

 //PUT /api/pm/scheduler
 
router.put("/", saveSchedule);


 //POST /api/pm/scheduler
 
router.post("/", saveSchedule);


 //GET /api/pm/scheduler/preview
 
router.get("/preview", async (req, res) => {
    try {
        const sched = await PayrollSchedule.findOne().sort({ createdAt: -1 }).lean();
        if (!sched) return res.status(404).json({ message: "No schedule found" });

        const now = new Date();
        const { rawPayDate, finalPayDate, runTime } = nextPayDateFromSchedule(sched, now);

        res.json({
            now: now.toISOString(),
            enabled: !!sched.enabled,
            rawPayDate: rawPayDate.toISOString(),
            finalPayDate: finalPayDate.toISOString(),
            runTimeToday: runTime.toISOString(),
            moveBackIfNonWorking: !!sched.moveBackIfNonWorking,
            holidaysCount: (sched.holidays || []).length,
            overridePeriod: sched.overridePeriod || "",

        });
    } catch (e) {
        res.status(500).json({ message: "Failed to preview schedule", error: e.message });
    }
});

 // POST /api/pm/scheduler/holidays/refresh?year=2026
 
router.post("/holidays/refresh", fetchHolidays);

//POST /api/pm/scheduler/auto-fetch?year=2026&country=MU

router.post("/auto-fetch", fetchHolidays);


 //GET /api/pm/scheduler/calendar?year=2026
 
router.get("/calendar", async (req, res) => {
    try {
        const year = Number(req.query.year || new Date().getFullYear());
        if (!Number.isFinite(year) || year < 2000 || year > 2100) {
            return res.status(400).json({ message: "Invalid year" });
        }

        const sched = await PayrollSchedule.findOne().sort({ createdAt: -1 }).lean();
        if (!sched) return res.status(404).json({ message: "No schedule found" });

        const holidays = Array.isArray(sched.holidays) ? sched.holidays : [];
        const out = [];

        for (let month = 0; month < 12; month++) {
            const raw = new Date(year, month, Number(sched.dayOfMonth || 25), 12, 0, 0, 0);

            let final = raw;
            let reason = "none";

            if (sched.moveBackIfNonWorking) {
                const rawISO = raw.toISOString().slice(0, 10);
                const rawWeekend = isWeekend(raw);
                const rawHoliday = holidays.includes(rawISO);

                final = adjustToWorkday(raw, holidays);

                const finalISO = final.toISOString().slice(0, 10);
                if (finalISO !== rawISO) {
                    if (rawWeekend && rawHoliday) reason = "weekend+holiday";
                    else if (rawWeekend) reason = "weekend";
                    else if (rawHoliday) reason = "holiday";
                    else reason = "moved";
                }
            }

            out.push({
                month: month + 1,
                period: `${year}-${String(month + 1).padStart(2, "0")}`,
                rawPayDate: raw.toISOString(),
                finalPayDate: final.toISOString(),
                movedBack: final.toISOString().slice(0, 10) !== raw.toISOString().slice(0, 10),
                reason,
            });
        }

        res.json({
            year,
            schedule: {
                dayOfMonth: sched.dayOfMonth,
                moveBackIfNonWorking: !!sched.moveBackIfNonWorking,
            },
            items: out,
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to build calendar", error: e.message });
    }
});

export default router;
