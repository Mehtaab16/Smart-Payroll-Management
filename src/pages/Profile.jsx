import { useEffect, useMemo, useState } from "react";
import SideBarLayout from "../components/SideBarLayout.jsx";
import {
    getMyProfile,
    uploadAvatar,
    deleteAvatar,
    createProfileChangeRequest,
    getMyProfileChangeRequests,
    changeMyPassword, // ✅ NEW
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
                <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
                    type="button"
                >
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

function fmtDateTime(d) {
    if (!d) return "-";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
}

function hasSpecialChar(s) {
    return /[^A-Za-z0-9]/.test(String(s || ""));
}

export default function Profile() {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState({ kind: "info", text: "" });

    const [tab, setTab] = useState("personal"); // personal | bank | requests | security ✅
    const [profile, setProfile] = useState(null);

    // Change request modal
    const [reqOpen, setReqOpen] = useState(false);
    const [reqCategory, setReqCategory] = useState("personal"); // personal | bank
    const [reqNote, setReqNote] = useState("");

    // Request form fields (only used inside modal)
    const [reqPersonal, setReqPersonal] = useState({ fullName: "", department: "", email: "" });
    const [reqBank, setReqBank] = useState({
        bankName: "",
        accountName: "",
        accountNumber: "",
        sortCode: "",
        iban: "",
    });

    // Requests list
    const [requests, setRequests] = useState([]);
    const [reqLoading, setReqLoading] = useState(false);

    // ✅ Change password fields
    const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
    const [pwSaving, setPwSaving] = useState(false);

    const photoUrl = useMemo(() => {
        const p = profile?.profilePhotoUrl || "";
        if (!p) return "";
        return p.startsWith("http") ? p : `http://localhost:5000${p}`;
    }, [profile]);

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

    async function loadProfile() {
        setLoading(true);
        setMsg({ kind: "info", text: "" });
        try {
            const p = await getMyProfile();
            setProfile(p);

            const localUser = (() => {
                try {
                    return JSON.parse(localStorage.getItem("user") || "{}");
                } catch {
                    return {};
                }
            })();

            localStorage.setItem(
                "user",
                JSON.stringify({
                    ...localUser,
                    fullName: p.fullName,
                    email: p.email,
                    employeeId: p.employeeId,
                    profilePhotoUrl: p.profilePhotoUrl || "",
                })
            );

            setReqPersonal({
                fullName: p.fullName || "",
                department: p.department || "",
                email: p.email || "",
            });

            setReqBank({
                bankName: p.bankDetails?.bankName || "",
                accountName: p.bankDetails?.accountName || "",
                accountNumber: p.bankDetails?.accountNumber || "",
                sortCode: p.bankDetails?.sortCode || "",
                iban: p.bankDetails?.iban || "",
            });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to load profile." });
        } finally {
            setLoading(false);
        }
    }

    async function loadRequests() {
        setReqLoading(true);
        try {
            const list = await getMyProfileChangeRequests();
            setRequests(Array.isArray(list) ? list : []);
        } catch (e) {
            setRequests([]);
            setMsg({ kind: "error", text: e.message || "Failed to load change requests." });
        } finally {
            setReqLoading(false);
        }
    }

    async function onPickAvatar(file) {
        if (!file || busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });
        try {
            const out = await uploadAvatar(file);

            const next = { ...profile, profilePhotoUrl: out.profilePhotoUrl };
            setProfile(next);

            const localUser = (() => {
                try {
                    return JSON.parse(localStorage.getItem("user") || "{}");
                } catch {
                    return {};
                }
            })();

            localStorage.setItem("user", JSON.stringify({ ...localUser, profilePhotoUrl: out.profilePhotoUrl || "" }));

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

            const next = { ...profile, profilePhotoUrl: out.profilePhotoUrl || "" };
            setProfile(next);

            const localUser = (() => {
                try {
                    return JSON.parse(localStorage.getItem("user") || "{}");
                } catch {
                    return {};
                }
            })();

            localStorage.setItem("user", JSON.stringify({ ...localUser, profilePhotoUrl: "" }));
            setMsg({ kind: "success", text: "Profile picture removed." });
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to remove profile picture." });
        } finally {
            setBusy(false);
        }
    }

    function openRequest(category) {
        setReqCategory(category);
        setReqNote("");
        setReqOpen(true);

        setReqPersonal({
            fullName: profile?.fullName || "",
            department: profile?.department || "",
            email: profile?.email || "",
        });

        setReqBank({
            bankName: profile?.bankDetails?.bankName || "",
            accountName: profile?.bankDetails?.accountName || "",
            accountNumber: profile?.bankDetails?.accountNumber || "",
            sortCode: profile?.bankDetails?.sortCode || "",
            iban: profile?.bankDetails?.iban || "",
        });
    }

    async function submitRequest() {
        if (busy) return;
        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            const payload = reqCategory === "bank" ? { ...reqBank } : { ...reqPersonal };

            Object.keys(payload).forEach((k) => {
                if (String(payload[k] ?? "").trim() === "") delete payload[k];
            });

            if (!Object.keys(payload).length) {
                throw new Error("Please fill at least one field to request a change.");
            }

            await createProfileChangeRequest({ category: reqCategory, payload, note: reqNote });

            setReqOpen(false);
            setMsg({ kind: "success", text: "Change request submitted. Awaiting Payroll Manager review." });

            await loadRequests();
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to submit request." });
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
        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (tab === "requests") loadRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    return (
        <SideBarLayout title="My Profile" hideWelcome={true}>
            <div className="bg-slate-50 rounded-[28px] p-6 min-h-[calc(100vh-2rem-40px)]">
                <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-semibold text-slate-900">Profile</div>
                        <div className="text-sm text-slate-600">
                            Your information is managed by Payroll. If something is wrong, submit a change request.
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => openRequest("personal")}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            type="button"
                            disabled={loading || busy}
                        >
                            Request Personal Change
                        </button>

                        <button
                            onClick={() => openRequest("bank")}
                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                            type="button"
                            disabled={loading || busy}
                        >
                            Request Bank Change
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-sm text-slate-600">Loading…</div>
                ) : !profile ? (
                    <div className="text-sm text-slate-700">No profile data.</div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
                        {/* LEFT */}
                        <Card title="My Details">
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                                <button
                                    onClick={() => setTab("personal")}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        tab === "personal"
                                            ? "bg-slate-900 text-white border-slate-900"
                                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    )}
                                    type="button"
                                >
                                    Personal
                                </button>

                                <button
                                    onClick={() => setTab("bank")}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        tab === "bank"
                                            ? "bg-slate-900 text-white border-slate-900"
                                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    )}
                                    type="button"
                                >
                                    Bank Details
                                </button>

                                <button
                                    onClick={() => setTab("requests")}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        tab === "requests"
                                            ? "bg-slate-900 text-white border-slate-900"
                                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    )}
                                    type="button"
                                >
                                    My Requests
                                </button>

                                {/* ✅ NEW */}
                                <button
                                    onClick={() => setTab("security")}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        tab === "security"
                                            ? "bg-slate-900 text-white border-slate-900"
                                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                    )}
                                    type="button"
                                >
                                    Security
                                </button>
                            </div>

                            {tab === "personal" ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Employee Number</div>
                                            <input
                                                value={profile.employeeId || "—"}
                                                disabled
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Email</div>
                                            <input
                                                value={profile.email || ""}
                                                disabled
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Full Name</div>
                                        <input
                                            value={profile.fullName || ""}
                                            disabled
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                        />
                                    </div>

                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Department</div>
                                        <input
                                            value={profile.department || ""}
                                            disabled
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                        />
                                    </div>

                                    <div className="pt-2 flex justify-end">
                                        <button
                                            onClick={() => openRequest("personal")}
                                            className="rounded-2xl px-5 py-2 text-sm font-semibold border bg-white border-slate-200 hover:bg-slate-50 text-slate-900"
                                            type="button"
                                        >
                                            Request change
                                        </button>
                                    </div>
                                </div>
                            ) : tab === "bank" ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Bank Name</div>
                                            <input
                                                value={profile.bankDetails?.bankName || ""}
                                                disabled
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Account Name</div>
                                            <input
                                                value={profile.bankDetails?.accountName || ""}
                                                disabled
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Account Number</div>
                                            <input
                                                value={profile.bankDetails?.accountNumber || ""}
                                                disabled
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                            />
                                        </div>

                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Sort Code</div>
                                            <input
                                                value={profile.bankDetails?.sortCode || ""}
                                                disabled
                                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">IBAN</div>
                                        <input
                                            value={profile.bankDetails?.iban || ""}
                                            disabled
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-slate-100 text-slate-900 cursor-not-allowed"
                                        />
                                    </div>

                                    <div className="pt-2 flex justify-end">
                                        <button
                                            onClick={() => openRequest("bank")}
                                            className="rounded-2xl px-5 py-2 text-sm font-semibold border bg-white border-slate-200 hover:bg-slate-50 text-slate-900"
                                            type="button"
                                        >
                                            Request change
                                        </button>
                                    </div>
                                </div>
                            ) : tab === "security" ? (
                                <div className="space-y-4">
                                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                                        Password rules: <span className="font-semibold">minimum 8 characters</span> and
                                        include <span className="font-semibold">at least 1 special character</span>.
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                                    <div className="pt-2 flex justify-end gap-3">
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
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {reqLoading ? (
                                        <div className="text-sm text-slate-600">Loading…</div>
                                    ) : requests.length === 0 ? (
                                        <div className="text-sm text-slate-700">No change requests yet.</div>
                                    ) : (
                                        requests.map((r) => (
                                            <div key={r._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-slate-900">
                                                            {String(r.category || "").toUpperCase()} • {String(r.status || "").toUpperCase()}
                                                        </div>
                                                        <div className="text-xs text-slate-600 mt-1">
                                                            Submitted: {fmtDateTime(r.createdAt)}
                                                            {r.reviewedAt ? ` • Reviewed: ${fmtDateTime(r.reviewedAt)}` : ""}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-xs text-slate-700">
                                                    <span className="font-semibold">Requested:</span>{" "}
                                                    {Object.keys(r.payload || {}).join(", ") || "-"}
                                                </div>

                                                {r.reviewNote ? (
                                                    <div className="mt-2 text-xs text-slate-600">
                                                        <span className="font-semibold">Note:</span> {r.reviewNote}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </Card>

                        {/* RIGHT */}
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

                            <div className="mt-3 text-xs text-slate-500">
                                Employee number is system-assigned and never editable.
                            </div>
                        </Card>
                    </div>
                )}

                {/* Request Change Modal */}
                {reqOpen ? (
                    <div className="fixed inset-0 z-50">
                        <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setReqOpen(false)} />
                        <div className="absolute left-1/2 top-1/2 w-[94vw] sm:w-[860px] -translate-x-1/2 -translate-y-1/2">
                            <div className="rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
                                <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                                    <div className="text-xl font-semibold text-slate-900">
                                        Request {reqCategory === "bank" ? "Bank" : "Personal"} Change
                                    </div>
                                    <button
                                        onClick={() => !busy && setReqOpen(false)}
                                        className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                                        type="button"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="p-6">
                                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 mb-4">
                                        Your request will be reviewed by the Payroll Manager. You cannot directly edit records.
                                    </div>

                                    {reqCategory === "personal" ? (
                                        <div className="space-y-4">
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Full Name</div>
                                                <input
                                                    value={reqPersonal.fullName}
                                                    onChange={(e) => setReqPersonal((x) => ({ ...x, fullName: e.target.value }))}
                                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                />
                                            </div>

                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Department</div>
                                                <input
                                                    value={reqPersonal.department}
                                                    onChange={(e) => setReqPersonal((x) => ({ ...x, department: e.target.value }))}
                                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                />
                                            </div>

                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Email</div>
                                                <input
                                                    value={reqPersonal.email}
                                                    onChange={(e) => setReqPersonal((x) => ({ ...x, email: e.target.value }))}
                                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Bank Name</div>
                                                    <input
                                                        value={reqBank.bankName}
                                                        onChange={(e) => setReqBank((x) => ({ ...x, bankName: e.target.value }))}
                                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Account Name</div>
                                                    <input
                                                        value={reqBank.accountName}
                                                        onChange={(e) => setReqBank((x) => ({ ...x, accountName: e.target.value }))}
                                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Account Number</div>
                                                    <input
                                                        value={reqBank.accountNumber}
                                                        onChange={(e) => setReqBank((x) => ({ ...x, accountNumber: e.target.value }))}
                                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">Sort Code</div>
                                                    <input
                                                        value={reqBank.sortCode}
                                                        onChange={(e) => setReqBank((x) => ({ ...x, sortCode: e.target.value }))}
                                                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">IBAN</div>
                                                <input
                                                    value={reqBank.iban}
                                                    onChange={(e) => setReqBank((x) => ({ ...x, iban: e.target.value }))}
                                                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-4">
                                        <div className="text-xs text-slate-500 mb-1">Extra note (optional)</div>
                                        <textarea
                                            value={reqNote}
                                            onChange={(e) => setReqNote(e.target.value)}
                                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[90px] bg-white text-slate-900"
                                            placeholder="Explain why you want this change…"
                                        />
                                    </div>

                                    <div className="pt-4 flex items-center justify-end gap-3">
                                        <button
                                            onClick={() => setReqOpen(false)}
                                            className="rounded-2xl px-5 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                            type="button"
                                            disabled={busy}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            onClick={submitRequest}
                                            className={cn(
                                                "rounded-2xl px-5 py-2 text-sm font-semibold border",
                                                busy
                                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:opacity-90"
                                            )}
                                            type="button"
                                            disabled={busy}
                                        >
                                            {busy ? "Submitting..." : "Submit request"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </SideBarLayout>
    );
}
