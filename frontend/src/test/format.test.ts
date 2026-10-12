import { describe, expect, it } from "vitest";

import { formatCalculation, formatClaimValue, formatDate, formatElapsed } from "@/lib/format";

describe("formatting", () => {
  it("signs percentage changes but not levels such as volatility", () => {
    expect(formatClaimValue(20.18, "%", "ret_period")).toBe("+20.2%");
    expect(formatClaimValue(-14.5, "%", "ret_charges")).toBe("-14.5%");
    expect(formatClaimValue(37.46, "%", "vol_annual")).toBe("37.5%");
    expect(formatClaimValue(-20.22, "%", "dd_max")).toBe("-20.2%");
    expect(formatClaimValue(5, "%")).toBe("+5.0%"); // no calculation: treated as a change
  });

  it("formats money claims readably", () => {
    expect(formatClaimValue(20_000_000, "USD")).toBe("20.0 million USD");
    expect(formatClaimValue(1_200_000_000, "USD")).toBe("1.20 billion USD");
  });

  it("formats calculations exactly as the backend fills report placeholders", () => {
    // backend/app/utils/placeholders.py: f"{result:.1f}%" and f"{result:,.2f} {unit}"
    expect(formatCalculation(20.18, "%")).toBe("20.2%");
    expect(formatCalculation(1234.5, "USD")).toBe("1,234.50 USD");
    expect(formatCalculation({ a: 1 }, "%")).toBe("[see data]");
  });

  it("shows dates the same in every time zone", () => {
    expect(formatDate("2026-10-12")).toBe("12 Oct 2026");
    expect(formatElapsed(65_000)).toBe("01:05");
  });
});
