import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";


import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MyPayslips from "./pages/MyPayslips.jsx";
import PayslipView from "./pages/PayslipView.jsx";
import MyDocuments from "./pages/MyDocuments.jsx";

import Profile from "./pages/Profile.jsx";
import Overtime from "./pages/Overtime.jsx";
import LeaveModule from "./pages/LeaveModule.jsx";
import SupportRequests from "./pages/SupportRequests.jsx";
import Progressions from "./pages/Progressions.jsx";
import KnowledgeHub from "./pages/KnowledgeHub.jsx";
import Accessibility from "./pages/Accessibility.jsx";



// ✅ PM pages
import PMDashboard from "./pages_pm/PMDashboard.jsx";
import PMSupportTickets from "./pages_pm/PMSupportTickets.jsx";
import LeaveApprovals from "./pages_pm/LeaveApprovals.jsx";
import ProfileChangeApprovals from "./pages_pm/ProfileChangeApprovals.jsx";
import OvertimeApprovals from "./pages_pm/OvertimeApprovals.jsx";
import ProgressionsViewer from "./pages_pm/ProgressionsViewer.jsx";
import EmployeeSetup from "./pages_pm/EmployeeSetup.jsx";
import AccessRights from "./pages_pm/AccessRights.jsx";
import EmployeeDocuments from "./pages_pm/EmployeeDocuments.jsx";
import Paycodes from "./pages_pm/Paycodes.jsx";
import EmployeeCompensation from "./pages_pm/EmployeeCompensation.jsx";
import PayrollAdjustments from "./pages_pm/PayrollAdjustments.jsx";
import Reports from "./pages_pm/Reports.jsx";
import AccessibilityPm from "./pages_pm/AccessibilityPm.jsx";
import PMProfile from "./pages_pm/PMProfile.jsx";
import Impersonate from "./pages/admin/Impersonation.jsx";

import KnowledgeDocumentsPm from "./pages_pm/KnowledgeDocumentsPm.jsx";
import KnowledgeHubSettingsAdmin from "./pages/admin/KnowledgeHubSettingsAdmin.jsx";



function getUserSafe() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}") || {};
    } catch {
        return {};
    }
}

function landingPathForRole(role) {
    if (role === "payroll_manager" || role === "admin") return "/pm/dashboard";
    return "/dashboard";
}

function Protected({ children }) {
    const token = localStorage.getItem("token");
    return token ? children : <Navigate to="/login" replace />;
}

function ProtectedRoles({ roles = [], children }) {
    const token = localStorage.getItem("token");
    if (!token) return <Navigate to="/login" replace />;

    const user = getUserSafe();
    const role = user?.role;

    if (!role || !roles.includes(role)) {
        return <Navigate to={landingPathForRole(role)} replace />;
    }

    return children;
}

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

const DEFAULT_PREFS = {
    darkMode: true,
    largeText: false,
    notifications: true,
    highContrast: false,
};

function readPrefs() {
    try {
        const raw = localStorage.getItem("accessibility_prefs");
        const parsed = raw ? JSON.parse(raw) : {};
        return { ...DEFAULT_PREFS, ...(parsed || {}) };
    } catch {
        return DEFAULT_PREFS;
    }
}

export default function App() {
    const [prefs, setPrefs] = useState(() => readPrefs());

    useEffect(() => {
        const t = setInterval(() => setPrefs(readPrefs()), 700);
        function onStorage(e) {
            if (e.key === "accessibility_prefs") setPrefs(readPrefs());
        }
        window.addEventListener("storage", onStorage);
        return () => {
            clearInterval(t);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    useEffect(() => {
        async function onOnline() {
            try {
                await flushOutbox({ max: 50 });
            } catch { }
        }

        window.addEventListener("online", onOnline);

        // also try once on load (if already online)
        if (navigator.onLine) onOnline();

        return () => window.removeEventListener("online", onOnline);
    }, []);

    const rootClass = useMemo(() => {
        return cn(
            prefs.largeText ? "text-[15px]" : "",
            prefs.highContrast ? "contrast-125" : "",
            prefs.darkMode ? "" : "text-slate-900"
        );
    }, [prefs]);

    const style = useMemo(() => {
        return prefs.darkMode
            ? undefined
            : { background: "linear-gradient(to bottom right, #f8fafc, #eef2ff, #f1f5f9)" };
    }, [prefs.darkMode]);

    return (
        <div className={rootClass} style={style}>
            <Routes>
                <Route path="/login" element={<Login />} />

                {/* Employee routes */}
                <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
                <Route path="/payslips" element={<Protected><MyPayslips /></Protected>} />
                <Route path="/payslips/:id" element={<Protected><PayslipView /></Protected>} />

                <Route path="/profile" element={<Protected><Profile /></Protected>} />
                <Route path="/overtime" element={<Protected><Overtime /></Protected>} />
                <Route path="/leave" element={<Protected><LeaveModule /></Protected>} />
                <Route path="/support" element={<Protected><SupportRequests /></Protected>} />
                <Route path="/progressions" element={<Protected><Progressions /></Protected>} />
                <Route path="/knowledge" element={<Protected><KnowledgeHub /></Protected>} />
                <Route path="/accessibility" element={<Protected><Accessibility /></Protected>} />
                <Route path="/documents" element={<Protected><MyDocuments /></Protected>} />

                {/* PM/Admin routes */}
                <Route
                    path="/pm/dashboard"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <PMDashboard />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/support"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <PMSupportTickets />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/leave-approvals"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <LeaveApprovals />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/overtime-approvals"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <OvertimeApprovals />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/progressions"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <ProgressionsViewer />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/adjustments"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <PayrollAdjustments />
                        </ProtectedRoles>
                    }
                />


                <Route
                    path="/pm/employees"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <EmployeeSetup />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/access-rights"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <AccessRights />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/employee-documents"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <EmployeeDocuments />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/reports"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <Reports />
                        </ProtectedRoles>
                    }
                />


                <Route
                    path="/pm/audit"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <Navigate to="/pm/dashboard" replace />
                        </ProtectedRoles>
                    }
                />

                {/* ✅ FIXED: this must match the sidebar link `/pm/profile-requests` */}
                <Route
                    path="/pm/profile-requests"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <ProfileChangeApprovals />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/admin/impersonate"
                    element={
                        <ProtectedRoles roles={["admin"]}>
                            <Impersonate />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/paycodes"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <Paycodes />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/accessibility"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <AccessibilityPm />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/knowledge/documents"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <KnowledgeDocumentsPm />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/admin/knowledge/settings"
                    element={
                        <ProtectedRoles roles={["admin"]}>
                            <KnowledgeHubSettingsAdmin />
                        </ProtectedRoles>
                    }
                />


                <Route
                    path="/pm/profile"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <PMProfile />
                        </ProtectedRoles>
                    }
                />

                <Route
                    path="/pm/employees/:id/compensation"
                    element={
                        <ProtectedRoles roles={["payroll_manager", "admin"]}>
                            <EmployeeCompensation />
                        </ProtectedRoles>
                    }
                />


                {/* Root */}
                <Route
                    path="/"
                    element={
                        <Protected>
                            <Navigate to={landingPathForRole(getUserSafe()?.role)} replace />
                        </Protected>
                    }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}
