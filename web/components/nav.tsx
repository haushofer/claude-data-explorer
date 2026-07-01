"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NameWidget from "./namewidget";
import { SITE } from "@/lib/site.config";

const LINKS = [
  ["/", "Explore"],
  ["/workspace", "Analyze"],
  ["/gallery", "Gallery"],
];

export default function Nav() {
  const p = usePathname();
  if (p === "/login") return null; // the password gate stands alone
  return (
    <nav className="nav">
      <span className="brand">{SITE.brand}</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={`navlink ${p === href ? "active" : ""}`}>
          {label}
        </Link>
      ))}
      <span className="spacer" />
      <NameWidget />
    </nav>
  );
}
