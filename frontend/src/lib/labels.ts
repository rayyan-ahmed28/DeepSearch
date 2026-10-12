/**
 * Display labels and colour classes for claims, sources and domains.
 * Class strings are complete literals so Tailwind can see them.
 */
import type { ClaimStatus, ClaimType, DomainName, SourceType } from "@/lib/executionEvents";

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  established_fact: "Established fact",
  allegation: "Allegation",
  party_claim: "Party claim",
  company_statement: "Company statement",
  regulatory_statement: "Regulatory statement",
  news_report: "News report",
  analysis: "Analysis",
};

export const CLAIM_TYPE_CLASS: Record<ClaimType, string> = {
  established_fact: "bg-tertiary/10 text-tertiary border-tertiary/30",
  allegation: "bg-[#f5b942]/10 text-[#f5b942] border-[#f5b942]/30",
  party_claim: "bg-[#f5b942]/10 text-[#f5b942] border-[#f5b942]/30",
  company_statement: "bg-secondary/10 text-secondary border-secondary/30",
  regulatory_statement: "bg-secondary/10 text-secondary border-secondary/30",
  news_report: "bg-surface-container-high text-on-surface-variant border-outline-variant/40",
  analysis: "bg-primary/10 text-primary border-primary/30",
};

/** Legal guardrail: say what a claim type does and does not establish. */
export const CLAIM_TYPE_NOTE: Partial<Record<ClaimType, string>> = {
  allegation: "Allegation, not an established fact. Verified means the allegation was made, not that it is true.",
  party_claim: "A party's own claim, not an established fact.",
  company_statement: "The company's own statement, attributed to the company.",
  analysis: "Analysis, not a sourced fact.",
};

export const VERIFICATION_LABEL: Record<ClaimStatus, string> = {
  verified: "Verified",
  corroborated: "Corroborated",
  unverified: "Unverified",
  conflicting: "Conflicting",
};

export const VERIFICATION_CLASS: Record<ClaimStatus, string> = {
  verified: "text-tertiary",
  corroborated: "text-secondary",
  unverified: "text-outline",
  conflicting: "text-error",
};

export const VERIFICATION_DOT: Record<ClaimStatus, string> = {
  verified: "bg-tertiary",
  corroborated: "bg-secondary",
  unverified: "bg-outline",
  conflicting: "bg-error",
};

/** The rules behind each status (mirrors backend `VerificationStatus`). */
export const VERIFICATION_HELP: Record<ClaimStatus, string> = {
  verified: "Backed by an official court or regulatory source, or the company's own filing or release",
  corroborated: "Two or more independent sources agree",
  unverified: "No source, or a single non-official source",
  conflicting: "Sources disagree on a date or figure",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official_court: "Official court record",
  regulatory: "Regulatory",
  company: "Company",
  reputable_news: "Reputable news",
  secondary: "Secondary",
};

export const SOURCE_TYPE_CLASS: Record<SourceType, string> = {
  official_court: "bg-secondary/10 text-secondary border-secondary/20",
  regulatory: "bg-secondary/10 text-secondary border-secondary/20",
  company: "bg-tertiary/10 text-tertiary border-tertiary/20",
  reputable_news: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-surface-container-high text-on-surface-variant border-outline-variant/30",
};

export type SourceFilter = "all" | "official" | "company" | "news";

export const SOURCE_FILTERS: { id: SourceFilter; label: string; types: SourceType[] }[] = [
  { id: "all", label: "All", types: ["official_court", "regulatory", "company", "reputable_news", "secondary"] },
  { id: "official", label: "Official", types: ["official_court", "regulatory"] },
  { id: "company", label: "Company", types: ["company"] },
  { id: "news", label: "News", types: ["reputable_news", "secondary"] },
];

/** `null` = cross-domain (a claim that needs both Legal and Finance evidence). */
export function domainChip(domain: DomainName | null): { label: string; className: string } {
  if (domain === "legal") return { label: "Legal", className: "bg-secondary/10 text-secondary border-secondary/30" };
  if (domain === "finance") return { label: "Finance", className: "bg-tertiary/10 text-tertiary border-tertiary/30" };
  return { label: "Legal + Finance", className: "bg-primary/10 text-primary border-primary/30" };
}
