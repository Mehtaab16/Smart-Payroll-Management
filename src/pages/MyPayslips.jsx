// client/src/pages/MyPayslips.jsx ✅ FULL FILE
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SidebarLayout from "../components/SidebarLayout.jsx";

function money(n) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "MUR" }).format(n || 0);
}

export default function MyPayslips() {
    const nav = useNavigate();
    const [items, setItems] = useState([]);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            nav("/login");
            return;
        }

        setLoading(true);
        setErr("");

        fetch("http://localhost:5000/api/payslips/mine", {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (r) => {
                const j = await r.json().catch(() => []);
                if (r.status === 401 || r.status === 403) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    nav("/login");
                    return null;
                }
                if (!r.ok) throw new Error(j.message || "Failed to load payslips");
                return j;
            })
            .then((j) => setItems(Array.isArray(j) ? j : []))
            .catch((e) => setErr(e.message))
            .finally(() => setLoading(false));
    }, [nav]);

    const rows = useMemo(() => {
        const list = Array.isArray(items) ? items : [];

        // sort newest first using createdAt, then payDate
        const sorted = [...list].sort((a, b) => {
            const ac = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bc = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (bc !== ac) return bc - ac;

            const ap = a?.payPeriod?.payDate ? new Date(a.payPeriod.payDate).getTime() : 0;
            const bp = b?.payPeriod?.payDate ? new Date(b.payPeriod.payDate).getTime() : 0;
            return bp - ap;
        });

        // label: first in each period = Payslip, additional = Payslip Adjustment
        const seen = {};
        return sorted.map((p) => {
            const period = p?.payPeriod?.period || "UNKNOWN";
            const idx = seen[period] || 0;
            seen[period] = idx + 1;

            return {
                p,
                label: idx === 0 ? "Payslip" : "Payslip Adjustment",
            };
        });
    }, [items]);

    return (
        <SidebarLayout title="My Documents" showWelcome={false}>
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">My Payslips</h1>
                    <p className="text-white/60 text-sm">View and download your payslips</p>
                </div>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">Loading…</div>
            ) : err ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-200">{err}</div>
            ) : rows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">No payslips yet.</div>
            ) : (
                <div className="grid gap-3">
                    {rows.map(({ p, label }) => (
                        <Link
                            key={p._id}
                            to={`/payslips/${p._id}`}
                            className="block rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-4"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="font-semibold">
                                        {p.payPeriod?.period} <span className="text-white/60 font-normal text-sm">• {label}</span>
                                    </div>
                                    <div className="text-xs text-white/60">
                                        Pay Date: {p.payPeriod?.payDate ? new Date(p.payPeriod.payDate).toLocaleDateString() : "-"}
                                        {p.status ? ` • Status: ${p.status}` : ""}
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs text-white/60">Net Pay</div>
                                    <div className="text-lg font-bold">{money(p.totals?.netPay)}</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </SidebarLayout>
    );
}
