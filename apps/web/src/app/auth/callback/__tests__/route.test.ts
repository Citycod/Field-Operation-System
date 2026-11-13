import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
}));

import { GET } from "../route";

describe("GET /auth/callback route handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges valid code for session and redirects to default next destination", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "mock-token" } },
      error: null,
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=valid-code");
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.status).toBe(307); // NextResponse.redirect default
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/dashboard");
  });

  it("preserves safe internal next parameter on successful verification", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "mock-token" } },
      error: null,
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=valid-code&next=/business/signup",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/business/signup");
  });

  it("handles missing authorization code and redirects with error=missing_code", async () => {
    const request = new NextRequest("http://localhost:3000/auth/callback");
    const response = await GET(request);

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/login?error=missing_code");
    expect(location).not.toContain("verified=true");
  });

  it("handles invalid authorization code and redirects with error=verification_failed", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid authorization code" },
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=invalid-code");
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("invalid-code");
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/login?error=verification_failed");
    expect(location).not.toContain("verified=true");
  });

  it("handles expired authorization code and redirects with error=verification_failed", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Code has expired" },
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=expired-code");
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/login?error=verification_failed");
    expect(location).not.toContain("verified=true");
  });

  it("sanitizes protocol-relative open redirect attempts", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=valid-code&next=//attacker.example/evil",
    );
    const response = await GET(request);

    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/dashboard");
    expect(location).not.toContain("attacker.example");
  });

  it("sanitizes external open redirect attempts", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=valid-code&next=https://attacker.example/evil",
    );
    const response = await GET(request);

    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/dashboard");
    expect(location).not.toContain("attacker.example");
  });

  it("safely handles unexpected client exceptions without exposing stack traces or secrets", async () => {
    mockExchangeCodeForSession.mockRejectedValue(new Error("Database connection reset"));

    const request = new NextRequest("http://localhost:3000/auth/callback?code=crash-code");
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/login?error=verification_failed");
    expect(location).not.toContain("Database connection reset");
  });
});

