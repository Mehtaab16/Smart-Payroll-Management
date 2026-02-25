import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

export default function AppLayout({ title, children }) {
    const nav = useNavigate();

    function logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        nav("/login");
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Top Bar */}
            <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur">
                <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
                    <Link to="/payslips" className="flex items-center gap-3">
                        <img src={logo} alt="Smart Payroll" className="h-9 w-9 rounded-lg object-cover" />
                        <div>
                            <div className="font-semibold leading-tight">Smart Payroll</div>
                            <div className="text-xs text-white/60 -mt-0.5">Zero-touch payroll</div>
                        </div>
                    </Link>

                    <div className="flex items-center gap-3">
                        {title ? <div className="text-sm text-white/70 hidden sm:block">{title}</div> : null}
                        <button
                            onClick={logout}
                            className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Page */}
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
    );
}
