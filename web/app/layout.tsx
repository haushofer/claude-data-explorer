import "./globals.css";
import type { Metadata } from "next";
import Nav from "@/components/nav";
import { SITE } from "@/lib/site.config";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
