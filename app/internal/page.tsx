import RtgApp from "@/components/rtg-app";
export default function InternalPage() { return <RtgApp initialView="internal" readOnlyPreview={Boolean(process.env.VERCEL)} />; }
