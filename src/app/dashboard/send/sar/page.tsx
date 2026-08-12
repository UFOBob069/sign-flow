import { redirect } from "next/navigation";

/** Legacy SAR route — one-time forms (SAR + Disbursement) live at /dashboard/send/onetime. */
export default function SendSarRedirectPage() {
  redirect("/dashboard/send/onetime");
}
