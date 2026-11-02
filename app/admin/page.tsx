import RtgApp from "@/components/rtg-app";
export default function AdminPage() { return <RtgApp initialView="organisation" readOnlyPreview={Boolean(process.env.VERCEL)} />; }
