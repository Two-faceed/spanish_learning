import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileShell } from "@/components/MobileShell";

export const metadata: Metadata = {
  title: "Español Fast — Madrid Spanish (es-ES) to B1 in 12 Weeks",
  description:
    "Personal Spain Spanish (es-ES) FSRS vocabulary, daily AI tutor, pronunciation coach, and graded reader.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Español Fast",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0D0E11",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0D0E11] text-white selection:bg-[#FF4F17] selection:text-black">
        <MobileShell>{children}</MobileShell>
      </body>
    </html>
  );
}
