import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIKY TOKY | Viral video research studio",
  description: "Find rising videos, study their mechanics, improve your own clips and plan your next TikTok in Utah time.",
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
