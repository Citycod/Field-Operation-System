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
