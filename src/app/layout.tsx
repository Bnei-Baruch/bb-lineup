import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { AppNav } from "@/components/layout/AppNav";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "בונה תוכנית שבועית",
  description: "מערכת לבניית תוכנית שיעורים שבועית",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} font-sans antialiased bg-background text-foreground`}>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
