// PMProfile.jsx (same file you sent, with Security section added)
import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../components/BackOfficeLayout.jsx";
import {
    getMyProfile,
    updateMyProfile,
    uploadAvatar,
    deleteAvatar,
    changeMyPassword, // ✅ ADD
} from "../api/profileApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function MessageBox({ kind = "info", message, onClose }) {
    if (!message) return null;
    const styles =
        kind === "error"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700";

    return (
        <div className={cn("mb-4 rounded-2xl border px-4 py-3 shadow-sm", styles)}>
            <div className="flex items-start justify-between gap-3">
                <div className="text-sm">{message}</div>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm font-semibold" type="button">
                    ✕
                </button>
            </div>
        </div>
    );
}

function Card({ title, children, className = "" }) {
    return (
        <div className={cn("rounded-3xl bg-white border border-slate-200 p-5 shadow-sm", className)}>
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

function shallowEqual(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function hasSpecialChar(s) {
    return /[^A-Za-z0-9]/.test(String(s || ""));
}

export default function PMProfile() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState({ kind: "info", text: "" });

    const [profile, setProfile] = useState(null);

    const [form, setForm] = useState({
        fullName: "",
        department: "",
        email: "",
        bankDetails: {
            bankName: "",
            accountName: "",
            accountNumber: "",
            sortCode: "",
            iban: "",
        },
    });

    const [initialForm, setInitialForm] = useState(null);

    const role = useMemo(() => String(profile?.role || "").toLowerCase(), [profile]);
    const isAdmin = role === "admin";

    const photoUrl = useMemo(() => {
        const p = profile?.profilePhotoUrl || "";
        if (!p) return "";
        return p.startsWith("http") ? p : `http://localhost:5000${p}`;
    }, [profile]);

    const dirty = useMemo(() => {
        if (!initialForm) return false;
        return !shallowEqual(form, initialForm);
    }, [form, initialForm]);

    // ✅ Change password fields
    const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
    const [pwSaving, setPwSaving] = useState(false);

    const pwRules = useMemo(() => {
        const next = pw.next || "";
        const okLen = next.length >= 8;
        const okSpecial = hasSpecialChar(next);
        const okMatch = next.length > 0 && next === (pw.confirm || "");
        return { okLen, okSpecial, okMatch };
    }, [pw.next, pw.confirm]);

    const canSavePw = useMemo(() => {
        return !!pw.current && pwRules.okLen && pwRules.okSpecial && pwRules.okMatch && !pwSaving && !busy;
    }, [pw.current, pwRules.okLen, pwRules.okSpecial, pwRules.okMatch, pwSaving, busy]);

    async function load() {
        setLoading(true);
        setMsg({ kind: "info", text: "" });
        try {
            const p = await getMyProfile();
            setProfile(p);

            const nextForm = {
                fullName: p.fullName || "",
                department: p.department || "",
                email: p.email || "",
                bankDetails: {
                    bankName: p.bankDetails?.bankName || "",
                    accountName: p.bankDetails?.accountName || "",
                    accountNumber: p.bankDetails?.accountNumber || "",
                    sortCode: p.bankDetails?.sortCode || "",
                    iban: p.bankDetails?.iban || "",
                },
            };

            setForm(nextForm);
            setInitialForm(nextForm);

            try {
                const u = JSON.parse(localStorage.getItem("user") || "{}");
                localStorage.setItem(
                    "user",
                    JSON.stringify({
                        ...(u || {}),
                        fullName: p.fullName,
                        email: p.email,
                        department: p.department || "",
                        profilePhotoUrl: p.profilePhotoUrl || "",
                        role: p.role || u?.role,
                    })
                );
                window.dispatchEvent(new Event("user:updated"));
            } catch { }
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to load profile." });
        } finally {
            setLoading(false);
        }
    }

    async function onSave() {
        if (busy || !dirty) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });
        try {
            // ✅ Admin does NOT send bankDetails
            const payload = isAdmin
                ? { fullName: form.fullName, department: form.department, email: form.email }
                : { fullName: form.fullName, department: form.department, email: form.email, bankDetails: form.bankDetails };

            const saved = await updateMyProfile(payload);

            setProfile(saved);

            const nextForm = {
                fullName: saved.fullName || "",
                department: saved.department || "",
                email: saved.email || "",
                bankDetails: {
                    bankName: saved.bankDetails?.bankName || "",
                    accountName: saved.bankDetails?.accountName || "",
                    accountNumber: saved.bankDetails?.accountNumber || "",
                    sortCode: saved.bankDetails?.sortCode || "",
                    iban: saved.bankDetails?.iban || "",
                },
            };

            setForm(nextForm);
            setInitialForm(nextForm);

            try {
                const u = JSON.parse(localStorage.getItem("user") || "{}");
                localStorage.setItem(
                    "user",
                    JSON.stringify({
                        ...(u || {}),
                        fullName: saved.fullName,
                        email: saved.email,
                        department: saved.department || "",
                        profilePhotoUrl: saved.profilePhotoUrl || "",
                    })
                );
                window.dispatchEvent(new Event("user:updated"));
            } catch { }

            setMsg({ kind: "success", text: "Profile updated." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to save profile." });
        } finally {
            setBusy(false);
        }
    }

    async function onPickAvatar(file) {
        if (!file || busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });
        try {
            const out = await uploadAvatar(file);

            const next = { ...(profile || {}), profilePhotoUrl: out.profilePhotoUrl };
            setProfile(next);

            try {
                const u = JSON.parse(localStorage.getItem("user") || "{}");
                localStorage.setItem("user", JSON.stringify({ ...(u || {}), profilePhotoUrl: out.profilePhotoUrl || "" }));
                window.dispatchEvent(new Event("user:updated"));
            } catch { }

            setMsg({ kind: "success", text: "Profile picture updated." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to upload profile picture." });
        } finally {
            setBusy(false);
        }
    }

    async function onDeleteAvatar() {
        if (busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });
        try {
            const out = await deleteAvatar();

            const next = { ...(profile || {}), profilePhotoUrl: out.profilePhotoUrl || "" };
            setProfile(next);

            try {
                const u = JSON.parse(localStorage.getItem("user") || "{}");
                localStorage.setItem("user", JSON.stringify({ ...(u || {}), profilePhotoUrl: "" }));
                window.dispatchEvent(new Event("user:updated"));
            } catch { }

            setMsg({ kind: "success", text: "Profile picture removed." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to remove profile picture." });
        } finally {
            setBusy(false);
        }
    }

    // ✅ Change password action
    async function savePassword() {
        if (!canSavePw) {
            setMsg({ kind: "error", text: "Please ensure password meets requirements and confirmation matches." });
            return;
        }

        setPwSaving(true);
        setMsg({ kind: "info", text: "" });
        try {
            await changeMyPassword({ currentPassword: pw.current, newPassword: pw.next });
            setPw({ current: "", next: "", confirm: "" });
            setMsg({ kind: "success", text: "Password updated successfully." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to update password." });
        } finally {
            setPwSaving(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <BackOfficeLayout title="My Profile">
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">My Profile</div>
                        <div className="text-sm text-slate-600">Admin/Payroll Manager can edit their details directly.</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={load}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                            type="button"
                            disabled={loading || busy}
                        >
                            Refresh
                        </button>

                        <button
                            onClick={onSave}
                            className={cn(
                                "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                !dirty || busy
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                            )}
                            type="button"
                            disabled={!dirty || busy}
                        >
                            {busy ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-sm text-slate-600">Loading…</div>
                ) : !profile ? (
                    <div className="text-sm text-slate-700">No profile data.</div>
                ) : (
                    <div className="space-y-6">
                        <div className={cn("grid grid-cols-1 gap-6", isAdmin ? "xl:grid-cols-1" : "xl:grid-cols-2")}>
                            <Card title="Details">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Role</div>
                                        <input
                                            value={String(profile.role || "").toUpperCase()}
                                            disabled
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                        />
                                    </div>

                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Department</div>
                                        <input
                                            value={form.department}
                                            onChange={(e) => setForm((x) => ({ ...x, department: e.target.value }))}
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <div className="text-xs text-slate-500 mb-1">Full Name</div>
                                    <input
                                        value={form.fullName}
                                        onChange={(e) => setForm((x) => ({ ...x, fullName: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                    />
                                </div>

                                <div className="mt-4">
                                    <div className="text-xs text-slate-500 mb-1">Email</div>
                                    <input
                                        value={form.email}
                                        onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                    />
                                </div>
                            </Card>

                            {!isAdmin ? (
                                <Card title="Bank Details">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Bank Name</div>
                                            <input
                                                value={form.bankDetails.bankName}
                                                onChange={(e) =>
                                                    setForm((x) => ({ ...x, bankDetails: { ...x.bankDetails, bankName: e.target.value } }))
                                                }
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Account Name</div>
                                            <input
                                                value={form.bankDetails.accountName}
                                                onChange={(e) =>
                                                    setForm((x) => ({ ...x, bankDetails: { ...x.bankDetails, accountName: e.target.value } }))
                                                }
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Account Number</div>
                                            <input
                                                value={form.bankDetails.accountNumber}
                                                onChange={(e) =>
                                                    setForm((x) => ({ ...x, bankDetails: { ...x.bankDetails, accountNumber: e.target.value } }))
                                                }
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Sort Code</div>
                                            <input
                                                value={form.bankDetails.sortCode}
                                                onChange={(e) =>
                                                    setForm((x) => ({ ...x, bankDetails: { ...x.bankDetails, sortCode: e.target.value } }))
                                                }
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="text-xs text-slate-500 mb-1">IBAN</div>
                                        <input
                                            value={form.bankDetails.iban}
                                            onChange={(e) =>
                                                setForm((x) => ({ ...x, bankDetails: { ...x.bankDetails, iban: e.target.value } }))
                                            }
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                        />
                                    </div>
                                </Card>
                            ) : null}
                        </div>

                        <Card title="Profile Photo">
                            <div className="flex items-center gap-4">
                                {photoUrl ? (
                                    <img
                                        src={photoUrl}
                                        alt="Profile"
                                        className="h-16 w-16 rounded-full object-cover border border-slate-200 bg-white"
                                    />
                                ) : (
                                    <div className="h-16 w-16 rounded-full border border-slate-200 bg-slate-100" />
                                )}

                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 truncate">{profile.fullName}</div>
                                    <div className="text-xs text-slate-600 truncate">{profile.email}</div>
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="text-xs text-slate-500 mb-1">Upload new picture (PNG/JPG/WEBP, max 5MB)</div>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => onPickAvatar(e.target.files?.[0])}
                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                />
                            </div>

                            <div className="mt-3 flex items-center justify-end gap-3">
                                <button
                                    onClick={onDeleteAvatar}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        busy
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-rose-50 text-rose-700 border-rose-200 hover:opacity-90"
                                    )}
                                    type="button"
                                    disabled={busy}
                                >
                                    Remove photo
                                </button>
                            </div>
                        </Card>

                        {/* ✅ NEW: Security / Change password */}
                        <Card title="Security">
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                                Password rules: <span className="font-semibold">minimum 8 characters</span> and include{" "}
                                <span className="font-semibold">at least 1 special character</span>.
                            </div>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Current password</div>
                                    <input
                                        type="password"
                                        value={pw.current}
                                        onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                        placeholder="Enter current password"
                                    />
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-1">New password</div>
                                    <input
                                        type="password"
                                        value={pw.next}
                                        onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                        placeholder="Enter new password"
                                    />
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Confirm new password</div>
                                    <input
                                        type="password"
                                        value={pw.confirm}
                                        onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                        placeholder="Re-enter new password"
                                    />
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                                    <div className={cn("flex items-center gap-2", pwRules.okLen ? "text-emerald-700" : "text-slate-600")}>
                                        <span>{pwRules.okLen ? "✓" : "•"}</span> At least 8 characters
                                    </div>
                                    <div className={cn("flex items-center gap-2 mt-1", pwRules.okSpecial ? "text-emerald-700" : "text-slate-600")}>
                                        <span>{pwRules.okSpecial ? "✓" : "•"}</span> Contains a special character
                                    </div>
                                    <div className={cn("flex items-center gap-2 mt-1", pwRules.okMatch ? "text-emerald-700" : "text-slate-600")}>
                                        <span>{pwRules.okMatch ? "✓" : "•"}</span> Passwords match
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setPw({ current: "", next: "", confirm: "" })}
                                    className="rounded-2xl px-5 py-2 text-sm font-semibold border bg-white border-slate-200 hover:bg-slate-50 text-slate-900"
                                    type="button"
                                    disabled={pwSaving || busy}
                                >
                                    Clear
                                </button>

                                <button
                                    onClick={savePassword}
                                    className={cn(
                                        "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                        canSavePw
                                            ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                                            : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    )}
                                    type="button"
                                    disabled={!canSavePw}
                                >
                                    {pwSaving ? "Saving..." : "Save password"}
                                </button>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </BackOfficeLayout>
    );
}
