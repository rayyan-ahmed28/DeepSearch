import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  User,
  AtSign,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  FlaskConical,
  ShieldCheck,
  BadgeCheck,
  Landmark,
  Package,
} from "lucide-react";

import BrandMark from "@/components/common/BrandMark";

type Domain = "legal" | "finance" | "both";

const DOMAIN_CHIPS: { id: Domain; label: string; colorClass: string }[] = [
  { id: "legal", label: "Legal", colorClass: "text-secondary" },
  { id: "finance", label: "Finance", colorClass: "text-tertiary" },
  { id: "both", label: "Both", colorClass: "" },
];

const TRUST_BADGES = [
  { icon: BadgeCheck, title: "Citation-Backed", subtitle: "Direct line-item proof", colorClass: "text-secondary" },
  { icon: ShieldCheck, title: "Source Verified", subtitle: "Every claim is traced", colorClass: "text-tertiary" },
  { icon: Landmark, title: "Dual Engine", subtitle: "Legal + Finance native", colorClass: "text-primary" },
];

/** Simple, honest password-strength heuristic — length + character variety. */
function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 14) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  return { score, label: labels[score] };
}

export default function SignUpPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState<Domain>("both");
  const strength = useMemo(() => passwordStrength(password), [password]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // No real auth in the MVP — UI-only flow (see D5 in the build plan).
    navigate("/dashboard");
  }

  return (
    <div className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest text-on-surface">
      {/* Left column: report preview + trust badges */}
      <section className="lg:col-span-6 flex flex-col justify-between p-8 lg:p-14 bg-surface-container-low relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center p-0.5">
              <BrandMark size={32} />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors">
                DeepSearch
              </span>
              <span className="font-label-code-sm text-[10px] text-outline tracking-widest uppercase">
                v2.4 Core
              </span>
            </div>
          </Link>
          <div className="text-label-code-sm font-label-code-sm text-outline tracking-wider uppercase">
            Create Account
          </div>
        </div>

        <div className="relative z-10 my-10 lg:my-auto flex flex-col items-center justify-center">
          <div className="absolute -inset-6 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative w-full max-w-lg bg-surface-container rounded-xl p-6 shadow-2xl transition-all duration-300 hover:scale-[1.01]">
            <div className="flex items-center justify-between pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-outline" />
                <span className="font-tag-caps text-tag-caps uppercase tracking-wider text-outline">
                  Sample Research Dossier
                </span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-tag-caps font-tag-caps text-tertiary bg-tertiary-container/25">
                Preview
              </span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold pt-1">
              How could a lawsuit against a company affect its stock price?
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant pt-2 leading-relaxed">
              A sample finding: the plaintiff alleges anticompetitive pricing practices{" "}
              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-primary/10 text-primary font-label-code-sm text-label-code-sm">
                [1]
              </span>
              , with the company's most recent 10-Q disclosing the litigation as a contingent liability{" "}
              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-primary/10 text-primary font-label-code-sm text-label-code-sm">
                [2]
              </span>
              .
            </p>
            <div className="mt-4 p-3 rounded-lg bg-surface-container-lowest">
              <div className="flex items-center justify-between pb-2">
                <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">
                  Stock Price — Illustrative
                </span>
              </div>
              <div className="relative w-full h-20">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 400 80">
                  <defs>
                    <linearGradient id="areaGradientSignup" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#7bd0ff" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#7bd0ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line stroke="#464555" strokeDasharray="2 3" strokeWidth="0.75" x1="0" x2="400" y1="20" y2="20" />
                  <line stroke="#464555" strokeDasharray="2 3" strokeWidth="0.75" x1="0" x2="400" y1="50" y2="50" />
                  <polygon fill="url(#areaGradientSignup)" points="0,65 40,58 90,62 140,45 200,48 240,25 280,30 330,68 370,72 400,60 400,80 0,80" />
                  <path d="M0,65 L40,58 L90,62 L140,45 L200,48 L240,25 L280,30 L330,68 L370,72 L400,60" fill="none" stroke="#7bd0ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  <line stroke="#ffb4ab" strokeDasharray="2 2" strokeWidth="1.5" x1="240" x2="240" y1="12" y2="76" />
                  <circle cx="240" cy="25" fill="#ffb4ab" r="3.5" />
                </svg>
                <div className="absolute left-[54%] top-0 -translate-y-1/2 flex items-center bg-surface-container-highest px-2 py-0.5 rounded shadow">
                  <span className="w-1.5 h-1.5 rounded-full bg-error mr-1.5" />
                  <span className="text-tag-caps font-tag-caps text-on-surface">Complaint filed</span>
                </div>
              </div>
            </div>
            <footer className="mt-4 flex items-center justify-between text-label-code-sm font-label-code-sm text-outline">
              <div className="flex items-center gap-1.5">
                <Package size={12} className="text-tertiary" />
                <span>Illustrative example — not real market data</span>
              </div>
            </footer>
          </div>

          <div className="mt-8 text-left w-full max-w-lg">
            <h1 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
              Autonomous AI research teams that plan, verify, and cite.
            </h1>
            <p className="mt-2 font-body-md text-body-md text-outline leading-relaxed">
              Multi-agent orchestration for legal research and financial analysis, built for a college research
              project.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TRUST_BADGES.map(({ icon: Icon, title, subtitle, colorClass }) => (
                <div key={title} className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container">
                  <Icon size={18} className={colorClass} />
                  <div className="flex flex-col">
                    <span className="text-tag-caps font-tag-caps font-bold text-on-surface uppercase">{title}</span>
                    <span className="text-body-sm font-body-sm text-outline">{subtitle}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="relative z-10 pt-4 text-label-code-sm font-label-code-sm text-outline text-center">
          DeepSearch — an academic multi-agent research project
        </footer>
      </section>

      {/* Right column: sign-up form */}
      <section className="lg:col-span-6 flex flex-col items-center justify-center p-6 sm:p-12 lg:p-16 bg-surface-container-lowest relative">
        <div className="w-full max-w-[440px] bg-surface-container-low rounded-2xl p-7 sm:p-8 shadow-2xl relative">
          <header className="flex flex-col gap-1 mb-6">
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
              Create your account
            </h2>
            <p className="font-body-md text-body-md text-outline">Get started with your first research query.</p>
          </header>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="full-name" className="block font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
                Full Name
              </label>
              <div className="relative flex items-center">
                <User size={18} className="absolute left-3 text-outline pointer-events-none" />
                <input
                  id="full-name"
                  type="text"
                  required
                  placeholder="e.g. Alexandra Vance"
                  className="w-full h-11 pl-10 pr-3 rounded-lg bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-high transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="block font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
                Email
              </label>
              <div className="relative flex items-center">
                <AtSign size={18} className="absolute left-3 text-outline pointer-events-none" />
                <input
                  id="signup-email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full h-11 pl-10 pr-3 rounded-lg bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-high transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-password" className="block font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock size={18} className="absolute left-3 text-outline pointer-events-none" />
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-lg bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-high transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 text-outline hover:text-on-surface"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && (
                <div className="pt-2">
                  <div className="grid grid-cols-4 gap-1.5 h-1 w-full rounded overflow-hidden">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-full rounded-full ${
                          i < strength.score
                            ? strength.score >= 3
                              ? "bg-tertiary"
                              : "bg-primary-container"
                            : "bg-surface-container-high"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1.5">
                    <span className="font-label-code-sm text-label-code-sm text-on-surface-variant">
                      {strength.label} ({password.length} chars)
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <span className="block font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
                What will you research?
              </span>
              <div className="grid grid-cols-3 gap-2">
                {DOMAIN_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setDomain(chip.id)}
                    className={`h-9 px-3 rounded-lg font-tag-caps text-tag-caps uppercase tracking-wider transition-colors ${
                      domain === chip.id
                        ? "bg-primary-container text-on-primary-container font-bold shadow-sm"
                        : `bg-surface-container-lowest hover:bg-surface-container ${chip.colorClass}`
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2">
              <input
                type="checkbox"
                defaultChecked
                id="terms"
                className="w-4 h-4 mt-0.5 rounded bg-surface-container-lowest text-primary-container focus:ring-0 focus:outline-none cursor-pointer"
              />
              <label htmlFor="terms" className="font-body-sm text-body-sm text-outline leading-tight cursor-pointer select-none">
                I agree to the{" "}
                <a href="#" className="text-on-surface underline hover:text-primary transition-colors">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="text-on-surface underline hover:text-primary transition-colors">
                  Privacy Policy
                </a>
                .
              </label>
            </div>

            <button
              type="submit"
              className="w-full h-11 mt-2 rounded-lg bg-primary text-on-primary font-body-md text-body-md font-semibold tracking-wide flex items-center justify-center gap-2 transition-all hover:bg-primary-fixed duration-200 active:scale-[0.99] shadow-md"
            >
              <span>Create account</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="relative flex items-center justify-center my-5">
            <div className="w-full h-px bg-surface-container-high" />
            <span className="absolute px-3 font-label-code-sm text-label-code-sm uppercase tracking-widest text-outline bg-surface-container-low">
              or
            </span>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="w-full h-10 rounded-lg bg-surface-container-lowest hover:bg-surface-container active:scale-[0.99] font-body-md text-body-md text-on-surface flex items-center justify-center gap-2 transition-all"
            >
              <FlaskConical size={16} className="text-secondary" />
              <span>Continue as guest (Demo Mode)</span>
            </button>
            <p className="text-center font-body-sm text-body-sm text-outline">
              Explore with pre-loaded research scenarios. No account needed.
            </p>
          </div>

          <footer className="mt-6 text-center">
            <p className="font-body-md text-body-md text-outline">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-semibold hover:text-primary-fixed underline transition-colors ml-1">
                Log in
              </Link>
            </p>
          </footer>
        </div>

        <footer className="mt-6 text-center text-label-code-sm font-label-code-sm text-outline">
          DeepSearch — academic project, not a commercial product
        </footer>
      </section>
    </div>
  );
}
