import { notFound } from "next/navigation";
import { BuilderDemo } from "./demo";

export default function FormBuilderDevelopmentPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FORM_BUILDER_DEMO !== "true"
  )
    notFound();
  return <BuilderDemo />;
}
