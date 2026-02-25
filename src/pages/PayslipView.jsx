import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout.jsx";

function money(n) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "MUR" }).format(n || 0);
}

function safeFilePart(s) {
    return (s || "Payslip").toString().trim().replace(/[^\w-]+/g, "-");
}

export default function PayslipView() {
    const { id } = useParams();
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            nav("/login");
            return;
        }

        fetch(`http://localhost:5000/api/payslips/${id}/view`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(async (r) => {
                const j = await r.json();
                if (r.status === 401 || r.status === 403) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    nav("/login");
                    return null;
                }
                if (!r.ok) throw new Error(j.message || "Failed to load payslip");
                return j;
            })
            .then((j) => {
                if (!j) return;
                setData(j);
            })
            .catch((e) => setErr(e.message));
    }, [id, nav]);

    async function downloadPdf() {
        const token = localStorage.getItem("token");
        setDownloading(true);

        try {
            const res = await fetch(`http://localhost:5000/api/payslips/${id}/pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                nav("/login");
                return;
            }

            if (!res.ok) {
                let msg = "Failed to download PDF";
                try {
                    const j = await res.json();
                    msg = j.message || msg;
                } catch { }
                throw new Error(msg);
            }

            const period = data?.payslip?.payPeriod?.period || "Payslip";
            const filename = `Payslip-${safeFilePart(period)}.pdf`;

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(e.message);
        } finally {
            setDownloading(false);
        }
    }

    if (err) {
        return (
            <AppLayout title="Payslip Preview">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-red-200">
                    Error: {err}
                </div>
            </AppLayout>
        );
    }

    if (!data) {
        return (
            <AppLayout title="Payslip Preview">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
                    Loading…
                </div>
            </AppLayout>
        );
    }

    const { company, payslip } = data;
    const displayEmail = "casagrande@gmail.com";

    return (
        <AppLayout title="Payslip Preview">
            <div className="mb-4 flex items-center justify-between gap-3">
                <button
                    onClick={() => nav("/documents")}
                    className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm"
                >
                    ← Back
                </button>

                <div className="flex gap-2">
                    <button
                        onClick={() => window.print()}
                        className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm"
                    >
                        Print
                    </button>

                    <button
                        onClick={downloadPdf}
                        disabled={downloading}
                        className="rounded-xl bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                        {downloading ? "Downloading..." : "Download PDF"}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl bg-white text-slate-900 p-6 shadow-xl">
                <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-4">
                        {company?.logoUrl ? (
                            <img src={company.logoUrl} alt="Company Logo" className="h-28 w-28 object-contain" />
                        ) : (
                            <div className="h-28 w-28 border border-dashed border-slate-300 flex items-center justify-center text-slate-500">
                                Logo
                            </div>
                        )}

                        <div className="text-sm text-slate-700 leading-5">
                            <div className="whitespace-pre-line">{company?.companyAddress || ""}</div>
                            <div className="mt-2">
                                {company?.companyPhone ? `Tel: ${company.companyPhone}` : "Tel: -"}
                                {" • "}
                                {displayEmail}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-lg font-bold tracking-wide">PAYSLIP</div>
                        <div className="text-sm text-slate-700">Payslip No: {payslip.payslipNumber || "-"}</div>
                        <div className="text-sm text-slate-700">Period: {payslip.payPeriod?.period || "-"}</div>
                        <div className="text-sm text-slate-700">
                            Pay Date:{" "}
                            {payslip.payPeriod?.payDate ? new Date(payslip.payPeriod.payDate).toLocaleDateString() : "-"}
                        </div>
                    </div>
                </div>

                <hr className="my-5 border-slate-200" />

                <div className="flex items-start justify-between gap-6">
                    <div>
                        <div className="font-semibold">Employee</div>
                        <div>{payslip.employeeSnapshot?.fullName}</div>
                        <div className="text-sm text-slate-600">{payslip.employeeSnapshot?.email}</div>
                        {payslip.employeeSnapshot?.address ? (
                            <div className="mt-1 whitespace-pre-line text-sm text-slate-600">
                                {payslip.employeeSnapshot.address}
                            </div>
                        ) : null}
                    </div>

                    <div className="text-right">
                        <div className="font-semibold">Employee ID</div>
                        <div>{payslip.employeeSnapshot?.employeeId || "-"}</div>
                    </div>
                </div>

                <hr className="my-5 border-slate-200" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Section title="Earnings" items={payslip.earnings} />
                    <Section title="Deductions" items={payslip.deductions} />
                </div>

                <hr className="my-5 border-slate-200" />

                <div className="flex justify-end">
                    <div className="w-full max-w-sm space-y-2">
                        <Row label="Gross Pay" value={money(payslip.totals?.grossPay)} bold />
                        <Row label="Total Deductions" value={money(payslip.totals?.totalDeductions)} />
                        <Row label="Net Pay" value={money(payslip.totals?.netPay)} bold />
                    </div>
                </div>

                <div className="mt-4 text-xs text-slate-500">
                    This document is system-generated and does not require a signature.
                </div>
            </div>
        </AppLayout>
    );
}

function Section({ title, items }) {
    return (
        <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold mb-3">{title}</div>
            <div className="space-y-2">
                {(items || []).map((it, idx) => (
                    <Row key={idx} label={it.label} value={money(it.amount)} />
                ))}
                {(items || []).length === 0 ? <div className="text-sm text-slate-500">No items</div> : null}
            </div>
        </div>
    );
}

function Row({ label, value, bold }) {
    return (
        <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
            <div>{label}</div>
            <div>{value}</div>
        </div>
    );
}
