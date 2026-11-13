import { NextResponse } from "next/server";

export function formApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected form operation failure";
  if (message === "AUTHENTICATION_REQUIRED")
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  if (message.startsWith("Unauthorized:"))
    return NextResponse.json(
      {
        error:
          "You do not have permission to manage forms in this organization.",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  if (message.includes("not found") || message.includes("not the active draft"))
    return NextResponse.json(
      {
        error: "The requested editable draft was not found.",
        code: "NOT_FOUND",
      },
      { status: 404 },
    );
  return NextResponse.json(
    { error: message, code: "FORM_OPERATION_FAILED" },
    { status: 400 },
  );
}

export function dataSourceApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected data source operation failure";
  if (message === "AUTHENTICATION_REQUIRED")
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  if (message.startsWith("Unauthorized:"))
    return NextResponse.json(
      {
        error:
          "You do not have permission to access or manage data sources in this organization.",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  if (message.includes("not found"))
    return NextResponse.json(
      {
        error: message,
        code: "NOT_FOUND",
      },
      { status: 404 },
    );
  return NextResponse.json(
    { error: message, code: "DATA_SOURCE_OPERATION_FAILED" },
    { status: 400 },
  );
}

export function organizationApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected organization operation failure";
  if (message === "AUTHENTICATION_REQUIRED")
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  if (
    message.startsWith("Unauthorized:") ||
    message.includes("does not have active access") ||
    message.includes("Only business administrators")
  )
    return NextResponse.json(
      {
        error: message,
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  if (message.includes("already in use"))
    return NextResponse.json(
      {
        error: message,
        code: "SLUG_ALREADY_EXISTS",
      },
      { status: 409 },
    );
  if (message.includes("not found"))
    return NextResponse.json(
      {
        error: message,
        code: "NOT_FOUND",
      },
      { status: 404 },
    );
  return NextResponse.json(
    { error: message, code: "ORGANIZATION_OPERATION_FAILED" },
    { status: 400 },
  );
}

export function invitationApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected invitation operation failure";

  if (message === "AUTHENTICATION_REQUIRED") {
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  if (
    message.startsWith("Unauthorized:") ||
    message.includes("does not have active access") ||
    message.includes("Only organization administrators")
  ) {
    return NextResponse.json(
      { error: message, code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (message.includes("EMAIL_MISMATCH")) {
    return NextResponse.json(
      {
        error: "This invitation was sent to a different email address. Please sign in with the invited email.",
        code: "EMAIL_MISMATCH",
      },
      { status: 403 },
    );
  }

  if (message.includes("INVITATION_NOT_FOUND")) {
    return NextResponse.json(
      { error: "The invitation was not found.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (message.includes("INVITATION_EXPIRED")) {
    return NextResponse.json(
      { error: "The invitation has expired. Please request a new invitation.", code: "EXPIRED" },
      { status: 410 },
    );
  }

  if (message.includes("INVITATION_UNAVAILABLE")) {
    return NextResponse.json(
      { error: "The invitation link is invalid or has expired.", code: "UNAVAILABLE" },
      { status: 404 },
    );
  }

  if (message.includes("already exists") || message.includes("already an active member")) {
    return NextResponse.json(
      { error: message, code: "CONFLICT" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: message, code: "INVITATION_OPERATION_FAILED" },
    { status: 400 },
  );
}

export function tenantManagementApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected tenant management operation failure";

  if (message.includes("AUTHENTICATION_REQUIRED")) {
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  if (
    message.includes("UNAUTHORIZED") ||
    message.includes("Only an active administrator") ||
    message.includes("does not have active access")
  ) {
    return NextResponse.json(
      { error: message, code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (message.includes("CANNOT_REMOVE_LAST_ADMIN")) {
    return NextResponse.json(
      {
        error: "Organization must retain at least one active administrator.",
        code: "CANNOT_REMOVE_LAST_ADMIN",
      },
      { status: 400 },
    );
  }

  if (message.includes("ORGANIZATION_NOT_FOUND") || message.includes("MEMBERSHIP_NOT_FOUND")) {
    return NextResponse.json(
      { error: message, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { error: message, code: "TENANT_MANAGEMENT_FAILED" },
    { status: 400 },
  );
}


