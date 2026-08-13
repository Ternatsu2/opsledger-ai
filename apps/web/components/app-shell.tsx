"use client";

import {
  ClipboardText,
  FilePlus,
  Folders,
  ShieldCheck,
  SquaresFour,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { SystemStatus } from "@/lib/types";

const navigation = [
  { href: "/", label: "Overview", icon: SquaresFour, exact: true },
  { href: "/cases", label: "Cases", icon: Folders },
  { href: "/cases/new", label: "New intake", icon: FilePlus, exact: true },
  { href: "/trust", label: "Audit & trust", icon: ShieldCheck },
];

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="OpsLedger AI home">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        <strong>OpsLedger</strong>
        <small>AI</small>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [publicWritesLocked, setPublicWritesLocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    void apiFetch<SystemStatus>("/system")
      .then((status) => {
        if (mounted) setPublicWritesLocked(status.public_writes_locked);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="app-frame">
      <aside className="side-rail">
        <div>
          <Brand />
          <div className="rail-context">
            <span>Workspace</span>
            <strong>Caribbean MSME review</strong>
          </div>
          <nav className="rail-nav" aria-label="Primary navigation">
            {navigation.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "active" : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} weight={active ? "fill" : "regular"} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="rail-foot">
          <div className="rail-trust">
            <ShieldCheck size={18} weight="duotone" />
            <div>
              <strong>{publicWritesLocked ? "Read-only showcase" : "Human controlled"}</strong>
              <span>{publicWritesLocked ? "Reviewer writes require authorization" : "Synthetic data environment"}</span>
            </div>
          </div>
          <div className="operator">
            <span className="operator-avatar">TB</span>
            <div>
              <strong>Terry Benjamin Jr.</strong>
              <span>Demo reviewer</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="mobile-head">
        <Brand />
        <div className="mobile-mode"><i /> {publicWritesLocked ? "Read-only" : "Demo"}</div>
      </div>

      <main className="main-canvas">
        <div className="page-container">{children}</div>
        <footer className="app-footer">
          <ClipboardText size={15} />
          {publicWritesLocked ? "Public showcase · Read-only · " : ""}Synthetic evidence only · No credit decisions · Human approval required
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "active" : undefined}
              aria-label={item.label}
            >
              <Icon size={21} weight={active ? "fill" : "regular"} />
              <span>{item.label.replace("Audit & trust", "Trust")}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
