import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import appIcon from "@/imports/WhatsApp_Image_2026-09-14_at_9.06.46_PM.jpeg";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthScreen = "login" | "signup" | "forgot";
type AppScreen  = "dashboard" | "expenses" | "emi" | "projection" | "whatif" | "insights" | "settings";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  college: string;
  city: string;
  joinedAt: string;
}

interface FinancialPrefs {
  income: number;
  monthlyBudget: number;
  currency: string;
  fiscalYearStart: string;
  riskProfile: string;
  investmentGoal: string;
}

interface AlertPrefs {
  otpLogin: boolean;
  spendingAlerts: boolean;
  appLock: boolean;
}

interface ExpenseItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  recurring: boolean;
  date: string;
}

interface EMIItem {
  id: string;
  name: string;
  amount: number;
  remaining: number;
  total: number;
  bank: string;
  interestRate: number;
}

interface ToastMsg { id: string; type: "success" | "error" | "info"; text: string; }

// ─── localStorage hook ────────────────────────────────────────────────────────

function useLS<T>(key: string, def: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? JSON.parse(s) : def;
    } catch { return def; }
  });
  const set = useCallback((updater: T | ((p: T) => T)) => {
    setVal(prev => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, set];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ["Food","Transport","Entertainment","Education","Utilities","Health","Shopping","Other"];

const CAT_META: Record<string, { color: string; icon: string }> = {
  Food:          { color: "#16a34a", icon: "🍽️" },
  Transport:     { color: "#0891b2", icon: "🚇" },
  Entertainment: { color: "#7c3aed", icon: "🎬" },
  Education:     { color: "#d97706", icon: "📚" },
  Utilities:     { color: "#dc2626", icon: "⚡" },
  Health:        { color: "#db2777", icon: "💊" },
  Shopping:      { color: "#ea580c", icon: "🛍️" },
  Other:         { color: "#6b7280", icon: "📦" },
};

const DEMO_EXPENSES: ExpenseItem[] = [
  { id: "e1", name: "Groceries & Food",     category: "Food",          amount: 4500, recurring: true,  date: "2024-09-01" },
  { id: "e2", name: "Metro & Auto",          category: "Transport",     amount: 1800, recurring: true,  date: "2024-09-01" },
  { id: "e3", name: "Netflix + Spotify",     category: "Entertainment", amount: 899,  recurring: true,  date: "2024-09-05" },
  { id: "e4", name: "Online Courses",        category: "Education",     amount: 1500, recurring: false, date: "2024-09-10" },
  { id: "e5", name: "Electricity & WiFi",   category: "Utilities",     amount: 2200, recurring: true,  date: "2024-09-03" },
  { id: "e6", name: "Gym Membership",        category: "Health",        amount: 1200, recurring: true,  date: "2024-09-01" },
  { id: "e7", name: "Amazon Shopping",       category: "Shopping",      amount: 3500, recurring: false, date: "2024-09-12" },
  { id: "e8", name: "Eating Out",            category: "Food",          amount: 2900, recurring: true,  date: "2024-09-08" },
];

const DEMO_EMIS: EMIItem[] = [
  { id: "em1", name: "Laptop EMI",     amount: 2500, remaining: 8,  total: 12, bank: "HDFC Bank",            interestRate: 14   },
  { id: "em2", name: "Education Loan", amount: 1500, remaining: 24, total: 36, bank: "State Bank of India",  interestRate: 8.5  },
];

const DEFAULT_PREFS: FinancialPrefs = {
  income: 0, monthlyBudget: 0, currency: "₹ INR",
  fiscalYearStart: "April", riskProfile: "Conservative", investmentGoal: "Emergency fund",
};

const DEFAULT_ALERTS: AlertPrefs = { otpLogin: true, spendingAlerts: true, appLock: false };

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// ─── Financial calculations (single source of truth) ─────────────────────────

function calcFinancials(income: number, expenses: ExpenseItem[], emis: EMIItem[]) {
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalEMI      = emis.reduce((s, e) => s + e.amount, 0);
  const monthlySavings = income - totalExpenses - totalEMI;
  const expenseRatio  = income > 0 ? totalExpenses / income : 0;
  const debtRatio     = income > 0 ? totalEMI / income : 0;
  const savingsRate   = income > 0 ? monthlySavings / income : 0;
  const score         = income > 0 ? Math.max(0, Math.min(100, Math.round(savingsRate * 200))) : 0;
  const outstanding   = emis.reduce((s, e) => s + e.remaining * e.amount, 0);
  return { totalExpenses, totalEMI, monthlySavings, expenseRatio, debtRatio, savingsRate, score, outstanding };
}

function scoreInfo(score: number) {
  if (score >= 65) return { label: "Sustainable",  color: "#16a34a", bg: "#dcfce7", ring: "#16a34a" };
  if (score >= 40) return { label: "Warning Zone", color: "#d97706", bg: "#fef9c3", ring: "#d97706" };
  return              { label: "High Risk",      color: "#dc2626", bg: "#fee2e2", ring: "#dc2626" };
}

function generateProjection(income: number, totalExp: number, totalEMI: number, months = 24) {
  const savings = income - totalExp - totalEMI;
  let balance = 0;
  return Array.from({ length: months + 1 }, (_, i) => {
    if (i > 0) balance += savings + balance * 0.006;
    return {
      monthIdx: i,
      month: i === 0 ? "Now" : `${i}m`,
      balance: Math.round(Math.max(0, balance)),
      cumSavings: Math.round(Math.max(0, savings * i)),
    };
  }).filter(d => [0,1,2,3,4,5,6,9,12,15,18,21,24].includes(d.monthIdx));
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function cn(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

function validateEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validatePhone(v: string) { return /^\d{10}$/.test(v.trim()); }

// ─── Toast system ─────────────────────────────────────────────────────────────

function ToastContainer({ toasts, remove }: { toasts: ToastMsg[]; remove: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={cn("flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-medium shadow-xl border pointer-events-auto animate-[fadeInDown_0.2s_ease]",
            t.type === "success" ? "bg-[#f0fdf4] border-emerald-200 text-emerald-800" :
            t.type === "error"   ? "bg-red-50 border-red-200 text-red-800" :
                                   "bg-white border-[#e5e7eb] text-[#374151]")}>
          <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
          <span>{t.text}</span>
          <button onClick={() => remove(t.id)} className="ml-1 text-current opacity-50 hover:opacity-100 cursor-pointer text-xs">✕</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toast = useCallback((text: string, type: ToastMsg["type"] = "success") => {
    const id = uid();
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  const remove = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, toast, remove };
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, body, onConfirm, onCancel, danger = true }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <p className="font-bold text-[#111827] mb-1">{title}</p>
        <p className="text-sm text-[#6b7280] mb-5">{body}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-[#6b7280] hover:bg-[#f3f4f6] cursor-pointer transition-all">Cancel</button>
          <button onClick={onConfirm}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all",
              danger ? "bg-red-600 text-white hover:bg-red-700" : "bg-[#16a34a] text-white hover:bg-[#15803d]")}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-2xl border border-[#e4ece4] shadow-[0_1px_4px_rgba(0,0,0,0.05)]", className)}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", className, type = "button", disabled, title }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary"|"outline"|"ghost"|"danger"|"white";
  size?: "xs"|"sm"|"md"|"lg"; className?: string; type?: "button"|"submit";
  disabled?: boolean; title?: string;
}) {
  const v = {
    primary: "bg-[#15803d] text-white hover:bg-[#166534] active:bg-[#14532d] shadow-sm shadow-green-200",
    outline: "bg-white text-[#15803d] border border-[#86efac] hover:bg-[#f0fdf4]",
    ghost:   "bg-transparent text-[#6b7280] hover:bg-[#f0f4f0]",
    danger:  "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100",
    white:   "bg-white/10 text-white border border-white/20 hover:bg-white/20",
  };
  const s = { xs:"px-2.5 py-1 text-xs rounded-lg", sm:"px-3 py-1.5 text-sm rounded-xl", md:"px-4 py-2.5 text-sm rounded-xl", lg:"px-6 py-3.5 text-[15px] rounded-xl font-semibold" };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={cn("font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2", v[variant], s[size], className)}>
      {children}
    </button>
  );
}

function Field({ label, type="text", value, onChange, placeholder, prefix, suffix, note, required, error, autoComplete }: {
  label?: string; type?: string; value: string|number; onChange: (v: string) => void;
  placeholder?: string; prefix?: string; suffix?: string; note?: string;
  required?: boolean; error?: string; autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[13px] font-semibold text-[#374151]">{label}</label>}
      <div className="relative">
        {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] text-sm select-none">{prefix}</span>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} required={required} autoComplete={autoComplete}
          className={cn(
            "w-full border rounded-xl py-3 text-sm bg-white text-[#111827] placeholder-[#9ca3af]",
            "outline-none focus:ring-2 focus:border-[#16a34a] transition-all",
            error ? "border-red-400 focus:ring-red-200" : "border-[#e5e7eb] focus:ring-[#16a34a]/25",
            prefix ? "pl-9 pr-3" : "px-4", suffix ? "pr-12" : ""
          )} />
        {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6b7280] text-sm select-none">{suffix}</span>}
      </div>
      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
      {!error && note && <p className="text-[11px] text-[#9ca3af]">{note}</p>}
    </div>
  );
}

function DropField({ label, value, onChange, options }: { label?: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[13px] font-semibold text-[#374151]">{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-[#e5e7eb] rounded-xl px-4 py-3 text-sm bg-white text-[#111827] outline-none focus:ring-2 focus:ring-[#16a34a]/25 focus:border-[#16a34a] transition-all cursor-pointer appearance-none">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Badge({ children, variant="green" }: {
  children: React.ReactNode;
  variant?: "green"|"yellow"|"red"|"blue"|"gray"|"purple";
}) {
  const v = {
    green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    yellow: "bg-amber-50   text-amber-700   border-amber-200",
    red:    "bg-red-50     text-red-700     border-red-200",
    blue:   "bg-sky-50     text-sky-700     border-sky-200",
    gray:   "bg-gray-50    text-gray-600    border-gray-200",
    purple: "bg-violet-50  text-violet-700  border-violet-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", v[variant])}>
      {children}
    </span>
  );
}

function ScoreArc({ score, size=130 }: { score: number; size?: number }) {
  const info = scoreInfo(score);
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.08))" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0f4f0" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={info.ring} strokeWidth={10}
        strokeDasharray={`${progress} ${circ - progress}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition:"stroke-dasharray 0.8s ease" }} />
      <text x={size/2} y={size/2-2} textAnchor="middle" fontSize={size*0.2} fontWeight="800" fill={info.ring} fontFamily="JetBrains Mono,monospace">{score}</text>
      <text x={size/2} y={size/2+14} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="DM Sans,sans-serif">/100</text>
    </svg>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1f0f] rounded-xl px-3 py-2.5 shadow-xl border border-white/10">
      <p className="text-white/50 text-[10px] mb-1.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs font-mono font-semibold" style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, icon, iconBg, trend }: {
  label: string; value: string; sub?: string; icon: string;
  iconBg?: string; trend?: { up: boolean; val: string };
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl" style={{ background: iconBg || "#f0fdf4" }}>{icon}</div>
        {trend && (
          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", trend.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
            {trend.up ? "↑" : "↓"} {trend.val}
          </span>
        )}
      </div>
      <p className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-[22px] font-bold text-[#111827] font-mono leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[#9ca3af] mt-1.5">{sub}</p>}
    </Card>
  );
}

// ─── OTP Input ────────────────────────────────────────────────────────────────

function OTPInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement|null)[]>([]);
  const handle = (i: number, v: string) => {
    const next = [...value]; next[i] = v.replace(/\D/,"").slice(-1); onChange(next);
    if (v && i < 5) refs.current[i+1]?.focus();
  };
  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i-1]?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6).split("");
    if (digits.length) { const next = [...value]; digits.forEach((d,i) => { next[i] = d; }); onChange(next); refs.current[Math.min(digits.length, 5)]?.focus(); }
    e.preventDefault();
  };
  return (
    <div className="flex gap-3 justify-center">
      {value.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }} type="text" inputMode="numeric"
          maxLength={1} value={d} onChange={e => handle(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)} onPaste={handlePaste}
          className="w-12 h-14 text-center text-xl font-bold font-mono border-2 border-[#e5e7eb] rounded-2xl bg-white text-[#111827] outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 transition-all" />
      ))}
    </div>
  );
}

// ─── Resend Timer ─────────────────────────────────────────────────────────────

function ResendTimer({ onResend }: { onResend: () => void }) {
  const [secs, setSecs] = useState(30);
  useEffect(() => {
    if (secs <= 0) return;
    const id = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secs]);
  if (secs > 0) return <p className="text-xs text-[#9ca3af] text-center">Resend OTP in <span className="font-mono font-semibold text-[#374151]">{secs}s</span></p>;
  return <button onClick={() => { setSecs(30); onResend(); }} className="text-xs text-[#16a34a] font-semibold hover:underline cursor-pointer text-center w-full">Resend OTP</button>;
}

// ─── Auth Brand ───────────────────────────────────────────────────────────────

function AuthBrand() {
  return (
    <div className="flex items-center gap-3 mb-8">
      <img src={appIcon} alt="SustainaSpend logo" className="w-12 h-12 rounded-2xl object-cover shadow-lg shadow-green-200/60 flex-shrink-0" />
      <div>
        <p className="font-bold text-[#111827] text-lg leading-tight">SustainaSpend</p>
        <p className="text-[11px] text-[#9ca3af]">Privacy-First Finance</p>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess, onGoSignup, onForgot }: {
  onSuccess: (p: UserProfile) => void;
  onGoSignup: () => void;
  onForgot: () => void;
}) {
  const [method, setMethod]   = useState<"phone"|"email">("phone");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone]     = useState("");
  const [loading, setLoading] = useState(false);
  const [errs, setErrs]       = useState<Record<string,string>>({});
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp]         = useState(["","","","","",""]);
  const [otpErr, setOtpErr]   = useState("");

  const validateEmailLogin = () => {
    const e: Record<string,string> = {};
    if (!email) e.email = "Email is required.";
    else if (!validateEmail(email)) e.email = "Enter a valid email address.";
    if (!password) e.password = "Password is required.";
    else if (password.length < 6) e.password = "Password must be at least 6 characters.";
    return e;
  };

  const validatePhone_ = () => {
    const e: Record<string,string> = {};
    if (!phone) e.phone = "Mobile number is required.";
    else if (!validatePhone(phone)) e.phone = "Enter a valid 10-digit mobile number.";
    return e;
  };

  const emailLogin = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validateEmailLogin();
    if (Object.keys(e).length) { setErrs(e); return; }
    setErrs({}); setLoading(true);
    // Check stored profile
    setTimeout(() => {
      setLoading(false);
      try {
        const stored = localStorage.getItem("ss_profile");
        const profile: UserProfile = stored ? JSON.parse(stored) : null;
        if (profile && profile.email === email) {
          onSuccess(profile);
        } else {
          setErrs({ email: "No account found with this email. Please sign up." });
        }
      } catch { setErrs({ email: "Sign in failed. Try again." }); }
    }, 700);
  };

  const sendOTP = () => {
    const e = validatePhone_();
    if (Object.keys(e).length) { setErrs(e); return; }
    setErrs({}); setLoading(true);
    setTimeout(() => { setLoading(false); setOtpStep(true); }, 900);
  };

  const verifyOTP = () => {
    const code = otp.join("");
    if (code.length < 6) { setOtpErr("Enter all 6 digits."); return; }
    setOtpErr(""); setLoading(true);
    setTimeout(() => {
      setLoading(false);
      try {
        const stored = localStorage.getItem("ss_profile");
        const profile: UserProfile = stored ? JSON.parse(stored) : null;
        if (profile && profile.phone === phone.trim()) {
          onSuccess(profile);
        } else {
          setOtpErr("No account found with this number. Please sign up.");
        }
      } catch { setOtpErr("Verification failed. Try again."); }
    }, 700);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0fdf4] via-[#f5f7f5] to-[#ecfdf5] flex">
      <div className="hidden lg:flex flex-col justify-between w-[420px] bg-gradient-to-br from-[#0a1a0c] via-[#14532d] to-[#166534] p-10 text-white">
        <div>
          <img src={appIcon} alt="SustainaSpend" className="w-14 h-14 rounded-2xl object-cover mb-8 shadow-xl shadow-black/30" />
          <h2 className="font-display text-4xl leading-tight mb-4">Financial freedom starts with awareness.</h2>
          <p className="text-green-300/80 text-sm leading-relaxed">Track spending, manage EMIs, and visualise your financial future — all without connecting a bank account.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[["🔒","Zero bank links"],["🌱","Sustainability score"],["📊","Smart projections"],["⚡","Real-time insights"]].map(([ic,lb]) => (
            <div key={lb} className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-xl">{ic}</span>
              <p className="text-xs text-white/70 mt-1.5 font-medium">{lb}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <AuthBrand />
          <h1 className="text-2xl font-bold text-[#111827] mb-1">Welcome back</h1>
          <p className="text-sm text-[#6b7280] mb-6">Sign in to your account</p>

          <div className="flex bg-[#f3f4f6] rounded-xl p-1 mb-5">
            {(["phone","email"] as const).map(m => (
              <button key={m} onClick={() => { setMethod(m); setErrs({}); setOtpStep(false); setOtp(["","","","","",""]); }}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer", method===m ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {m === "phone" ? "📱 Mobile OTP" : "✉️ Email"}
              </button>
            ))}
          </div>

          {method === "phone" && !otpStep && (
            <div className="flex flex-col gap-4">
              <Field label="Mobile Number" value={phone} onChange={setPhone} placeholder="10-digit mobile number"
                prefix="+91" type="tel" autoComplete="tel" error={errs.phone}
                note="A demo OTP will be shown for verification" />
              <Btn size="lg" onClick={sendOTP} disabled={loading} className="w-full">
                {loading ? "Sending…" : "Send OTP →"}
              </Btn>
            </div>
          )}

          {method === "phone" && otpStep && (
            <div className="flex flex-col gap-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 font-medium text-center">
                🧪 Demo OTP flow — enter any 6 digits to continue
              </div>
              <div className="text-center">
                <p className="text-sm text-[#6b7280]">OTP sent to <span className="font-semibold text-[#111827]">+91 {phone}</span></p>
              </div>
              <OTPInput value={otp} onChange={setOtp} />
              {otpErr && <p className="text-red-600 text-xs text-center bg-red-50 px-3 py-2 rounded-xl">{otpErr}</p>}
              <Btn size="lg" onClick={verifyOTP} disabled={loading} className="w-full">
                {loading ? "Verifying…" : "Verify & Sign In →"}
              </Btn>
              <ResendTimer onResend={() => {}} />
              <button onClick={() => { setOtpStep(false); setOtp(["","","","","",""]); setOtpErr(""); }}
                className="text-xs text-[#9ca3af] text-center hover:text-[#374151] cursor-pointer">← Change number</button>
            </div>
          )}

          {method === "email" && (
            <form onSubmit={emailLogin} className="flex flex-col gap-4">
              <Field label="Email address" type="email" value={email} onChange={setEmail}
                placeholder="your@email.com" autoComplete="email" error={errs.email} required />
              <Field label="Password" type="password" value={password} onChange={setPassword}
                placeholder="Your password" autoComplete="current-password" error={errs.password} required />
              <div className="flex justify-end">
                <button type="button" onClick={onForgot} className="text-xs text-[#16a34a] font-medium hover:underline cursor-pointer">Forgot password?</button>
              </div>
              <Btn size="lg" type="submit" disabled={loading} className="w-full">
                {loading ? "Signing in…" : "Sign In →"}
              </Btn>
            </form>
          )}

          <p className="text-sm text-center text-[#6b7280] mt-6">
            New here?{" "}
            <button onClick={onGoSignup} className="text-[#16a34a] font-semibold hover:underline cursor-pointer">Create account</button>
          </p>
          <p className="text-center text-[10px] text-[#9ca3af] mt-6">🔒 All data stored locally on your device · No bank connections</p>
        </div>
      </div>
    </div>
  );
}

// ─── Sign Up Screen ───────────────────────────────────────────────────────────

function SignupScreen({ onSuccess, onGoLogin }: { onSuccess: (p: UserProfile) => void; onGoLogin: () => void }) {
  const [step, setStep]       = useState<1|2|3>(1);
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [phone, setPhone]     = useState("");
  const [college, setCollege] = useState("");
  const [city, setCity]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [income, setIncome]   = useState("");
  const [otp, setOtp]         = useState(["","","","","",""]);
  const [loading, setLoading] = useState(false);
  const [errs, setErrs]       = useState<Record<string,string>>({});

  const steps = ["Personal Info","Verify Mobile","Financial Setup"];

  const step1Next = () => {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = "Full name is required.";
    if (!phone)        e.phone = "Mobile number is required.";
    else if (!validatePhone(phone)) e.phone = "Enter a valid 10-digit number.";
    if (!email) e.email = "Email is required.";
    else if (!validateEmail(email)) e.email = "Enter a valid email.";
    if (!password) e.password = "Password is required.";
    else if (password.length < 6) e.password = "Minimum 6 characters.";
    if (!confirm) e.confirm = "Please confirm your password.";
    else if (password !== confirm) e.confirm = "Passwords do not match.";
    if (Object.keys(e).length) { setErrs(e); return; }
    setErrs({}); setLoading(true);
    setTimeout(() => { setLoading(false); setStep(2); }, 900);
  };

  const step2Next = () => {
    const code = otp.join("");
    if (code.length < 6) { setErrs({ otp: "Enter all 6 digits." }); return; }
    setErrs({}); setStep(3);
  };

  const finish = () => {
    const e: Record<string,string> = {};
    if (!income || Number(income) <= 0) e.income = "Enter a valid monthly income.";
    if (Object.keys(e).length) { setErrs(e); return; }
    setLoading(true);
    setTimeout(() => {
      const profile: UserProfile = { name: name.trim(), email, phone, college, city, joinedAt: new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"}) };
      localStorage.setItem("ss_profile", JSON.stringify(profile));
      localStorage.setItem("ss_prefs", JSON.stringify({ ...DEFAULT_PREFS, income: Number(income), monthlyBudget: Math.round(Number(income)*0.8) }));
      localStorage.setItem("ss_expenses", JSON.stringify([]));
      localStorage.setItem("ss_emis", JSON.stringify([]));
      localStorage.setItem("ss_alerts", JSON.stringify(DEFAULT_ALERTS));
      onSuccess(profile);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0fdf4] via-[#f5f7f5] to-[#ecfdf5] flex items-center justify-center p-6">
      <div className="w-full max-w-[440px]">
        <AuthBrand />
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s,i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all",
                i+1 < step ? "bg-[#16a34a] text-white" : i+1===step ? "bg-[#111827] text-white ring-4 ring-[#16a34a]/20" : "bg-[#e5e7eb] text-[#9ca3af]")}>
                {i+1 < step ? "✓" : i+1}
              </div>
              {i < 2 && <div className={cn("flex-1 h-0.5 rounded-full transition-all", i+1 < step ? "bg-[#16a34a]" : "bg-[#e5e7eb]")} />}
            </div>
          ))}
        </div>

        <Card className="p-6">
          <p className="font-bold text-[#111827] mb-1">{steps[step-1]}</p>
          <p className="text-xs text-[#9ca3af] mb-5">
            {step===1 ? "Create your account details" : step===2 ? "Verify your mobile number" : "Set your financial starting point"}
          </p>

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <Field label="Full Name" value={name} onChange={setName} placeholder="e.g. Arjun Sharma" error={errs.name} />
              <Field label="Mobile Number" value={phone} onChange={setPhone} placeholder="10-digit number" prefix="+91" type="tel" error={errs.phone} note="Demo OTP will be sent" />
              <Field label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@email.com" error={errs.email} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="College / Institute" value={college} onChange={setCollege} placeholder="Optional" />
                <Field label="City" value={city} onChange={setCity} placeholder="Optional" />
              </div>
              <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="Min 6 characters" error={errs.password} autoComplete="new-password" />
              <Field label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" error={errs.confirm} autoComplete="new-password" />
              <Btn size="lg" onClick={step1Next} disabled={loading} className="w-full mt-1">
                {loading ? "Sending OTP…" : "Continue →"}
              </Btn>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 font-medium text-center">
                🧪 Demo OTP — enter any 6 digits to continue
              </div>
              <p className="text-sm text-[#6b7280] text-center">Code sent to <span className="font-semibold text-[#111827]">+91 {phone}</span></p>
              <OTPInput value={otp} onChange={setOtp} />
              {errs.otp && <p className="text-red-600 text-xs text-center">{errs.otp}</p>}
              <Btn size="lg" onClick={step2Next} className="w-full">Verify OTP →</Btn>
              <ResendTimer onResend={() => {}} />
              <button onClick={() => setStep(1)} className="text-xs text-[#9ca3af] text-center hover:text-[#374151] cursor-pointer">← Back</button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <Field label="Monthly Income" type="number" value={income} onChange={setIncome}
                prefix="₹" placeholder="e.g. 30000" error={errs.income}
                note="You can update this anytime in Settings" />
              <div className="bg-[#f0fdf4] border border-emerald-100 rounded-xl p-3 text-xs text-[#374151] leading-relaxed">
                <p className="font-semibold mb-1">🌱 Our Privacy Pledge</p>
                <p className="text-[#6b7280]">We never connect to your bank. All data lives locally on your device.</p>
              </div>
              <Btn size="lg" onClick={finish} disabled={loading} className="w-full">
                {loading ? "Creating account…" : "Create Account 🎉"}
              </Btn>
            </div>
          )}
        </Card>

        <p className="text-sm text-center text-[#6b7280] mt-5">
          Already have an account?{" "}
          <button onClick={onGoLogin} className="text-[#16a34a] font-semibold hover:underline cursor-pointer">Sign in</button>
        </p>
      </div>
    </div>
  );
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

function ForgotScreen({ onBack, toast }: { onBack: () => void; toast: (m: string, t?: ToastMsg["type"]) => void }) {
  const [phone, setPhone]   = useState("");
  const [otp, setOtp]       = useState(["","","","","",""]);
  const [newPass, setNewPass] = useState("");
  const [step, setStep]     = useState<"phone"|"otp"|"done">("phone");
  const [errs, setErrs]     = useState<Record<string,string>>({});

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0fdf4] via-[#f5f7f5] to-[#ecfdf5] flex items-center justify-center p-6">
      <div className="w-full max-w-[380px]">
        <AuthBrand />
        <Card className="p-6">
          {step === "phone" && (
            <div className="flex flex-col gap-4">
              <p className="font-bold text-[#111827]">Reset Password</p>
              <Field label="Registered Mobile Number" value={phone} onChange={setPhone} prefix="+91" type="tel" error={errs.phone} />
              <Btn size="lg" onClick={() => {
                if (!validatePhone(phone)) { setErrs({ phone: "Enter a valid 10-digit number." }); return; }
                setErrs({}); setStep("otp");
              }} className="w-full">Send Reset OTP →</Btn>
              <button onClick={onBack} className="text-xs text-center text-[#9ca3af] hover:text-[#374151] cursor-pointer">← Back to login</button>
            </div>
          )}
          {step === "otp" && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="font-bold text-[#111827] mb-1">Enter OTP</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 font-medium">🧪 Demo flow — any 6 digits work</div>
              </div>
              <OTPInput value={otp} onChange={setOtp} />
              <Field label="New Password" type="password" value={newPass} onChange={setNewPass} placeholder="Min 6 characters" error={errs.pass} />
              {errs.otp && <p className="text-xs text-red-600">{errs.otp}</p>}
              <Btn size="lg" onClick={() => {
                const e: Record<string,string> = {};
                if (otp.join("").length < 6) e.otp = "Enter all 6 digits.";
                if (newPass.length < 6) e.pass = "Minimum 6 characters.";
                if (Object.keys(e).length) { setErrs(e); return; }
                setStep("done"); toast("Password reset successfully.");
              }} className="w-full">Reset Password →</Btn>
            </div>
          )}
          {step === "done" && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✅</div>
              <p className="font-bold text-[#111827] mb-1">Password Updated</p>
              <p className="text-sm text-[#6b7280] mb-4">You can now sign in with your new password.</p>
              <Btn size="md" onClick={onBack} className="w-full">Back to Login</Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV: { key: AppScreen; icon: string; label: string }[] = [
  { key:"dashboard",  icon:"⊞", label:"Dashboard"       },
  { key:"expenses",   icon:"◎", label:"Expenses"         },
  { key:"emi",        icon:"◐", label:"EMI Manager"      },
  { key:"projection", icon:"◬", label:"Projection"       },
  { key:"whatif",     icon:"◇", label:"What-If Sim"      },
  { key:"insights",   icon:"◉", label:"Insights"         },
  { key:"settings",   icon:"⚙", label:"Settings"         },
];

function Sidebar({ current, onNav, user, onLogout, collapsed, onToggle }: {
  current: AppScreen; onNav: (s: AppScreen) => void;
  user: UserProfile; onLogout: () => void; collapsed: boolean; onToggle: () => void;
}) {
  return (
    <aside className={cn("hidden md:flex flex-col bg-[#0a1a0c] border-r border-white/5 transition-all duration-300 h-screen sticky top-0 flex-shrink-0", collapsed ? "w-[68px]" : "w-[232px]")}>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
        <img src={appIcon} alt="SustainaSpend" className="w-9 h-9 rounded-xl object-cover flex-shrink-0 shadow-lg shadow-black/30" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight">SustainaSpend</p>
            <p className="text-[10px] text-green-500/60">Privacy-First Finance</p>
          </div>
        )}
        <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto text-white/20 hover:text-white/60 transition-colors text-xs cursor-pointer flex-shrink-0">
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav className="flex-1 py-4 px-2.5 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = current === item.key;
          return (
            <button key={item.key} onClick={() => onNav(item.key)} title={item.label}
              className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer w-full text-left",
                active ? "bg-[#16a34a] text-white shadow-md shadow-green-900/40" : "text-white/50 hover:text-white hover:bg-white/8")}>
              <span className="text-base flex-shrink-0 leading-none">{item.icon}</span>
              {!collapsed && <span className="font-medium flex-1 truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        {collapsed ? (
          <button onClick={onLogout} title="Sign out"
            className="w-full flex justify-center p-2 text-white/30 hover:text-red-400 transition-colors cursor-pointer rounded-xl hover:bg-white/5">
            ⏻
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#16a34a] to-[#059669] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-white/40 truncate">+91 {user.phone}</p>
            </div>
            <button onClick={onLogout} title="Sign out"
              className="p-1.5 text-white/30 hover:text-red-400 transition-colors cursor-pointer rounded-lg hover:bg-white/5" aria-label="Sign out">
              ⏻
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileNav({ current, onNav }: { current: AppScreen; onNav: (s: AppScreen) => void }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e5e7eb] z-50" aria-label="Main navigation">
      <div className="flex justify-around py-2 px-1">
        {NAV.slice(0,5).map(item => (
          <button key={item.key} onClick={() => onNav(item.key)} aria-label={item.label}
            className={cn("flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all cursor-pointer", current===item.key ? "text-[#16a34a]" : "text-[#9ca3af]")}>
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[9px] font-semibold">{item.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function TopBar({ title, subtitle, user, onSettings }: {
  title: string; subtitle?: string; user: UserProfile; onSettings: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 bg-[#f5f7f5]/90 backdrop-blur-sm border-b border-[#e4ece4] px-6 py-3.5 flex items-center justify-between">
      <div>
        <h1 className="text-[17px] font-bold text-[#111827] leading-tight">{title}</h1>
        {subtitle && <p className="text-[11px] text-[#9ca3af] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white border border-transparent hover:border-[#e5e7eb] text-[#6b7280] transition-all cursor-pointer text-sm" aria-label="Notifications">🔔</button>
        <button onClick={onSettings} className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-white border border-transparent hover:border-[#e5e7eb] transition-all cursor-pointer" aria-label="Profile and settings">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#16a34a] to-[#059669] flex items-center justify-center text-xs font-bold text-white">
            {user.name[0]?.toUpperCase()}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-[11px] font-semibold text-[#374151] leading-tight">{user.name.split(" ")[0]}</p>
            <p className="text-[10px] text-[#9ca3af]">+91 {user.phone.slice(0,5)}…</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, body, action }: {
  icon: string; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="text-5xl">{icon}</div>
      <p className="font-bold text-[#374151] text-base">{title}</p>
      <p className="text-sm text-[#9ca3af] max-w-xs leading-relaxed">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─── Budget Alert Banner ──────────────────────────────────────────────────────

function BudgetAlert({ totalExpenses, budget }: { totalExpenses: number; budget: number }) {
  if (budget <= 0 || totalExpenses <= budget) return null;
  const over = totalExpenses - budget;
  return (
    <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
      <span className="text-lg flex-shrink-0 mt-0.5">🚨</span>
      <div>
        <p className="font-bold text-red-800 text-sm">Budget Exceeded</p>
        <p className="text-xs text-red-700 mt-0.5">
          You've gone <span className="font-mono font-bold">{fmt(over)}</span> over your monthly budget of <span className="font-mono font-bold">{fmt(budget)}</span>.
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardScreen({ prefs, expenses, emis, onNav, user }: {
  prefs: FinancialPrefs; expenses: ExpenseItem[]; emis: EMIItem[];
  onNav: (s: AppScreen) => void; user: UserProfile;
}) {
  const { totalExpenses, totalEMI, monthlySavings, score, expenseRatio } = calcFinancials(prefs.income, expenses, emis);
  const info     = scoreInfo(score);
  const isNew    = prefs.income === 0 && expenses.length === 0 && emis.length === 0;
  const projData = generateProjection(prefs.income, totalExpenses, totalEMI).filter(d => [0,3,6,12,18,24].includes(d.monthIdx));
  const pieData  = Object.entries(expenses.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category]||0)+e.amount }), {} as Record<string,number>)).map(([name,value])=>({name,value}));
  const warnings = expenses.filter(e => e.recurring && e.amount > 1500);

  if (isNew) {
    return (
      <div>
        <TopBar title="Dashboard" subtitle="Get started with SustainaSpend" user={user} onSettings={() => onNav("settings")} />
        <div className="p-6 max-w-3xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1a0c] via-[#14532d] to-[#166534] p-8 mb-6 text-white text-center">
            <p className="text-green-400/80 text-sm font-semibold mb-2">Welcome, {user.name.split(" ")[0]}! 👋</p>
            <h2 className="font-display text-3xl mb-3">Your financial journey starts here</h2>
            <p className="text-white/60 text-sm mb-6 max-w-md mx-auto">Set your income in Settings, then add your expenses and EMIs to see your Sustainability Score and projections come to life.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Btn variant="white" size="md" onClick={() => onNav("settings")}>⚙ Set Income</Btn>
              <Btn variant="white" size="md" onClick={() => onNav("expenses")}>+ Add Expenses</Btn>
              <Btn variant="white" size="md" onClick={() => onNav("emi")}>+ Add EMIs</Btn>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon:"💰", title:"Set your income",    desc:"Go to Settings and enter your monthly income.",        cta:"Settings",  s:"settings" as AppScreen },
              { icon:"💸", title:"Track expenses",     desc:"Add your monthly spending across different categories.", cta:"Add Expense", s:"expenses" as AppScreen },
              { icon:"📋", title:"Log EMIs & loans",   desc:"Track your EMI commitments and see debt ratios.",       cta:"Add EMI",    s:"emi" as AppScreen },
            ].map(c => (
              <Card key={c.title} className="p-5 text-center flex flex-col items-center gap-3">
                <span className="text-4xl">{c.icon}</span>
                <p className="font-bold text-[#111827] text-sm">{c.title}</p>
                <p className="text-xs text-[#9ca3af] leading-relaxed">{c.desc}</p>
                <Btn size="sm" onClick={() => onNav(c.s)}>{c.cta}</Btn>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Dashboard" subtitle={new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})} user={user} onSettings={()=>onNav("settings")} />
      <div className="p-6 max-w-7xl mx-auto">
        <BudgetAlert totalExpenses={totalExpenses} budget={prefs.monthlyBudget} />

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1a0c] via-[#14532d] to-[#166534] p-6 mb-6 text-white">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-1/3 translate-x-1/4" />
          <div className="relative flex items-center justify-between flex-wrap gap-6">
            <div>
              <p className="text-green-400/80 text-xs font-semibold uppercase tracking-widest mb-1">Good {new Date().getHours()<12?"morning":"afternoon"}, {user.name.split(" ")[0]} 👋</p>
              <h2 className="font-display text-3xl md:text-4xl leading-tight mb-2">
                {fmt(monthlySavings)}<span className="text-white/40 text-xl">/mo saved</span>
              </h2>
              <p className="text-white/60 text-sm">{monthlySavings >= 0 ? "You're on track for financial sustainability" : "Spending exceeds income — review your budget"}</p>
              <div className="flex gap-2 mt-4">
                <Btn variant="white" size="sm" onClick={() => onNav("whatif")}>◇ What-If</Btn>
                <Btn variant="white" size="sm" onClick={() => onNav("projection")}>◬ Projection</Btn>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ScoreArc score={score} size={140} />
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: info.bg, color: info.color }}>{info.label}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Monthly Income"  value={fmt(prefs.income)}   icon="💰" iconBg="#f0fdf4" sub="Manual entry" />
          <StatCard label="Total Expenses"  value={fmt(totalExpenses)}   icon="💸" iconBg="#fef2f2" sub={`${expenses.length} items`} />
          <StatCard label="EMI Burden"       value={fmt(totalEMI)}        icon="📋" iconBg="#f5f3ff" sub={`${emis.length} active EMIs`} />
          <StatCard label="Net Savings"      value={fmt(monthlySavings)}  icon="🌱" iconBg={monthlySavings>=0?"#f0fdf4":"#fef2f2"} sub={`${Math.round((monthlySavings/prefs.income)*100)}% rate`} trend={{ up: monthlySavings>=0, val:`${Math.abs(Math.round((monthlySavings/prefs.income)*100))}%` }} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          <Card className="lg:col-span-3 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-bold text-[#111827] text-sm">24-Month Trajectory</p>
                <p className="text-[11px] text-[#9ca3af]">Projected savings with investment returns</p>
              </div>
              <Btn variant="outline" size="xs" onClick={() => onNav("projection")}>Full View →</Btn>
            </div>
            {prefs.income === 0 ? (
              <div className="h-48 flex items-center justify-center text-center">
                <p className="text-sm text-[#9ca3af]">Set your income in Settings to see projections</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={projData}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="balance" name="Balance" stroke="#16a34a" strokeWidth={2.5} fill="url(#g1)" dot={false} activeDot={{ r:5, fill:"#16a34a", stroke:"#fff", strokeWidth:2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="lg:col-span-2 p-5">
            <p className="font-bold text-[#111827] text-sm mb-1">Spending Split</p>
            <p className="text-[11px] text-[#9ca3af] mb-3">By category this month</p>
            {pieData.length === 0 ? (
              <div className="h-36 flex items-center justify-center">
                <p className="text-xs text-[#9ca3af] text-center">Add expenses to see the breakdown</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={2} dataKey="value">
                      {pieData.map((e,i) => <Cell key={i} fill={CAT_META[e.name]?.color||"#6b7280"} />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {pieData.map(c => (
                    <div key={c.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAT_META[c.name]?.color }} />
                      <span className="text-[10px] text-[#9ca3af] truncate">{c.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {warnings.length > 0 && (
            <Card className="p-5 border-amber-200 bg-gradient-to-br from-amber-50 to-white">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚠️</span>
                <p className="font-bold text-amber-900 text-sm">Recurring Expense Alerts</p>
                <Badge variant="yellow">{warnings.length}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {warnings.map(e => (
                  <div key={e.id} className="flex justify-between items-center px-3 py-2.5 bg-white rounded-xl border border-amber-100">
                    <div className="flex items-center gap-2">
                      <span>{CAT_META[e.category]?.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-[#374151]">{e.name}</p>
                        <p className="text-[10px] text-[#9ca3af]">{e.category} · Monthly</p>
                      </div>
                    </div>
                    <p className="font-mono font-bold text-amber-700 text-sm">{fmt(e.amount)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card className="p-5">
            <p className="font-bold text-[#111827] text-sm mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label:"Add Expense", icon:"➕", s:"expenses" as AppScreen, bg:"#f0fdf4" },
                { label:"New EMI",     icon:"📋", s:"emi" as AppScreen,       bg:"#f5f3ff" },
                { label:"Projection",  icon:"📈", s:"projection" as AppScreen, bg:"#f0f9ff" },
                { label:"Simulate",    icon:"◇",  s:"whatif" as AppScreen,    bg:"#fff7ed" },
              ].map(a => (
                <button key={a.s} onClick={() => onNav(a.s)}
                  className="flex items-center gap-2.5 p-3.5 rounded-2xl border border-[#e5e7eb] hover:border-[#86efac] hover:shadow-sm transition-all cursor-pointer text-left"
                  style={{ background: a.bg }}>
                  <span className="text-xl">{a.icon}</span>
                  <span className="text-xs font-semibold text-[#374151]">{a.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Expenses Screen ──────────────────────────────────────────────────────────

function ExpensesScreen({ prefs, expenses, setExpenses, onNav, user, toast }: {
  prefs: FinancialPrefs; expenses: ExpenseItem[];
  setExpenses: (v: ExpenseItem[] | ((p: ExpenseItem[]) => ExpenseItem[])) => void;
  onNav: (s: AppScreen) => void; user: UserProfile;
  toast: (m: string, t?: ToastMsg["type"]) => void;
}) {
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string|null>(null);
  const [filterCat, setFilterCat] = useState("All");
  const [deleteId, setDeleteId]   = useState<string|null>(null);
  const [form, setForm]           = useState({ name:"", category:"Food", amount:"", recurring:false, date:"" });
  const [formErrs, setFormErrs]   = useState<Record<string,string>>({});

  const total    = expenses.reduce((s,e) => s+e.amount, 0);
  const filtered = filterCat === "All" ? expenses : expenses.filter(e => e.category === filterCat);

  const openAdd = () => { setForm({ name:"", category:"Food", amount:"", recurring:false, date:new Date().toISOString().slice(0,10) }); setEditId(null); setFormErrs({}); setShowForm(true); };
  const openEdit = (e: ExpenseItem) => { setForm({ name:e.name, category:e.category, amount:String(e.amount), recurring:e.recurring, date:e.date }); setEditId(e.id); setFormErrs({}); setShowForm(true); };

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.name.trim()) e.name = "Expense name is required.";
    if (!form.amount || Number(form.amount) <= 0) e.amount = "Enter an amount greater than zero.";
    return e;
  };

  const save = () => {
    const e = validate();
    if (Object.keys(e).length) { setFormErrs(e); return; }
    const item: ExpenseItem = {
      id: editId || uid(),
      name: form.name.trim(), category: form.category,
      amount: Number(form.amount), recurring: form.recurring,
      date: form.date || new Date().toISOString().slice(0,10),
    };
    setExpenses(prev => editId ? prev.map(x => x.id===editId ? item : x) : [...prev, item]);
    toast(editId ? "Expense updated." : "Expense added.");
    setShowForm(false); setEditId(null);
  };

  const confirmDelete = () => {
    setExpenses(prev => prev.filter(e => e.id !== deleteId));
    toast("Expense deleted.", "info");
    setDeleteId(null);
  };

  const byCategory = CATEGORIES.map(c => ({
    name: c, value: expenses.filter(e => e.category===c).reduce((s,e)=>s+e.amount,0),
  })).filter(c => c.value > 0);

  return (
    <div>
      {deleteId && (
        <ConfirmDialog title="Delete Expense" body="This expense will be permanently removed."
          onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
      )}
      <TopBar title="Monthly Expenses" subtitle={`${expenses.length} entries · Total ${fmt(total)}`} user={user} onSettings={()=>onNav("settings")} />
      <div className="p-6 max-w-7xl mx-auto">
        <BudgetAlert totalExpenses={total} budget={prefs.monthlyBudget} />

        {showForm && (
          <Card className="p-5 mb-5 border-[#86efac]">
            <p className="font-bold text-[#111827] mb-4">{editId ? "Edit Expense" : "New Expense"}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="col-span-2">
                <Field label="Expense Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. Groceries & Food" error={formErrs.name} />
              </div>
              <DropField label="Category" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} options={CATEGORIES} />
              <Field label="Amount" type="number" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} prefix="₹" placeholder="0" error={formErrs.amount} />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.recurring} onChange={e=>setForm(f=>({...f,recurring:e.target.checked}))} className="accent-[#16a34a] w-4 h-4 rounded" />
                <span className="text-sm text-[#374151] font-medium">Recurring monthly</span>
              </label>
              <div className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={()=>{ setShowForm(false); setFormErrs({}); }}>Cancel</Btn>
                <Btn size="sm" onClick={save}>{editId ? "Update" : "Add Expense"}</Btn>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              <div className="flex gap-1.5 flex-wrap flex-1">
                {["All",...CATEGORIES].map(c => (
                  <button key={c} onClick={()=>setFilterCat(c)}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border",
                      filterCat===c ? "bg-[#111827] text-white border-transparent" : "bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#9ca3af]")}>
                    {c}
                  </button>
                ))}
              </div>
              <Btn size="xs" onClick={openAdd}>+ Add</Btn>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon="💸" title="No expenses yet"
                body={filterCat==="All" ? "Add your first expense to start tracking your spending." : `No expenses in the ${filterCat} category.`}
                action={filterCat==="All" && <Btn size="sm" onClick={openAdd}>Add Expense</Btn>} />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map(exp => (
                  <Card key={exp.id} className="px-4 py-3.5 flex items-center gap-4 hover:shadow-md transition-shadow group">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: (CAT_META[exp.category]?.color||"#6b7280")+"18" }}>
                      {CAT_META[exp.category]?.icon||"📦"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#111827] text-sm">{exp.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="gray">{exp.category}</Badge>
                        {exp.recurring && <Badge variant="green">↻ Recurring</Badge>}
                        <span className="text-[10px] text-[#9ca3af]">{exp.date}</span>
                      </div>
                    </div>
                    <p className="font-mono font-bold text-[#111827] text-[15px]">{fmt(exp.amount)}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>openEdit(exp)} aria-label={`Edit ${exp.name}`}
                        className="p-1.5 rounded-lg hover:bg-[#f0fdf4] text-[#9ca3af] hover:text-[#16a34a] transition-all cursor-pointer text-sm">✏️</button>
                      <button onClick={()=>setDeleteId(exp.id)} aria-label={`Delete ${exp.name}`}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-all cursor-pointer text-sm">🗑️</button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {byCategory.length > 0 && (
              <Card className="p-5">
                <p className="font-bold text-[#111827] text-sm mb-4">Category Breakdown</p>
                <div className="flex flex-col gap-3">
                  {byCategory.map(c => (
                    <div key={c.name}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span>{CAT_META[c.name]?.icon}</span>
                          <span className="font-medium text-[#374151]">{c.name}</span>
                        </div>
                        <span className="font-mono font-semibold text-[#111827]">{fmt(c.value)}</span>
                      </div>
                      <div className="h-1.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width:`${(c.value/total)*100}%`, background: CAT_META[c.name]?.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card className="p-5 bg-[#0a1a0c] text-white">
              <p className="text-green-500/70 text-[11px] font-bold uppercase tracking-widest mb-3">Cash Flow</p>
              <div className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Income</span><span className="font-mono">{fmt(prefs.income)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Expenses</span><span className="font-mono text-red-400">−{fmt(total)}</span></div>
                <div className="h-px bg-white/10 my-1" />
                <div className="flex justify-between font-bold">
                  <span className="text-white/70 text-xs">After expenses (before EMIs)</span>
                  <span className={cn("font-mono", prefs.income-total>=0 ? "text-green-400":"text-red-400")}>{fmt(prefs.income-total)}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EMI Manager ──────────────────────────────────────────────────────────────

function EMIScreen({ prefs, emis, setEmis, onNav, user, toast }: {
  prefs: FinancialPrefs; emis: EMIItem[];
  setEmis: (v: EMIItem[] | ((p: EMIItem[]) => EMIItem[])) => void;
  onNav: (s: AppScreen) => void; user: UserProfile;
  toast: (m: string, t?: ToastMsg["type"]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [form, setForm]         = useState({ name:"", amount:"", remaining:"", total:"", bank:"", rate:"" });
  const [formErrs, setFormErrs] = useState<Record<string,string>>({});

  const totalEMI    = emis.reduce((s,e) => s+e.amount, 0);
  const outstanding = emis.reduce((s,e) => s+e.remaining*e.amount, 0);

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.name.trim()) e.name = "Loan name is required.";
    if (!form.amount || Number(form.amount) <= 0) e.amount = "Monthly EMI must be greater than zero.";
    if (!form.remaining || Number(form.remaining) <= 0) e.remaining = "Enter remaining months (> 0).";
    if (!form.total || Number(form.total) <= 0) e.total = "Enter total tenure (> 0).";
    if (form.remaining && form.total && Number(form.remaining) > Number(form.total)) e.remaining = "Remaining months cannot exceed total tenure.";
    if (form.rate && (Number(form.rate) < 0 || Number(form.rate) > 50)) e.rate = "Enter a valid interest rate (0–50%).";
    return e;
  };

  const addEMI = () => {
    const e = validate();
    if (Object.keys(e).length) { setFormErrs(e); return; }
    const item: EMIItem = {
      id: uid(), name: form.name.trim(), amount: Number(form.amount),
      remaining: Number(form.remaining), total: Number(form.total),
      bank: form.bank.trim()||"—", interestRate: Number(form.rate)||0,
    };
    setEmis(prev => [...prev, item]);
    toast("EMI added successfully.");
    setShowForm(false); setForm({ name:"", amount:"", remaining:"", total:"", bank:"", rate:"" }); setFormErrs({});
  };

  const confirmDelete = () => {
    setEmis(prev => prev.filter(e => e.id !== deleteId));
    toast("EMI removed.", "info");
    setDeleteId(null);
  };

  return (
    <div>
      {deleteId && (
        <ConfirmDialog title="Remove EMI" body="This EMI will be permanently removed from your tracker."
          onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
      )}
      <TopBar title="EMI Manager" subtitle={`${emis.length} active loan${emis.length!==1?"s":""} · ${fmt(totalEMI)}/month`} user={user} onSettings={()=>onNav("settings")} />
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Monthly EMI Burden" value={fmt(totalEMI)} icon="📋" iconBg="#f5f3ff" />
          <StatCard label="Debt-to-Income" value={prefs.income>0?`${Math.round((totalEMI/prefs.income)*100)}%`:"—"}
            icon="⚖️" iconBg={prefs.income>0&&totalEMI/prefs.income>0.3?"#fef2f2":"#f0fdf4"}
            sub={prefs.income>0 ? (totalEMI/prefs.income>0.3?"Exceeds 30% — high debt":"Within safe 30% limit") : "Set income in Settings"} />
          <StatCard label="Total Outstanding" value={fmt(outstanding)} icon="🏦" iconBg="#f0f9ff" sub="Across all loans" />
        </div>

        <div className="flex justify-end mb-4">
          <Btn onClick={() => { setForm({ name:"", amount:"", remaining:"", total:"", bank:"", rate:"" }); setFormErrs({}); setShowForm(true); }}>+ Add EMI</Btn>
        </div>

        {showForm && (
          <Card className="p-5 mb-5 border-violet-200">
            <p className="font-bold text-[#111827] mb-4">Add EMI / Loan</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="col-span-2 md:col-span-1"><Field label="Loan Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. Laptop EMI" error={formErrs.name} /></div>
              <Field label="Monthly Amount" type="number" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} prefix="₹" error={formErrs.amount} />
              <Field label="Interest Rate" type="number" value={form.rate} onChange={v=>setForm(f=>({...f,rate:v}))} suffix="%" placeholder="12" error={formErrs.rate} />
              <Field label="Bank / Lender" value={form.bank} onChange={v=>setForm(f=>({...f,bank:v}))} placeholder="e.g. HDFC Bank" />
              <Field label="Months Remaining" type="number" value={form.remaining} onChange={v=>setForm(f=>({...f,remaining:v}))} placeholder="8" error={formErrs.remaining} />
              <Field label="Total Tenure (months)" type="number" value={form.total} onChange={v=>setForm(f=>({...f,total:v}))} placeholder="12" error={formErrs.total} />
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={()=>{ setShowForm(false); setFormErrs({}); }}>Cancel</Btn>
              <Btn size="sm" onClick={addEMI}>Add EMI</Btn>
            </div>
          </Card>
        )}

        {emis.length === 0 ? (
          <EmptyState icon="📋" title="No EMIs tracked"
            body="Add your first loan or EMI commitment to track your debt and calculate debt-to-income ratio."
            action={<Btn size="sm" onClick={()=>{ setShowForm(true); }}>Add EMI</Btn>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emis.map(emi => {
              const pct  = ((emi.total-emi.remaining)/emi.total)*100;
              const paid = (emi.total-emi.remaining)*emi.amount;
              const left = emi.remaining*emi.amount;
              return (
                <Card key={emi.id} className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-bold text-[#111827]">{emi.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="gray">{emi.bank}</Badge>
                        {emi.interestRate>0 && <Badge variant="purple">{emi.interestRate}% p.a.</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-[11px] text-[#9ca3af]">Per month</p>
                        <p className="font-mono font-bold text-[#111827] text-lg">{fmt(emi.amount)}</p>
                      </div>
                      <button onClick={()=>setDeleteId(emi.id)} aria-label={`Remove ${emi.name}`}
                        className="p-1.5 text-[#9ca3af] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer ml-1">🗑️</button>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] text-[#9ca3af] mb-2">
                      <span>{emi.total-emi.remaining} / {emi.total} months paid</span>
                      <span className="font-semibold text-[#374151]">{Math.round(pct)}% done</span>
                    </div>
                    <div className="h-2.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#7c3aed] to-[#a855f7] rounded-full transition-all duration-700" style={{ width:`${pct}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#f3f4f6]">
                    {[["Remaining",`${emi.remaining}mo`,"#374151"],["Amount Left",fmt(left),"#dc2626"],["Paid So Far",fmt(paid),"#16a34a"]].map(([lb,vl,cl])=>(
                      <div key={lb}><p className="text-[10px] text-[#9ca3af]">{lb}</p><p className="font-mono font-semibold text-sm mt-0.5" style={{ color:cl }}>{vl}</p></div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Projection ───────────────────────────────────────────────────────────────

function ProjectionScreen({ prefs, expenses, emis, onNav, user }: {
  prefs: FinancialPrefs; expenses: ExpenseItem[]; emis: EMIItem[];
  onNav: (s: AppScreen) => void; user: UserProfile;
}) {
  const [period, setPeriod] = useState<3|6|12|24>(24);
  const { totalExpenses, totalEMI, monthlySavings, score } = calcFinancials(prefs.income, expenses, emis);
  const allData = useMemo(() => generateProjection(prefs.income, totalExpenses, totalEMI, 24), [prefs.income, totalExpenses, totalEMI]);
  const data    = allData.filter(d => d.monthIdx <= period);
  const final   = data[data.length-1]?.balance ?? 0;

  return (
    <div>
      <TopBar title="Future Projection" subtitle="Your financial trajectory over time" user={user} onSettings={()=>onNav("settings")} />
      <div className="p-6 max-w-7xl mx-auto">
        {prefs.income === 0 ? (
          <EmptyState icon="📈" title="Set your income first"
            body="Go to Settings and enter your monthly income to see how your savings grow over time."
            action={<Btn size="sm" onClick={()=>onNav("settings")}>Go to Settings</Btn>} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Monthly Savings" value={fmt(monthlySavings)} icon="🌱" iconBg="#f0fdf4" sub={monthlySavings>=0?"Positive flow":"Cash deficit"} />
              <StatCard label={`Projected at ${period}m`} value={fmt(final)} icon="🏆" iconBg="#fefce8" sub="With 7% annual return" />
              <StatCard label="Annual Savings" value={fmt(monthlySavings*12)} icon="📅" iconBg="#f0f9ff" />
              <StatCard label="Sustainability" value={`${score}/100`} icon="📊" iconBg={score>=65?"#f0fdf4":score>=40?"#fefce8":"#fef2f2"} />
            </div>

            <div className="flex gap-2 mb-6">
              {([3,6,12,24] as const).map(p => (
                <button key={p} onClick={()=>setPeriod(p)}
                  className={cn("px-5 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer",
                    period===p?"bg-[#111827] text-white shadow-md":"bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#374151]")}>
                  {p} months
                </button>
              ))}
            </div>

            <Card className="p-6 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="font-bold text-[#111827] text-lg">Cumulative Balance Projection</p>
                  <p className="text-sm text-[#9ca3af]">{fmt(monthlySavings)}/month savings · 7% annual investment return assumed</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[#9ca3af]">At {period} months</p>
                  <p className="font-display text-3xl text-[#16a34a]">{fmt(final)}</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data} margin={{ top:10, right:10, bottom:0, left:10 }}>
                  <defs>
                    <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0891b2" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="cumSavings" name="Cum. Savings" stroke="#0891b2" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#sGrad)" dot={false} />
                  <Area type="monotone" dataKey="balance" name="Balance" stroke="#16a34a" strokeWidth={3} fill="url(#pGrad)" dot={false} activeDot={{ r:6, fill:"#16a34a", stroke:"#fff", strokeWidth:2 }} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#f3f4f6]">
                {([3,6,12,24] as const).map(m => {
                  const pt = generateProjection(prefs.income, totalExpenses, totalEMI, m).at(-1);
                  return (
                    <div key={m} className={cn("p-4 rounded-2xl text-center transition-all", m===period?"bg-[#0a1a0c] text-white":"bg-[#f3f4f6]")}>
                      <p className={cn("text-[11px] font-medium mb-1.5", m===period?"text-green-400/70":"text-[#9ca3af]")}>{m} months</p>
                      <p className={cn("font-mono font-bold text-sm", m===period?"text-white":"text-[#374151]")}>{pt?fmt(pt.balance):"—"}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <p className="font-bold text-[#111827] text-sm mb-1">Monthly Cash Flow Breakdown</p>
              <p className="text-[11px] text-[#9ca3af] mb-4">Income vs Expenses vs EMI vs Net Savings</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { name:"Income",   value:prefs.income,                   fill:"#16a34a" },
                  { name:"Expenses", value:totalExpenses,                   fill:"#dc2626" },
                  { name:"EMIs",     value:totalEMI,                        fill:"#7c3aed" },
                  { name:"Savings",  value:Math.max(0,monthlySavings),      fill:"#0891b2" },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:12, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="value" name="Amount" radius={[8,8,0,0]}>
                    {[{fill:"#16a34a"},{fill:"#dc2626"},{fill:"#7c3aed"},{fill:"#0891b2"}].map((c,i)=><Cell key={i} fill={c.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ─── What-If Simulator ────────────────────────────────────────────────────────

function WhatIfScreen({ prefs, expenses, emis, onNav, user }: {
  prefs: FinancialPrefs; expenses: ExpenseItem[]; emis: EMIItem[];
  onNav: (s: AppScreen) => void; user: UserProfile;
}) {
  const { totalExpenses, totalEMI } = calcFinancials(prefs.income, expenses, emis);
  const [sIncome, setSIncome] = useState(String(prefs.income));
  const [sExp,    setSExp]    = useState(String(totalExpenses));
  const [sEMI,    setSEMI]    = useState(String(totalEMI));

  // Reset to current saved values
  const reset = () => { setSIncome(String(prefs.income)); setSExp(String(totalExpenses)); setSEMI(String(totalEMI)); };

  const before = { income: prefs.income, exp: totalExpenses, emi: totalEMI,
    savings: prefs.income - totalExpenses - totalEMI,
    score: calcFinancials(prefs.income, expenses, emis).score };

  const aIncome = Math.max(0, Number(sIncome)||0);
  const aExp    = Math.max(0, Number(sExp)||0);
  const aEMI    = Math.max(0, Number(sEMI)||0);
  const after   = { income: aIncome, exp: aExp, emi: aEMI, savings: aIncome - aExp - aEMI,
    score: calcFinancials(aIncome, [{ id:"x", name:"x", category:"Food", amount: aExp, recurring:false, date:"" }], aEMI > 0 ? [{ id:"y", name:"y", amount: aEMI, remaining:1, total:1, bank:"", interestRate:0 }] : []).score };

  const dScore = after.score - before.score;
  const dSav   = after.savings - before.savings;

  const bProj = generateProjection(before.income, before.exp, before.emi);
  const aProj = generateProjection(after.income, after.exp, after.emi);
  const combined = bProj.map((d,i) => ({ ...d, afterBalance: aProj[i]?.balance ?? 0 }));

  return (
    <div>
      <TopBar title="What-If Simulator" subtitle="Compare financial scenarios instantly" user={user} onSettings={()=>onNav("settings")} />
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-5 h-fit lg:sticky top-24">
            <p className="font-bold text-[#111827] text-sm mb-4">Adjust Scenario</p>
            <div className="flex flex-col gap-4">
              <Field label="Monthly Income" type="number" value={sIncome} onChange={setSIncome} prefix="₹" />
              <Field label="Monthly Expenses" type="number" value={sExp} onChange={setSExp} prefix="₹" />
              <Field label="Total EMI" type="number" value={sEMI} onChange={setSEMI} prefix="₹" />
            </div>
            <div className="border-t border-[#e5e7eb] mt-4 pt-4">
              <p className="text-xs text-[#9ca3af] mb-3 font-medium">Quick Presets</p>
              <div className="flex flex-col gap-2">
                {[
                  { label:"⬇ Cut expenses 20%",  action:()=>setSExp(String(Math.round(totalExpenses*0.8))) },
                  { label:"⬇ Cut expenses 30%",  action:()=>setSExp(String(Math.round(totalExpenses*0.7))) },
                  { label:"⬆ Income boost 25%",  action:()=>setSIncome(String(Math.round(prefs.income*1.25))) },
                  { label:"⬆ Income boost 50%",  action:()=>setSIncome(String(Math.round(prefs.income*1.5))) },
                  { label:"↺ Reset to current",  action:reset },
                ].map(p => (
                  <button key={p.label} onClick={p.action}
                    className="text-xs text-left px-3 py-2.5 rounded-xl bg-[#f5f7f5] hover:bg-[#dcfce7] text-[#374151] hover:text-[#14532d] font-medium transition-all cursor-pointer">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              {[{ label:"BEFORE", score:before.score, savings:before.savings },
                { label:"AFTER",  score:after.score,  savings:after.savings, highlight:true }].map(s => {
                const inf = scoreInfo(s.score);
                return (
                  <Card key={s.label} className={cn("p-5 text-center", s.highlight && "border-[#16a34a]/30 shadow-md shadow-green-100")}>
                    <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3">{s.label}</p>
                    <div className="flex justify-center mb-2"><ScoreArc score={s.score} size={110} /></div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background:inf.bg, color:inf.color }}>{inf.label}</span>
                    <p className="font-mono font-bold text-[#111827] text-xl mt-3">{fmt(s.savings)}<span className="text-xs font-normal text-[#9ca3af]">/mo</span></p>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className={cn("p-4 flex items-center gap-3", dScore>=0?"border-emerald-200 bg-emerald-50/60":"border-red-200 bg-red-50/60")}>
                <span className="text-3xl">{dScore>=0?"📈":"📉"}</span>
                <div>
                  <p className="text-[11px] text-[#9ca3af] font-medium">Score Change</p>
                  <p className={cn("font-mono font-bold text-xl", dScore>=0?"text-emerald-700":"text-red-600")}>{dScore>=0?"+":""}{dScore} pts</p>
                </div>
              </Card>
              <Card className={cn("p-4 flex items-center gap-3", dSav>=0?"border-emerald-200 bg-emerald-50/60":"border-red-200 bg-red-50/60")}>
                <span className="text-3xl">{dSav>=0?"💚":"🔴"}</span>
                <div>
                  <p className="text-[11px] text-[#9ca3af] font-medium">Savings Change</p>
                  <p className={cn("font-mono font-bold text-xl", dSav>=0?"text-emerald-700":"text-red-600")}>{dSav>=0?"+":""}{fmt(dSav)}</p>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <p className="font-bold text-[#111827] text-sm mb-1">24-Month Trajectory Comparison</p>
              <p className="text-[11px] text-[#9ca3af] mb-4">Dashed red = current · Solid green = after scenario</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={combined}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend />
                  <Line type="monotone" dataKey="balance" name="Current" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                  <Line type="monotone" dataKey="afterBalance" name="After" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:"#16a34a" }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function InsightsScreen({ prefs, expenses, emis, onNav, user }: {
  prefs: FinancialPrefs; expenses: ExpenseItem[]; emis: EMIItem[];
  onNav: (s: AppScreen) => void; user: UserProfile;
}) {
  const { totalExpenses, totalEMI, monthlySavings, score, savingsRate, expenseRatio, debtRatio } = calcFinancials(prefs.income, expenses, emis);
  const savRatePct  = savingsRate * 100;
  const debtRatePct = debtRatio * 100;
  const expRatePct  = expenseRatio * 100;

  const monthlyTrend = Array.from({ length:6 }, (_,i) => ({
    month: ["Apr","May","Jun","Jul","Aug","Sep"][i],
    expenses: Math.round(totalExpenses * (1+(Math.random()-0.5)*0.12)),
    savings:  Math.round(monthlySavings  * (1+(Math.random()-0.5)*0.15)),
  }));

  const topExp = [...expenses].sort((a,b) => b.amount-a.amount).slice(0,4);

  if (prefs.income === 0 && expenses.length === 0) {
    return (
      <div>
        <TopBar title="Financial Insights" subtitle="Smart analysis of your money habits" user={user} onSettings={()=>onNav("settings")} />
        <div className="p-6"><EmptyState icon="📊" title="No data yet" body="Add your income, expenses, and EMIs to see personalised financial insights." action={<Btn size="sm" onClick={()=>onNav("settings")}>Get Started</Btn>} /></div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Financial Insights" subtitle="Smart analysis of your money habits" user={user} onSettings={()=>onNav("settings")} />
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label:"Savings Rate",  value:`${savRatePct.toFixed(1)}%`, icon:savRatePct>=20?"✅":"⚠️", desc:savRatePct>=20?"Above recommended 20%":"Aim for 20% minimum", ok:savRatePct>=20 },
            { label:"Debt Ratio",    value:`${debtRatePct.toFixed(1)}%`, icon:debtRatePct<=30?"✅":"🔴", desc:debtRatePct<=30?"EMIs within 30% limit":"Exceeds safe 30% limit", ok:debtRatePct<=30 },
            { label:"Expense Ratio", value:`${expRatePct.toFixed(1)}%`,  icon:expRatePct<=60?"✅":"⚠️",  desc:expRatePct<=60?"Well-managed expenses":"Consider trimming spend", ok:expRatePct<=60 },
            { label:"Overall Score", value:`${score}/100`, icon:score>=65?"🌿":score>=40?"🌱":"🌵", desc:scoreInfo(score).label, ok:score>=50 },
          ].map(m => (
            <Card key={m.label} className="p-5">
              <div className="flex items-center gap-2 mb-3"><span className="text-xl">{m.icon}</span><Badge variant={m.ok?"green":"yellow"}>{m.value}</Badge></div>
              <p className="font-bold text-[#111827] text-sm">{m.label}</p>
              <p className="text-[11px] text-[#9ca3af] mt-1 leading-relaxed">{m.desc}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-5">
            <p className="font-bold text-[#111827] text-sm mb-1">6-Month Spending Trend</p>
            <p className="text-[11px] text-[#9ca3af] mb-4">Simulated historical view based on current data</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:12, fill:"#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip />} />
                <Legend />
                <Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[5,5,0,0]} />
                <Bar dataKey="savings"  name="Savings"  fill="#16a34a" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <p className="font-bold text-[#111827] text-sm mb-4">Top Spending Areas</p>
            {topExp.length === 0 ? (
              <div className="h-40 flex items-center justify-center"><p className="text-xs text-[#9ca3af]">Add expenses to see top spending areas.</p></div>
            ) : (
              <div className="flex flex-col gap-4">
                {topExp.map((e,i) => (
                  <div key={e.id} className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", i===0?"bg-[#fef9c3] text-amber-700":i===1?"bg-[#fee2e2] text-red-700":i===2?"bg-[#dcfce7] text-emerald-700":"bg-[#f3f4f6] text-[#6b7280]")}>{i+1}</div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold text-[#374151]">{e.name}</span>
                        <span className="font-mono font-bold text-[#111827]">{fmt(e.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width:`${(e.amount/topExp[0].amount)*100}%`, background:CAT_META[e.category]?.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-[#f3f4f6] bg-[#f0fdf4] rounded-xl p-3">
              <p className="text-xs font-bold text-[#374151] mb-1">💡 Smart Tip</p>
              <p className="text-[11px] text-[#6b7280] leading-relaxed">
                {totalExpenses > prefs.income*0.5
                  ? "Try the 50-30-20 rule: 50% Needs · 30% Wants · 20% Savings."
                  : "You're spending wisely. Consider investing surplus in index funds or SIPs for long-term wealth."}
              </p>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <p className="font-bold text-[#111827] text-sm mb-4">Financial Health Checklist</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[
              { ok:savRatePct>=10,          text:"Saving at least 10% of monthly income" },
              { ok:savRatePct>=20,          text:"Saving 20% or more (recommended)" },
              { ok:debtRatePct<=30,         text:"EMI burden under 30% of income" },
              { ok:debtRatePct<=15,         text:"EMI burden under 15% (ideal)" },
              { ok:expRatePct<=70,          text:"Expenses under 70% of income" },
              { ok:monthlySavings>0,        text:"Positive monthly cash flow" },
              { ok:score>=50,               text:"Sustainability score above 50" },
              { ok:emis.length<=2,          text:"Limited loan exposure (≤2 EMIs)" },
            ].map((item,i) => (
              <div key={i} className={cn("flex items-center gap-3 p-3.5 rounded-xl", item.ok?"bg-[#f0fdf4]":"bg-[#f9fafb]")}>
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0", item.ok?"bg-[#16a34a] text-white":"bg-[#e5e7eb] text-[#9ca3af]")}>{item.ok?"✓":"○"}</div>
                <span className={cn("text-sm", item.ok?"text-[#111827] font-medium":"text-[#9ca3af]")}>{item.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsScreen({ profile, setProfile, prefs, setPrefs, alerts, setAlerts, onLogout, toast, onResetDemo }: {
  profile: UserProfile; setProfile: (p: UserProfile | ((prev: UserProfile) => UserProfile)) => void;
  prefs: FinancialPrefs; setPrefs: (p: FinancialPrefs | ((prev: FinancialPrefs) => FinancialPrefs)) => void;
  alerts: AlertPrefs; setAlerts: (a: AlertPrefs | ((prev: AlertPrefs) => AlertPrefs)) => void;
  onLogout: () => void; toast: (m: string, t?: ToastMsg["type"]) => void;
  onResetDemo: () => void;
}) {
  const [tab, setTab]         = useState<"profile"|"financial"|"security"|"about">("profile");
  const [name, setName]       = useState(profile.name);
  const [email, setEmail]     = useState(profile.email);
  const [phone, setPhone]     = useState(profile.phone);
  const [college, setCollege] = useState(profile.college);
  const [city, setCity]       = useState(profile.city);
  const [errs, setErrs]       = useState<Record<string,string>>({});

  const [income, setIncome]   = useState(String(prefs.income));
  const [budget, setBudget]   = useState(String(prefs.monthlyBudget));
  const [currency, setCurrency]   = useState(prefs.currency);
  const [fiscal, setFiscal]       = useState(prefs.fiscalYearStart);
  const [risk, setRisk]           = useState(prefs.riskProfile);
  const [goal, setGoal]           = useState(prefs.investmentGoal);

  const [otpModal, setOtpModal] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [otpVal, setOtpVal]     = useState(["","","","","",""]);
  const [phStep, setPhStep]     = useState<"input"|"verify"|"done">("input");
  const [phErr, setPhErr]       = useState("");

  const [resetConfirm, setResetConfirm] = useState(false);

  const saveProfile = () => {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = "Name is required.";
    if (!validateEmail(email)) e.email = "Enter a valid email.";
    if (Object.keys(e).length) { setErrs(e); return; }
    setErrs({});
    setProfile(prev => ({ ...prev, name:name.trim(), email, college, city }));
    toast("Profile saved successfully.");
  };

  const saveFinancial = () => {
    const e: Record<string,string> = {};
    if (!income || Number(income) < 0) e.income = "Enter a valid income.";
    if (budget && Number(budget) < 0) e.budget = "Budget must be positive.";
    if (Object.keys(e).length) { setErrs(e); return; }
    setErrs({});
    setPrefs(prev => ({ ...prev, income:Number(income)||0, monthlyBudget:Number(budget)||0, currency, fiscalYearStart:fiscal, riskProfile:risk, investmentGoal:goal }));
    toast("Financial settings saved.");
  };

  const TABS = [
    { key:"profile",   label:"Profile",  icon:"👤" },
    { key:"financial", label:"Financial", icon:"₹"  },
    { key:"security",  label:"Security",  icon:"🔒" },
    { key:"about",     label:"About",     icon:"ℹ️" },
  ] as const;

  return (
    <div>
      {resetConfirm && (
        <ConfirmDialog title="Reset All Data" body="This will clear all your expenses, EMIs, and reset financial data. Your profile and login will be kept. This cannot be undone."
          onConfirm={() => { onResetDemo(); setResetConfirm(false); toast("All financial data has been reset.", "info"); }}
          onCancel={() => setResetConfirm(false)} />
      )}

      {/* Phone change modal */}
      {otpModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-6">
            {phStep === "input" && (
              <div className="flex flex-col gap-4">
                <p className="font-bold text-[#111827]">Change Mobile Number</p>
                <p className="text-sm text-[#6b7280]">Current: <span className="font-mono font-semibold">+91 {profile.phone}</span></p>
                <Field label="New Mobile Number" value={newPhone} onChange={setNewPhone} prefix="+91" type="tel" error={phErr} />
                <div className="flex gap-2">
                  <Btn variant="ghost" size="sm" onClick={()=>{ setOtpModal(false); setPhErr(""); setNewPhone(""); setPhStep("input"); }} className="flex-1">Cancel</Btn>
                  <Btn size="sm" onClick={()=>{ if(!validatePhone(newPhone)){setPhErr("Enter a valid 10-digit number.");return;} setPhErr(""); setPhStep("verify"); }} className="flex-1">Send OTP</Btn>
                </div>
              </div>
            )}
            {phStep === "verify" && (
              <div className="flex flex-col gap-4">
                <p className="font-bold text-[#111827]">Verify New Number</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">🧪 Demo OTP — any 6 digits</div>
                <OTPInput value={otpVal} onChange={setOtpVal} />
                {phErr && <p className="text-xs text-red-600">{phErr}</p>}
                <div className="flex gap-2">
                  <Btn variant="ghost" size="sm" onClick={()=>setPhStep("input")} className="flex-1">Back</Btn>
                  <Btn size="sm" className="flex-1" onClick={()=>{
                    if(otpVal.join("").length<6){setPhErr("Enter all 6 digits.");return;}
                    setProfile(prev=>({...prev,phone:newPhone}));
                    setPhone(newPhone); setPhStep("done"); setPhErr("");
                  }}>Verify</Btn>
                </div>
              </div>
            )}
            {phStep === "done" && (
              <div className="text-center py-3">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-bold text-[#111827] mb-1">Number Updated!</p>
                <p className="text-sm text-[#9ca3af] mb-4">+91 {newPhone} is now your verified number.</p>
                <Btn size="sm" className="w-full" onClick={()=>{ setOtpModal(false); setPhStep("input"); setNewPhone(""); setOtpVal(["","","","","",""]); toast("Mobile number updated."); }}>Done</Btn>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="sticky top-0 z-30 bg-[#f5f7f5]/90 backdrop-blur-sm border-b border-[#e4ece4] px-6 py-3.5">
        <h1 className="text-[17px] font-bold text-[#111827]">Settings</h1>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1">
            <Card className="p-4 text-center mb-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#16a34a] to-[#059669] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-2 shadow-lg shadow-green-200">
                {profile.name[0]?.toUpperCase()}
              </div>
              <p className="font-bold text-[#111827] text-sm">{profile.name}</p>
              <p className="text-[11px] text-[#9ca3af] mt-0.5">+91 {profile.phone}</p>
              <p className="text-[10px] text-[#9ca3af]">{profile.email}</p>
              <div className="mt-2"><Badge variant="green">🌱 Local Plan</Badge></div>
            </Card>
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setErrs({}); }}
                className={cn("flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer w-full text-left",
                  tab===t.key ? "bg-[#111827] text-white" : "text-[#6b7280] hover:bg-[#f3f4f6]")}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
            <button onClick={onLogout}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer w-full text-left mt-2 transition-all">
              <span>⏻</span> Sign Out
            </button>
          </div>

          <div className="md:col-span-3 flex flex-col gap-4">
            {tab === "profile" && (
              <Card className="p-5">
                <p className="font-bold text-[#111827] mb-5">Personal Information</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="col-span-2"><Field label="Full Name" value={name} onChange={setName} error={errs.name} /></div>
                  <div className="col-span-2"><Field label="Email Address" type="email" value={email} onChange={setEmail} error={errs.email} /></div>
                  <Field label="College / Institute" value={college} onChange={setCollege} placeholder="Optional" />
                  <Field label="City" value={city} onChange={setCity} placeholder="Optional" />
                </div>
                <div className="border border-[#e5e7eb] rounded-2xl p-4 mb-4">
                  <p className="text-[13px] font-semibold text-[#374151] mb-2">Mobile Number</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-[#111827]">+91 {profile.phone}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                        <span className="text-[11px] text-[#16a34a] font-medium">Verified</span>
                      </div>
                    </div>
                    <Btn variant="outline" size="sm" onClick={()=>setOtpModal(true)}>Change Number</Btn>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Btn variant="outline" size="sm" onClick={()=>{ setName(profile.name); setEmail(profile.email); setCollege(profile.college); setCity(profile.city); setErrs({}); }}>Discard</Btn>
                  <Btn size="sm" onClick={saveProfile}>Save Changes</Btn>
                </div>
              </Card>
            )}

            {tab === "financial" && (
              <Card className="p-5">
                <p className="font-bold text-[#111827] mb-5">Financial Preferences</p>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Monthly Income" type="number" value={income} onChange={setIncome} prefix="₹" error={errs.income} note="Updates score and projections instantly" />
                    <Field label="Monthly Budget" type="number" value={budget} onChange={setBudget} prefix="₹" error={errs.budget} note="Alert when expenses exceed this" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <DropField label="Currency" value={currency} onChange={setCurrency} options={["₹ INR","$ USD","€ EUR","£ GBP"]} />
                    <DropField label="Fiscal Year Start" value={fiscal} onChange={setFiscal} options={["April","January","July","October"]} />
                    <DropField label="Risk Profile" value={risk} onChange={setRisk} options={["Conservative","Moderate","Aggressive"]} />
                    <DropField label="Investment Goal" value={goal} onChange={setGoal} options={["Emergency fund","Retirement","Education","House","Travel","Wealth building"]} />
                  </div>
                  <div className="flex justify-end">
                    <Btn size="sm" onClick={saveFinancial}>Save Financial Settings</Btn>
                  </div>
                </div>
              </Card>
            )}

            {tab === "security" && (
              <div className="flex flex-col gap-4">
                <Card className="p-5">
                  <p className="font-bold text-[#111827] mb-4">Privacy & Notifications</p>
                  <div className="flex flex-col gap-3">
                    {[
                      { key:"otpLogin",       icon:"📱", title:"Mobile OTP Login",  desc:"Sign in with OTP (demo mode — no SMS sent)",    field:"otpLogin"       },
                      { key:"spendingAlerts", icon:"🔔", title:"Spending Alerts",   desc:"Alert when expenses exceed your monthly budget", field:"spendingAlerts" },
                      { key:"appLock",        icon:"🔐", title:"App Lock",          desc:"Require PIN/biometric on open (local only)",     field:"appLock"        },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between p-4 rounded-2xl bg-[#f9fafb] border border-[#f3f4f6]">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{item.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-[#374151]">{item.title}</p>
                            <p className="text-[11px] text-[#9ca3af]">{item.desc}</p>
                          </div>
                        </div>
                        <button
                          aria-label={`Toggle ${item.title}`}
                          onClick={() => setAlerts(prev => ({ ...prev, [item.field]: !prev[item.field as keyof AlertPrefs] }))}
                          className={cn("w-10 h-6 rounded-full transition-all cursor-pointer flex items-center px-1",
                            alerts[item.field as keyof AlertPrefs] ? "bg-[#16a34a] justify-end" : "bg-[#e5e7eb] justify-start")}>
                          <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#9ca3af] mt-3">These settings are stored locally. No real SMS, push notifications, or biometric unlock in this local prototype.</p>
                </Card>
                <Card className="p-5 border-red-200">
                  <p className="font-bold text-red-700 text-sm mb-3">Data Management</p>
                  <div className="flex flex-col gap-2">
                    <Btn variant="danger" size="sm" className="justify-start" onClick={() => setResetConfirm(true)}>
                      🔄 Reset All Financial Data
                    </Btn>
                    <Btn variant="danger" size="sm" className="justify-start" onClick={onLogout}>
                      ⏻ Sign Out
                    </Btn>
                  </div>
                  <p className="text-[11px] text-[#9ca3af] mt-2">Resetting clears expenses, EMIs, and financial data. Your account stays active.</p>
                </Card>
              </div>
            )}

            {tab === "about" && (
              <Card className="p-5">
                <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#f3f4f6]">
                  <img src={appIcon} alt="SustainaSpend" className="w-14 h-14 rounded-2xl object-cover shadow-lg shadow-green-200 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-[#111827] text-lg">SustainaSpend</p>
                    <p className="text-sm text-[#9ca3af]">Privacy-First Financial Platform</p>
                    <Badge variant="green">v1.0 · Local Prototype</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[["Version","1.0.0"],["Storage","localStorage (local)"],["Privacy","Zero data collection"],["Bank links","None — manual entry only"],["Member since",profile.joinedAt],["Platform","Web · PWA-ready"]].map(([k,v])=>(
                    <div key={k} className="bg-[#f9fafb] rounded-xl px-3 py-2.5">
                      <p className="text-[10px] text-[#9ca3af]">{k}</p>
                      <p className="text-sm font-semibold text-[#374151]">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[#f0fdf4] border border-emerald-100 rounded-2xl p-4 text-sm text-[#374151]">
                  <p className="font-bold mb-1">🔒 Privacy Promise</p>
                  <p className="text-[12px] text-[#6b7280] leading-relaxed">All data is stored only in your browser's localStorage. Nothing is sent to any server. No bank accounts are connected. You can delete everything from the Security tab at any time.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const [appScreen,  setAppScreen]  = useState<AppScreen>("dashboard");
  const [collapsed,  setCollapsed]  = useState(false);
  const { toasts, toast, remove }   = useToast();

  // Persisted state
  const [isLoggedIn, setIsLoggedIn] = useLS("ss_loggedIn", false);
  const [profile,    setProfile]    = useLS<UserProfile>("ss_profile", { name:"", email:"", phone:"", college:"", city:"", joinedAt:"" });
  const [prefs,      setPrefs]      = useLS<FinancialPrefs>("ss_prefs", DEFAULT_PREFS);
  const [expenses,   setExpenses]   = useLS<ExpenseItem[]>("ss_expenses", []);
  const [emis,       setEmis]       = useLS<EMIItem[]>("ss_emis", []);
  const [alerts,     setAlerts]     = useLS<AlertPrefs>("ss_alerts", DEFAULT_ALERTS);

  const handleLogin = useCallback((p: UserProfile) => {
    setProfile(p);
    setIsLoggedIn(true);
    setAppScreen("dashboard");
  }, [setProfile, setIsLoggedIn]);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setAuthScreen("login");
  }, [setIsLoggedIn]);

  const handleResetDemo = useCallback(() => {
    setExpenses([]);
    setEmis([]);
    setPrefs(prev => ({ ...prev, income: 0, monthlyBudget: 0 }));
  }, [setExpenses, setEmis, setPrefs]);

  const nav = useCallback((s: AppScreen) => setAppScreen(s), []);

  // Auth
  if (!isLoggedIn) {
    if (authScreen === "signup") return <SignupScreen onSuccess={handleLogin} onGoLogin={() => setAuthScreen("login")} />;
    if (authScreen === "forgot") return <ForgotScreen onBack={() => setAuthScreen("login")} toast={toast} />;
    return (
      <>
        <ToastContainer toasts={toasts} remove={remove} />
        <LoginScreen onSuccess={handleLogin} onGoSignup={() => setAuthScreen("signup")} onForgot={() => setAuthScreen("forgot")} />
      </>
    );
  }

  const sharedProps = { prefs, expenses, emis, onNav: nav, user: profile };

  const renderScreen = () => {
    switch (appScreen) {
      case "dashboard":  return <DashboardScreen {...sharedProps} />;
      case "expenses":   return <ExpensesScreen  {...sharedProps} setExpenses={setExpenses} toast={toast} />;
      case "emi":        return <EMIScreen        {...sharedProps} setEmis={setEmis} toast={toast} />;
      case "projection": return <ProjectionScreen {...sharedProps} />;
      case "whatif":     return <WhatIfScreen     {...sharedProps} />;
      case "insights":   return <InsightsScreen   {...sharedProps} />;
      case "settings":   return (
        <SettingsScreen profile={profile} setProfile={setProfile} prefs={prefs} setPrefs={setPrefs}
          alerts={alerts} setAlerts={setAlerts} onLogout={handleLogout} toast={toast} onResetDemo={handleResetDemo} />
      );
      default: return <DashboardScreen {...sharedProps} />;
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} remove={remove} />
      <div className="flex h-screen overflow-hidden bg-[#f5f7f5]">
        <Sidebar current={appScreen} onNav={nav} user={profile} onLogout={handleLogout} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0 min-w-0">
          {renderScreen()}
        </main>
        <MobileNav current={appScreen} onNav={nav} />
      </div>
    </>
  );
}
