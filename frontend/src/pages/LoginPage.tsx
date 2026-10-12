import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AtSign, Eye, EyeOff, ArrowRight, Terminal, BookOpen, BadgeCheck, Landmark } from "lucide-react";

import BrandMark from "@/components/common/BrandMark";
import AgentNetworkVignette from "@/components/common/AgentNetworkVignette";

const TRUST_BADGES = [
  { icon: BookOpen, label: "Citation-backed", colorClass: "text-primary" },
  { icon: BadgeCheck, label: "Source verified", colorClass: "text-tertiary" },
  { icon: Landmark, label: "Legal + Finance", colorClass: "text-secondary" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // No real auth in the MVP — this is a UI-only flow (see D5 in the build plan).
    navigate("/dashboard");
  }

  return (
    <div className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest text-on-surface">
      {/* Left column: brand + agent network vignette */}
      <div className="lg:col-span-7 flex flex-col justify-between p-8 lg:p-14 bg-surface-container-low relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-tertiary-container/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3.5 group transition-all duration-300 hover:opacity-90 active:scale-[0.99]">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center p-0.5 shadow-md group-hover:shadow-[0_0_12px_rgba(135,129,255,0.35)] transition-all">
              <BrandMark size={36} />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-lg text-headline-lg tracking-tight text-on-surface group-hover:text-primary transition-colors">
                DeepSearch
              </span>
              <span className="font-label-code-sm text-label-code-sm text-outline tracking-widest uppercase">
                Autonomous Intelligence Engine
              </span>
            </div>
          </Link>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container/60 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary" />
            </span>
            <span className="font-label-code-sm text-label-code-sm text-on-surface-variant uppercase tracking-wider">
              Mesh 4.2 · Live
            </span>
          </div>
        </div>

        <div className="relative z-10 my-10 lg:my-14 flex flex-col items-center justify-center">
          <AgentNetworkVignette />
        </div>

        <div className="relative z-10 flex flex-col gap-6 max-w-2xl">
          <h1 className="font-headline-xl text-headline-xl text-on-surface leading-tight">
            Autonomous AI research teams that plan, verify, and cite.
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Multi-agent orchestration for legal research and financial analysis, with every claim traced back to a
            source.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {TRUST_BADGES.map(({ icon: Icon, label, colorClass }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-container shadow-sm"
              >
                <Icon size={16} className={colorClass} />
                <span className="font-tag-caps text-tag-caps uppercase tracking-wider text-on-surface">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right column: auth form */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-surface-container-lowest">
        <div className="w-full max-w-[420px] bg-surface-container rounded-xl p-8 sm:p-9 shadow-xl relative">
          <div className="mb-7">
            <span className="font-label-code-sm text-label-code-sm text-primary uppercase tracking-widest block mb-1">
              Sign in
            </span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Welcome back</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Sign in to access your saved research.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block font-label-code-sm text-label-code-sm text-on-surface uppercase tracking-wide">
                Email
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="w-full h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg outline-none shadow-[0_0_0_1.5px_#8781ff,0_0_12px_rgba(135,129,255,0.25)] transition-all"
                />
                <AtSign size={18} className="absolute right-3 top-3 text-primary" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block font-label-code-sm text-label-code-sm text-on-surface uppercase tracking-wide">
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  className="w-full h-11 pl-3.5 pr-10 bg-surface-container-low text-on-surface font-body-md text-body-md rounded-lg outline-none hover:bg-surface-container-lowest focus:bg-surface-container-lowest focus:shadow-[0_0_0_1.5px_#8781ff] transition-all"
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 text-outline hover:text-on-surface transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-surface-container-low accent-primary cursor-pointer"
                />
                <span className="font-body-sm text-body-sm text-on-surface-variant">Remember me</span>
              </label>
              <a href="#" className="font-body-sm text-body-sm text-primary hover:text-primary-fixed-dim transition-colors">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              className="w-full h-11 mt-2 rounded-lg bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-medium hover:bg-primary hover:shadow-[0_0_16px_rgba(135,129,255,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <span>Log in</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="relative my-6 flex items-center justify-center">
            <div className="w-full h-px bg-surface-container-highest" />
            <span className="absolute px-3 bg-surface-container font-label-code-sm text-label-code-sm text-outline uppercase tracking-widest">
              or
            </span>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="w-full h-11 rounded-lg bg-surface-container-low hover:bg-surface-container-high hover:shadow-[0_0_12px_rgba(123,208,255,0.25)] active:scale-[0.98] text-on-surface font-headline-sm text-headline-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Terminal size={18} className="text-secondary" />
              <span>Continue as guest (Demo Mode)</span>
            </button>
            <p className="font-body-sm text-body-sm text-outline text-center px-2">
              Explore with pre-loaded research scenarios. No account needed.
            </p>
          </div>

          <div className="mt-8 pt-5 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              New to DeepSearch?{" "}
              <Link to="/signup" className="font-headline-sm text-body-sm text-primary hover:text-primary-fixed-dim hover:underline font-medium ml-1 transition-colors">
                Create an account
              </Link>
            </p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-outline">
            <span className="font-label-code-sm text-[10px] tracking-wide uppercase">
              Academic project — demo credentials only, nothing real is stored
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
