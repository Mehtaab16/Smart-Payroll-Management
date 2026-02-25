import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

function landingPathForRole(role) {
    if (role === "payroll_manager" || role === "admin") return "/pm/dashboard";
    return "/dashboard";
}

export default function Login() {
    const nav = useNavigate();
    const [email, setEmail] = useState("employee@test.com");
    const [password, setPassword] = useState("Pass1234");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setErr("");
        setLoading(true);

        try {
            const r = await fetch("http://localhost:5000/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                setErr(j.message || `Login failed (${r.status})`);
                return;
            }

            localStorage.setItem("token", j.token);
            localStorage.setItem("user", JSON.stringify(j.user));

            nav(landingPathForRole(j?.user?.role), { replace: true });
        } catch (e2) {
            setErr(`Network error: ${e2.message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl bg-white/5 backdrop-blur border border-white/10 shadow-xl p-6">
                <div className="mb-1 flex flex-col items-center text-center">
                    <img
                        src={logo}
                        alt="Smart Payroll"
                        className="h-50 w-50 rounded-2xl object-contain mb-1 drop-shadow-lg"
                    />

                    <p className="text-sm text-white/60">Sign in to view your payslips</p>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="text-sm text-white/70">Email</label>
                        <input
                            className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-400"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-white/70">Password</label>
                        <input
                            className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-400"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            type="password"
                            autoComplete="current-password"
                        />
                    </div>

                    {err ? (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200">
                            {err}
                        </div>
                    ) : null}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-600 transition text-white font-semibold py-3 disabled:opacity-60"
                    >
                        {loading ? "Signing in..." : "Sign in"}
                    </button>

                    <div className="text-xs text-white/40 text-center">
                        Demo credentials are prefilled for testing.
                    </div>
                </form>
            </div>
        </div>
    );
}
