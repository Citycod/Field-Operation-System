import { notFound } from "next/navigation";
import { RendererDemo } from "./demo";
import "@field/form-renderer/styles.css";

export default function RendererDemoPage() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.FORM_RENDERER_DEMO !== "true"
  )
    notFound();
  return <RendererDemo />;
}
