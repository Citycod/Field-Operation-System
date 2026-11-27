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
  if (message.includes("IMPORT_TOO_LARGE"))
    return NextResponse.json(
      { error: message, code: "PAYLOAD_TOO_LARGE" },
      { status: 413 },
    );
  if (
    message.includes("MALFORMED_JSON") ||
    message.includes("INVALID_IMPORT_PAYLOAD") ||
    message.includes("UNSUPPORTED_SCHEMA_VERSION") ||
    message.includes("UNSUPPORTED_EXPORT_FORMAT") ||
    message.includes("IMPORT_SCHEMA_INVALID") ||
    message.includes("IMPORT_BROKEN_REFERENCES") ||
    message.includes("UNSAFE_EXTERNAL_REFERENCE") ||
    message.includes("IMPORT_DEPTH_EXCEEDED")
  )
    return NextResponse.json(
      { error: message, code: "IMPORT_VALIDATION_FAILED" },
      { status: 422 },
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

export function submissionApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected submission operation failure";

  if (message === "AUTHENTICATION_REQUIRED") {
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  if (
    message.startsWith("Unauthorized:") ||
    message.includes("Unauthorized") ||
    message.includes("not permitted") ||
    message.includes("not authorized") ||
    message.includes("does not have active access")
  ) {
    return NextResponse.json(
      { error: message, code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (
    message.includes("APPROVAL_STAGE_ALREADY_DECIDED") ||
    message.includes("APPROVAL_INSTANCE_NOT_ACTIVE") ||
    message.includes("SUBMISSION_ALREADY_TERMINAL") ||
    message.includes("SUBMISSION_NOT_RETURNED")
  ) {
    return NextResponse.json(
      { error: message, code: "CONFLICT" },
      { status: 409 },
    );
  }

  if (
    message.includes("Submission validation failed") ||
    message.includes("COMMENT_REQUIRED")
  ) {
    return NextResponse.json(
      { error: message, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  if (message.includes("not found") || message.includes("NOT_FOUND")) {
    return NextResponse.json(
      { error: message, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { error: message, code: "SUBMISSION_OPERATION_FAILED" },
    { status: 400 },
  );
}

export function approvalApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected approval operation failure";

  if (message === "AUTHENTICATION_REQUIRED" || message.includes("AUTHENTICATION_REQUIRED")) {
    return NextResponse.json(
      { error: "Sign in is required.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  if (
    message.startsWith("Unauthorized:") ||
    message.includes("UNAUTHORIZED") ||
    message.includes("not assigned") ||
    message.includes("not permitted") ||
    message.includes("not authorized")
  ) {
    return NextResponse.json(
      { error: message, code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (
    message.includes("APPROVAL_STAGE_ALREADY_DECIDED") ||
    message.includes("APPROVAL_INSTANCE_NOT_ACTIVE") ||
    message.includes("SUBMISSION_ALREADY_TERMINAL")
  ) {
    return NextResponse.json(
      { error: message, code: "CONFLICT" },
      { status: 409 },
    );
  }

  if (message.includes("COMMENT_REQUIRED")) {
    return NextResponse.json(
      { error: message, code: "COMMENT_REQUIRED" },
      { status: 422 },
    );
  }

  if (message.includes("not found") || message.includes("NOT_FOUND")) {
    return NextResponse.json(
      { error: message, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { error: message, code: "APPROVAL_OPERATION_FAILED" },
    { status: 400 },
  );
}


