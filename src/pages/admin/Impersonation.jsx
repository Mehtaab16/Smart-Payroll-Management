// src/pages/admin/Impersonate.jsx
import { useEffect, useMemo, useState } from "react";
import BackOfficeLayout from "../../components/BackOfficeLayout.jsx";
import { getImpersonationTargets, startImpersonation } from "../../api/impersonationApi.js";

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
        <div className={cn("rounded-3xl bg-white border border-slate-200 p-6 shadow-sm", className)}>
            {title ? <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div> : null}
            {children}
        </div>
    );
}

export default function Impersonate() {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState({ kind: "info", text: "" });

    const [role, setRole] = useState("employee"); // employee | payroll_manager
    const [department, setDepartment] = useState("");
    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [userId, setUserId] = useState("");

    const showDepartment = role === "employee";

    async function loadTargets(nextRole = role, nextDept = department) {
        setBusy(true);
        setMsg({ kind: "info", text: "" });
        try {
            const out = await getImpersonationTargets({
                role: nextRole,
                department: nextRole === "employee" ? nextDept : "",
            });

            const deps =
                Array.isArray(out?.departments) ? out.departments :
                    Array.isArray(out?.data?.departments) ? out.data.departments :
                        [];

            const list =
                Array.isArray(out?.users) ? out.users :
                    Array.isArray(out?.items) ? out.items :
                        Array.isArray(out?.data?.users) ? out.data.users :
                            Array.isArray(out?.data?.items) ? out.data.items :
                                [];


            setDepartments(deps);
            setUsers(list);

            // reset selected user if it no longer exists
            if (!list.some((u) => String(u.id || u._id) === String(userId))) {
                setUserId("");
            }
        } catch (e) {
            setDepartments([]);
            setUsers([]);
            setUserId("");
            setMsg({ kind: "error", text: e.message || "Failed to load impersonation targets." });
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        // when role changes: clear dept + user
        if (role === "payroll_manager") setDepartment("");
        setUserId("");
        loadTargets(role, role === "employee" ? department : "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role]);

    useEffect(() => {
        if (!showDepartment) return;
        loadTargets(role, department);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [department]);

    const selectedUser = useMemo(() => {
        return users.find((u) => String(u.id || u._id) === String(userId)) || null;
    }, [users, userId]);

    async function onStart() {
        if (busy) return;
        if (!userId) {
            setMsg({ kind: "error", text: "Please select a user to impersonate." });
            return;
        }

        setBusy(true);
        setMsg({ kind: "info", text: "" });

        try {
            // backup admin creds
            const adminToken = localStorage.getItem("token");
            const adminUser = localStorage.getItem("user");
            if (adminToken && adminUser) {
                localStorage.setItem("imp_admin_token", adminToken);
                localStorage.setItem("imp_admin_user", adminUser);
            }

            const out = await startImpersonation({ role, userId });

            // swap to impersonated
            localStorage.setItem("token", out.token);

            const nextUser = {
                ...(out.user || {}),
                impersonating: true,
                // optional: helpful display fields
                role: out.user?.role || role,
            };

            localStorage.setItem("user", JSON.stringify(nextUser));
            window.dispatchEvent(new Event("user:updated"));

            // redirect to the correct area
            const r = nextUser?.role;
            if (r === "payroll_manager" || r === "admin") window.location.href = "/pm/dashboard";
            else window.location.href = "/dashboard";
        } catch (e) {
            setMsg({ kind: "error", text: e.message || "Failed to start impersonation." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <BackOfficeLayout title="Impersonation">
            <MessageBox kind={msg.kind} message={msg.text} onClose={() => setMsg({ kind: "info", text: "" })} />

            <Card title="Impersonate a user">
                <div className="text-sm text-slate-600 mb-4">
                    Admin only. You can impersonate an <span className="font-semibold">Employee</span> or a{" "}
                    <span className="font-semibold">Payroll Manager</span>.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Role */}
                    <div>
                        <div className="text-xs text-slate-500 mb-1">Role to impersonate</div>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                            disabled={busy}
                        >
                            <option value="employee">Employee</option>
                            <option value="payroll_manager">Payroll Manager</option>
                        </select>
                    </div>

                    {/* Department (only for employee) */}
                    {showDepartment ? (
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Department (optional)</div>
                            <select
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                                disabled={busy}
                            >
                                <option value="">All departments</option>
                                {departments.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}
                </div>

                {/* User dropdown */}
                <div className="mt-4">
                    <div className="text-xs text-slate-500 mb-1">
                        Select {role === "employee" ? "employee" : "payroll manager"}
                    </div>
                    <select
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900"
                        disabled={busy}
                    >
                        <option value="">-- Select --</option>
                        {users.map((u) => {
                            const id = String(u.id || u._id || "");
                            if (!id) return null;

                            const label =
                                `${u.fullName || u.email || id}` +
                                (u.department ? ` • ${u.department}` : "");

                            return (
                                <option key={id} value={id}>
                                    {label}
                                </option>
                            );
                        })}
                    </select>

                    {selectedUser ? (
                        <div className="mt-2 text-xs text-slate-600">
                            Selected: <span className="font-semibold">{selectedUser.fullName || selectedUser.email}</span>
                            {selectedUser.email ? ` • ${selectedUser.email}` : ""}
                        </div>
                    ) : null}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onStart}
                        disabled={busy || !userId}
                        className={cn(
                            "rounded-2xl px-5 py-2 text-sm font-semibold border",
                            busy || !userId
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                        )}
                    >
                        {busy ? "Starting..." : "Start impersonation"}
                    </button>
                </div>
            </Card>
        </BackOfficeLayout>
    );
}
