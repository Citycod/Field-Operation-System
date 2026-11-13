import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Form Submission | Field Workforce & Operations",
  description: "Secure online form submission",
};

export default function PublicFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-slate-400">
        <p>Field Workforce & Operations Platform · Secure Online Forms</p>
      </footer>
    </div>
  );
}

