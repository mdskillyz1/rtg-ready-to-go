import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "RTG — Ready To Go", description: "Restaurant order evidence. A clear record from your kitchen to handover.", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101512" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-GB"><body>{children}</body></html>; }
