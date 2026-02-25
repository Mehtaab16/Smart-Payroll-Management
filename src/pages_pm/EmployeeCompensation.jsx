// client/src/pages_pm/EmployeeCompensation.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import { listPaycodes } from "../api/paycodesApi.js";
import {
    createEmployeePaycode,
    endEmployeePaycode,
    listEmployeePaycodes,
} from "../api/employeePaycodesApi.js";

function monthNowYYYYMM() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

export default function EmployeeCompensation() {
    const { id } = useParams(); // employee user _id
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    const [paycodes, setPaycodes] = useState([]);
    const [assignments, setAssignments] = useState([]);

    const [form, setForm] = useState({
        paycodeId: "",
        effectiveFrom: monthNowYYYYMM(),
        effectiveTo: "",
        amount: "",
        percentage: "",
        hourlyRate: "",
        priority: "",
        note: "",
    });

    const paycodeById = useMemo(() => {
        const m = new Map();
        (paycodes || []).forEach((p) => m.set(p._id, p));
        return m;
    }, [paycodes]);

    async function load() {
        setLoading(true);
        setErr("");
        try {
            const pcs = await listPaycodes({ archived: "false" });
            setPaycodes(pcs || []);

            const list = await listEmployeePaycodes(id);
            setAssignments(list || []);
        } catch (e) {
            setErr(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [id]);

    async function onAdd() {
        setErr("");
        try {
            if (!form.paycodeId) throw new Error("Choose a paycode");
            const pc = paycodeById.get(form.paycodeId);
            const calcType = pc?.calcType;

            const payload = {
                paycodeId: form.paycodeId,
                effectiveFrom: form.effectiveFrom,
                effectiveTo: form.effectiveTo ? form.effectiveTo : null,
                note: form.note || "",
                priority: form.priority === "" ? null : Number(form.priority),

                // values (keep simple: use amount for fixed)
                amount: form.amount === "" ? null : Number(form.amount),
                percentage: form.percentage === "" ? null : Number(form.percentage),
                hourlyRate: form.hourlyRate === "" ? null : Number(form.hourlyRate),

                // optional: you can omit this and always use paycode.calcType
                calcType: null,
            };

            // small guard
            if (calcType === "fixed" && payload.amount == null) throw new Error("Amount is required for fixed paycodes");
            if (calcType === "percentage" && payload.percentage == null) throw new Error("Percentage is required");
            if (calcType === "hourly_rate" && payload.hourlyRate == null) throw new Error("Hourly rate is required");

            await createEmployeePaycode(id, payload);
            setForm((s) => ({ ...s, paycodeId: "", amount: "", percentage: "", hourlyRate: "", priority: "", note: "" }));
            await load();
        } catch (e) {
            setErr(e.message || "Failed to add");
        }
    }

    async function onEnd(assignmentId) {
        const effectiveTo = prompt("End month (YYYY-MM):", monthNowYYYYMM());
        if (!effectiveTo) return;

        setErr("");
        try {
            await endEmployeePaycode(id, assignmentId, effectiveTo);
            await load();
        } catch (e) {
            setErr(e.message || "Failed to end");
        }
    }

    return (
        <BackOfficeLayout>
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto max-w-6xl px-4 py-6">
                    <div>
                        <h1 className="text-xl font-semibold text-slate-900">Employee Compensation</h1>
                        <p className="text-sm text-slate-600">
                            Assign base salary and allowances using paycodes (effective-dated).
                        </p>
                    </div>

                    {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

                    <div className="mt-4 rounded-2xl border bg-white p-4">
                        <h2 className="text-sm font-semibold text-slate-900">Add assignment</h2>

                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div>
                                <label className="text-xs text-slate-600">Paycode</label>
                                <select
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.paycodeId}
                                    onChange={(e) => setForm((s) => ({ ...s, paycodeId: e.target.value }))}
                                >
                                    <option value="">Select...</option>
                                    {paycodes.map((p) => (
                                        <option key={p._id} value={p._id}>
                                            {p.code} — {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-600">Effective From (YYYY-MM)</label>
                                <input
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.effectiveFrom}
                                    onChange={(e) => setForm((s) => ({ ...s, effectiveFrom: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-600">Effective To (optional)</label>
                                <input
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.effectiveTo}
                                    onChange={(e) => setForm((s) => ({ ...s, effectiveTo: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-600">Amount (fixed)</label>
                                <input
                                    type="number"
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.amount}
                                    onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-600">Percentage</label>
                                <input
                                    type="number"
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.percentage}
                                    onChange={(e) => setForm((s) => ({ ...s, percentage: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-600">Hourly Rate</label>
                                <input
                                    type="number"
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.hourlyRate}
                                    onChange={(That) => setForm((s) => ({ ...s, hourlyRate: That.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-600">Priority override (optional)</label>
                                <input
                                    type="number"
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.priority}
                                    onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-xs text-slate-600">Note</label>
                                <input
                                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                                    value={form.note}
                                    onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={onAdd}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border bg-white p-4">
                        <h2 className="text-sm font-semibold text-slate-900">Assignments</h2>

                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-slate-600">
                                    <tr className="border-b">
                                        <th className="py-2 pr-3">Paycode</th>
                                        <th className="py-2 pr-3">From</th>
                                        <th className="py-2 pr-3">To</th>
                                        <th className="py-2 pr-3">Amount</th>
                                        <th className="py-2 pr-3">%</th>
                                        <th className="py-2 pr-3">Hourly</th>
                                        <th className="py-2 pr-3">Priority</th>
                                        <th className="py-2 pr-3"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td className="py-4 text-slate-500" colSpan={8}>Loading...</td></tr>
                                    ) : assignments.length === 0 ? (
                                        <tr><td className="py-4 text-slate-500" colSpan={8}>No assignments yet.</td></tr>
                                    ) : (
                                        assignments.map((a) => (
                                            <tr key={a._id} className="border-b last:border-b-0">
                                                <td className="py-2 pr-3">
                                                    <div className="font-mono text-xs">{a.paycodeId?.code}</div>
                                                    <div className="text-slate-700">{a.paycodeId?.name}</div>
                                                </td>
                                                <td className="py-2 pr-3">{a.effectiveFrom}</td>
                                                <td className="py-2 pr-3">{a.effectiveTo || "—"}</td>
                                                <td className="py-2 pr-3">{a.amount ?? "—"}</td>
                                                <td className="py-2 pr-3">{a.percentage ?? "—"}</td>
                                                <td className="py-2 pr-3">{a.hourlyRate ?? "—"}</td>
                                                <td className="py-2 pr-3">{a.priority ?? a.paycodeId?.defaultPriority ?? "—"}</td>
                                                <td className="py-2 pr-3 text-right">
                                                    {!a.effectiveTo && (
                                                        <button
                                                            onClick={() => onEnd(a._id)}
                                                            className="rounded-xl border px-3 py-1.5 text-xs hover:bg-slate-50"
                                                        >
                                                            End
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </BackOfficeLayout>
    );
}
