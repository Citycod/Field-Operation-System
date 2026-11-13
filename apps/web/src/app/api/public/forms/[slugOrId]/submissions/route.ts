import { NextRequest, NextResponse } from "next/server";
import { publicSubmissionService } from "@/lib/services/server-form-service";

// Simple sliding window rate limiter: max 20 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 60 * 1000;
const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1MB

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + WINDOW_MS });
    if (rateLimitMap.size > 1000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetAt) rateLimitMap.delete(k);
      }
    }
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  entry.count += 1;
  return false;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slugOrId: string }> },
) {
  try {
    const { slugOrId } = await context.params;
    if (!slugOrId) {
      return NextResponse.json(
        { error: "Missing form identifier" },
        { status: 400 },
      );
    }

    // Rate limiting check
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "anonymous-client";
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: "Too many submission attempts. Please wait a moment before trying again." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    // Request size check (header + actual body bytes)
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Payload exceeds 1MB limit." },
        { status: 413 },
      );
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Payload exceeds 1MB limit." },
        { status: 413 },
      );
    }

    const body = rawBody ? JSON.parse(rawBody) : null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid submission payload" },
        { status: 400 },
      );
    }

    const service = publicSubmissionService();
    const result = await service.submitPublicForm(slugOrId, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Failed to record submission";

    let status = 500;
    let clientMessage = "Unable to record submission. Please try again.";

    if (error instanceof SyntaxError) {
      status = 400;
      clientMessage = "Invalid JSON submission payload.";
    } else if (rawMessage.includes("not found") || rawMessage.includes("unavailable")) {
      status = 404;
      clientMessage = "This form is unavailable or not accepting submissions.";
    } else if (
      rawMessage.includes("private") ||
      rawMessage.includes("expired") ||
      rawMessage.includes("anonymous submissions")
    ) {
      status = 403;
      clientMessage = rawMessage.includes("expired")
        ? "This public form link has expired."
        : "This form is private and does not accept public submissions.";
    } else if (rawMessage.includes("validation failed")) {
      status = 422;
      clientMessage = rawMessage;
    } else if (rawMessage.includes("duplicate") || rawMessage.includes("violates")) {
      status = 409;
      clientMessage = "Duplicate submission or conflict detected.";
    } else if (rawMessage.includes("Invalid") || rawMessage.includes("exceeds")) {
      status = 400;
      clientMessage = rawMessage;
    }

    return NextResponse.json({ error: clientMessage }, { status });
  }
}
