"use client";

import {
  ClockCounterClockwise,
  Eye,
  FilePlus,
  Folders,
  SquaresFour,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { SystemStatus } from "@/lib/types";

const navigation = [
  { href: "/", label: "Home", icon: SquaresFour, exact: true },
  { href: "/cases", label: "Applications", icon: Folders },
  { href: "/cases/new", label: "Add application", icon: FilePlus, exact: true },
  { href: "/trust", label: "Activity", icon: ClockCounterClockwise },
];

function isActivePath(pathname: string, item: (typeof navigation)[number]): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/cases" && pathname === "/cases/new") return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

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
            <strong>MSME applications</strong>
          </div>
          <nav className="rail-nav" aria-label="Primary navigation">
            {navigation.map((item) => {
              const active = isActivePath(pathname, item);
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
          {publicWritesLocked ? (
            <div className="rail-trust">
              <Eye size={18} weight="duotone" />
              <div><strong>Demo mode</strong><span>Changes are turned off</span></div>
            </div>
          ) : null}
          <div className="operator">
            <span className="operator-avatar">TB</span>
            <div>
              <strong>Terry Benjamin Jr.</strong>
              <span>Reviewer</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="mobile-head">
        <Brand />
        {publicWritesLocked ? <div className="mobile-mode"><i /> View only</div> : null}
      </div>

      <main className="main-canvas">
        <div className="page-container">{children}</div>
        <footer className="app-footer">
          Demo workspace · Sample applications
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "active" : undefined}
              aria-label={item.label}
            >
              <Icon size={21} weight={active ? "fill" : "regular"} />
              <span>{item.label.replace("Add application", "Add")}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
