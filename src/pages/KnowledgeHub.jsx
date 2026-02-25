import { useEffect, useMemo, useState } from "react";
import SidebarLayout from "../components/SidebarLayout.jsx";
import { chatKnowledge } from "../api/knowledgeApi.js";
import { createSupportTicket } from "../api/supportApi.js";

function cn(...s) {
    return s.filter(Boolean).join(" ");
}

function readUserSafe() {
    try {
        return JSON.parse(localStorage.getItem("user") || "{}") || {};
    } catch {
        return {};
    }
}

function ToneBanner({ tone = "info", text, onClose }) {
    if (!text) return null;
    const cls =
        tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-slate-200 bg-white text-slate-800";

    return (
        <div className={cn("mb-4 rounded-2xl border px-4 py-3 text-sm flex items-start justify-between gap-4", cls)}>
            <div>{text}</div>
            {onClose ? (
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg px-2 py-1 text-xs font-semibold border border-black/10 hover:bg-black/5"
                >
                    ✕
                </button>
            ) : null}
        </div>
    );
}

export default function KnowledgeHub() {
    const [question, setQuestion] = useState("");
    const [loading, setLoading] = useState(false);
    const [banner, setBanner] = useState(null); // {tone,text}

    const [chat, setChat] = useState(() => {
        try {
            const raw = localStorage.getItem("knowledge_chat_history");
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const [ticketDraft, setTicketDraft] = useState(null); // {type,title,description}
    const [creatingTicket, setCreatingTicket] = useState(false);

    const user = useMemo(() => readUserSafe(), []);
    const employeeNumber = user?.employeeId || user?.employeeNumber || "";
    const employeeEmail = user?.email || "";

    useEffect(() => {
        try {
            localStorage.setItem("knowledge_chat_history", JSON.stringify(chat.slice(-30)));
        } catch { }
    }, [chat]);

    async function send() {
        const q = String(question || "").trim();
        if (!q || loading) return;

        setBanner(null);
        setLoading(true);
        setTicketDraft(null);

        // push user message immediately
        const userMsg = { role: "user", text: q, ts: Date.now() };
        setChat((prev) => [...prev, userMsg]);
        setQuestion("");

        try {
            const res = await chatKnowledge({ question: q });

            const botMsg = {
                role: "assistant",
                text: res?.answer || "No answer returned.",
                ts: Date.now(),
                confidence: res?.confidence ?? null,
                inScope: res?.inScope ?? true,
                suggestTicket: !!res?.suggestTicket,
                routeTeam: res?.routeTeam || "", // "payroll" | "technical"
                // ✅ do NOT store sources in chat (we hide them from employee UI)
            };

            setChat((prev) => [...prev, botMsg]);

            // If the system says low confidence or complex => offer ticket draft
            if (botMsg.suggestTicket) {
                const type = botMsg.routeTeam === "technical" ? "technical" : "payroll";
                const title = `Knowledge Hub: ${q}`.slice(0, 120);

                const sources = Array.isArray(res?.sources) ? res.sources : [];
                const srcLines = sources.slice(0, 5).map((s, i) => {
                    const score = typeof s.score === "number" ? s.score.toFixed(3) : "";
                    return `#${i + 1} ${s.docTitle || "Source"} (${s.category || "-"}${score ? `, score ${score}` : ""})`;
                });

                const description =
                    `Employee question:\n${q}\n\n` +
                    `Bot answer (low confidence):\n${botMsg.text}\n\n` +
                    `Confidence: ${botMsg.confidence ?? "n/a"}\n` +
                    `Routed team: ${type}\n\n` +
                    `Top sources:\n${srcLines.join("\n")}\n`;

                setTicketDraft({ type, title, description });
            }
        } catch (e) {
            setBanner({ tone: "error", text: e?.message || "Chat failed." });
        } finally {
            setLoading(false);
        }
    }

    async function createTicket() {
        if (!ticketDraft || creatingTicket) return;

        setCreatingTicket(true);
        setBanner(null);

        try {
            // NOTE: backend fetches employeeNumber/email from userId,
            // but passing is ok.
            await createSupportTicket({
                type: ticketDraft.type,
                title: ticketDraft.title,
                description: ticketDraft.description,
                priority: "low",
                employeeNumber,
                employeeEmail,
                files: [],
            });

            setBanner({ tone: "success", text: "Support ticket created. You can track it in Support Requests." });
            setTicketDraft(null);
        } catch (e) {
            setBanner({ tone: "error", text: e?.message || "Failed to create ticket." });
        } finally {
            setCreatingTicket(false);
        }
    }

    function onKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    return (
        <SidebarLayout title="Knowledge Hub" noScroll={false}>
            <div className="rounded-[28px] bg-white border border-slate-200 p-6">
                <ToneBanner tone={banner?.tone} text={banner?.text} onClose={() => setBanner(null)} />

                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-lg font-semibold text-slate-900">Ask about AutoPay</div>
                        <div className="text-sm text-slate-600 mt-1">
                            This bot answers only from your company’s policies, payroll, leave, and IT documents.
                        </div>
                    </div>
                    <button
                        type="button"
                        className="rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900"
                        onClick={() => {
                            setChat([]);
                            setTicketDraft(null);
                            try { localStorage.removeItem("knowledge_chat_history"); } catch { }
                        }}
                    >
                        Clear
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
                    {/* Chat */}
                    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200">
                            <div className="text-sm font-semibold text-slate-900">Chat</div>
                            <div className="text-xs text-slate-600 mt-1">
                                If the answer is not in your docs, it will suggest creating a support ticket.
                            </div>
                        </div>

                        <div className="p-5 space-y-4 max-h-[52vh] overflow-auto">
                            {chat.length === 0 ? (
                                <div className="text-sm text-slate-600">
                                    Try: “How do I apply for leave?” or “I can’t log in, what should I do?”
                                </div>
                            ) : (
                                chat.map((m, idx) => {
                                    const isUser = m.role === "user";
                                    return (
                                        <div
                                            key={`${m.ts || idx}-${idx}`}
                                            className={cn(
                                                "rounded-2xl border px-4 py-3",
                                                isUser
                                                    ? "border-slate-200 bg-slate-50"
                                                    : "border-slate-200 bg-white"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className={cn("text-xs font-bold", isUser ? "text-slate-700" : "text-slate-900")}>
                                                    {isUser ? "You" : "AutoPay Bot"}
                                                </div>

                                                {!isUser ? (
                                                    <div className="text-[11px] text-slate-600">
                                                        {m.inScope === false ? "Out of scope" : ""}
                                                        {typeof m.confidence === "number" ? ` • conf ${m.confidence.toFixed(2)}` : ""}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{m.text}</div>
                                            {/* ✅ Sources removed from employee UI */}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="p-5 border-t border-slate-200">
                            <div className="flex items-end gap-3">
                                <textarea
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={onKeyDown}
                                    rows={2}
                                    placeholder="Type your question…"
                                    className="flex-1 min-h-[44px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={send}
                                    disabled={loading}
                                    className={cn(
                                        "rounded-2xl px-4 py-2 text-sm font-semibold border",
                                        loading
                                            ? "border-slate-200 bg-slate-50 text-slate-400"
                                            : "border-slate-900 bg-slate-900 hover:bg-slate-800 text-white"
                                    )}
                                >
                                    {loading ? "Sending…" : "Send"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Ticket suggestion */}
                    <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200">
                            <div className="text-sm font-semibold text-slate-900">Escalation</div>
                            <div className="text-xs text-slate-600 mt-1">
                                If the answers do not help, you can create a ticket to Payroll or Technical.
                            </div>
                        </div>

                        <div className="p-5">
                            {!ticketDraft ? (
                                <div className="text-sm text-slate-600">
                                    No escalation suggested right now.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="text-xs font-semibold text-slate-700">Ticket Type</div>
                                        <div className="text-sm font-bold text-slate-900 mt-1">
                                            {ticketDraft.type === "technical" ? "Technical" : "Payroll"}
                                        </div>

                                        <div className="text-xs font-semibold text-slate-700 mt-4">Title</div>
                                        <div className="text-sm text-slate-900 mt-1">{ticketDraft.title}</div>

                                        <div className="text-xs font-semibold text-slate-700 mt-4">Description (prefilled)</div>
                                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700 rounded-xl border border-slate-200 bg-white p-3 max-h-[220px] overflow-auto">
                                            {ticketDraft.description}
                                        </pre>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={createTicket}
                                        disabled={creatingTicket}
                                        className={cn(
                                            "w-full rounded-2xl px-4 py-2 text-sm font-semibold border",
                                            creatingTicket
                                                ? "border-slate-200 bg-slate-50 text-slate-400"
                                                : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900"
                                        )}
                                    >
                                        {creatingTicket ? "Creating…" : "Create Support Ticket"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTicketDraft(null)}
                                        className="w-full rounded-2xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </SidebarLayout>
    );
}
