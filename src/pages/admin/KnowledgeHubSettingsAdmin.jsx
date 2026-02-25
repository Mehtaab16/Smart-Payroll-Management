// client/src/pages_pm/admin/KnowledgeHubSettingsAdmin.jsx ✅ FULL FILE (clamp + defaults)
import { useEffect, useState } from "react";
import BackOfficeLayout from "../../components/BackOfficeLayout.jsx";
import { getKnowledgeSettings, updateKnowledgeSettings } from "../../api/knowledgeApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function Pill({ active, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
        >
            {children}
        </button>
    );
}

function clamp01(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return 0.75;
    return Math.max(0, Math.min(1, x));
}

export default function KnowledgeHubSettingsAdmin() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null); // {tone,text}

    const [settings, setSettings] = useState(null);

    const categories = ["payroll", "leave", "overtime", "it", "hr", "system"];

    // sensible defaults (so admin isn’t staring at blank)
    const DEFAULT_PAYROLL = ["payslip", "salary", "tax", "deduction", "allowance", "overtime", "leave", "pay date", "bank", "pension"];
    const DEFAULT_TECH = ["login", "password", "error", "access", "account", "cannot", "failed", "bug", "issue", "system", "crash"];

    async function load() {
        setLoading(true);
        setMsg(null);
        try {
            const s = await getKnowledgeSettings();

            // ✅ patch defaults in UI state (no backend breaking)
            const payrollKeywords = Array.isArray(s?.routingRules?.payrollKeywords) ? s.routingRules.payrollKeywords : [];
            const technicalKeywords = Array.isArray(s?.routingRules?.technicalKeywords) ? s.routingRules.technicalKeywords : [];

            const patched = {
                ...(s || {}),
                allowPmUploads: s?.allowPmUploads !== false, // default true
                allowedCategories: Array.isArray(s?.allowedCategories) && s.allowedCategories.length ? s.allowedCategories : categories,
                escalation: {
                    ...(s?.escalation || {}),
                    minSimilarity:
                        typeof s?.escalation?.minSimilarity === "number" ? clamp01(s.escalation.minSimilarity) : 0.75,
                },
                routingRules: {
                    ...(s?.routingRules || {}),
                    payrollKeywords: payrollKeywords.length ? payrollKeywords : DEFAULT_PAYROLL,
                    technicalKeywords: technicalKeywords.length ? technicalKeywords : DEFAULT_TECH,
                },
            };

            setSettings(patched);
        } catch {
            setMsg({ tone: "error", text: "Failed to load settings." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function save() {
        setSaving(true);
        setMsg(null);
        try {
            // ✅ ensure minSimilarity is 0..1 before saving
            const payload = {
                ...(settings || {}),
                escalation: {
                    ...(settings?.escalation || {}),
                    minSimilarity: clamp01(settings?.escalation?.minSimilarity),
                },
            };

            const updated = await updateKnowledgeSettings(payload);
            setSettings({
                ...(updated || payload),
                escalation: {
                    ...(updated?.escalation || payload.escalation),
                    minSimilarity: clamp01((updated?.escalation || payload.escalation)?.minSimilarity),
                },
            });

            setMsg({ tone: "success", text: "Saved." });
        } catch {
            setMsg({ tone: "error", text: "Save failed." });
        } finally {
            setSaving(false);
        }
    }

    function toggleCategory(c) {
        setSettings((prev) => {
            const cur = prev?.allowedCategories || categories;
            const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
            return { ...(prev || {}), allowedCategories: next };
        });
    }

    const minSim = settings?.escalation?.minSimilarity ?? 0.75;
    const minSimOutOfRange = typeof minSim === "number" ? minSim < 0 || minSim > 1 : true;

    return (
        <BackOfficeLayout title="Knowledge Hub Settings">
            <div className="rounded-[28px] bg-white text-slate-900 border border-slate-200 p-6">
                {loading ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600">Loading…</div>
                ) : !settings ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600">
                        Could not load settings.
                    </div>
                ) : (
                    <>
                        {msg ? (
                            <div
                                className={cn(
                                    "mb-4 rounded-2xl border px-4 py-3 text-sm",
                                    msg.tone === "success"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                        : "border-rose-200 bg-rose-50 text-rose-800"
                                )}
                            >
                                {msg.text}
                            </div>
                        ) : null}

                        <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-6">
                            {/* Allowed categories */}
                            <div>
                                <div className="text-base font-semibold text-slate-900">Allowed categories</div>
                                <div className="text-sm text-slate-600 mt-1">
                                    These categories are considered “in scope” for the Knowledge Hub.
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    {categories.map((c) => (
                                        <Pill
                                            key={c}
                                            active={(settings.allowedCategories || []).includes(c)}
                                            onClick={() => toggleCategory(c)}
                                        >
                                            {c.toUpperCase()}
                                        </Pill>
                                    ))}
                                </div>
                            </div>

                            {/* Escalation */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-base font-semibold text-slate-900">Escalation threshold</div>
                                    <div className="text-sm text-slate-600 mt-1">
                                        If the top similarity is below this, we suggest a ticket.
                                    </div>

                                    <label className="block text-xs text-slate-600 mt-3 mb-1">
                                        Min similarity (0.00 - 1.00)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="1"
                                        value={minSim}
                                        onChange={(e) =>
                                            setSettings((p) => ({
                                                ...(p || {}),
                                                escalation: {
                                                    ...(p?.escalation || {}),
                                                    minSimilarity: Number(e.target.value),
                                                },
                                            }))
                                        }
                                        onBlur={() =>
                                            setSettings((p) => ({
                                                ...(p || {}),
                                                escalation: {
                                                    ...(p?.escalation || {}),
                                                    minSimilarity: clamp01(p?.escalation?.minSimilarity),
                                                },
                                            }))
                                        }
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                    />

                                    {minSimOutOfRange ? (
                                        <div className="mt-2 text-xs text-rose-700">
                                            Value must be between 0 and 1. It will be clamped on save/blur.
                                        </div>
                                    ) : null}
                                </div>

                                <div>
                                    <div className="text-base font-semibold text-slate-900">PM uploads</div>
                                    <div className="text-sm text-slate-600 mt-1">
                                        Allow Payroll Manager to upload docs.
                                    </div>

                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSettings((p) => ({ ...(p || {}), allowPmUploads: !p?.allowPmUploads }))
                                            }
                                            className={cn(
                                                "rounded-2xl px-4 py-2 text-sm font-semibold border transition",
                                                settings.allowPmUploads
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                                    : "border-slate-200 bg-slate-50 text-slate-800"
                                            )}
                                        >
                                            {settings.allowPmUploads ? "Enabled" : "Disabled"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Routing rules */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-base font-semibold text-slate-900">Payroll keywords</div>
                                    <div className="text-sm text-slate-600 mt-1">
                                        Used to pick Payroll vs Technical escalation.
                                    </div>

                                    <textarea
                                        value={(settings?.routingRules?.payrollKeywords || []).join(", ")}
                                        onChange={(e) =>
                                            setSettings((p) => ({
                                                ...(p || {}),
                                                routingRules: {
                                                    ...(p?.routingRules || {}),
                                                    payrollKeywords: e.target.value
                                                        .split(",")
                                                        .map((x) => x.trim())
                                                        .filter(Boolean),
                                                },
                                            }))
                                        }
                                        className="mt-2 w-full min-h-[100px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                        placeholder="payslip, salary, tax, ..."
                                    />
                                </div>

                                <div>
                                    <div className="text-base font-semibold text-slate-900">Technical keywords</div>
                                    <div className="text-sm text-slate-600 mt-1">
                                        Used to pick Payroll vs Technical escalation.
                                    </div>

                                    <textarea
                                        value={(settings?.routingRules?.technicalKeywords || []).join(", ")}
                                        onChange={(e) =>
                                            setSettings((p) => ({
                                                ...(p || {}),
                                                routingRules: {
                                                    ...(p?.routingRules || {}),
                                                    technicalKeywords: e.target.value
                                                        .split(",")
                                                        .map((x) => x.trim())
                                                        .filter(Boolean),
                                                },
                                            }))
                                        }
                                        className="mt-2 w-full min-h-[100px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                        placeholder="login, password, error, ..."
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={load}
                                    className="rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50"
                                >
                                    Reset
                                </button>

                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={saving}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        saving
                                            ? "border-slate-200 bg-slate-50 text-slate-400"
                                            : "border-slate-900 bg-slate-900 hover:bg-slate-800 text-white"
                                    )}
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </BackOfficeLayout>
    );
}
