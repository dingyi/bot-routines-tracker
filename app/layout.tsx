import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "例行任务",
  description: "查看机器人的定时运行与外部触发。A static dashboard template for bot routines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${outfit.variable} ${plex.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-ink">
        <div className="root isolate">{children}</div>
      </body>
    </html>
  );
}
