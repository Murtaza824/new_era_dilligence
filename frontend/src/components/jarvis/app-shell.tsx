"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Briefcase, LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Portfolio", href: "/portfolio", icon: Briefcase },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Top navigation bar - fixed so it never scrolls away */}
      <header className="bg-background/95 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between pl-3 pr-6">
          {/* Logo + branding */}
          <Link
            href={user ? "/companies" : "/"}
            className="flex items-baseline gap-2 font-display tracking-tight"
          >
            <span className="text-muted-foreground text-sm font-medium">
              New Era Ventures
            </span>
            <span className="text-foreground/80 text-sm">·</span>
            <span className="text-lg font-bold">Jarvis</span>
          </Link>

          {/* Nav links (only when logged in) */}
          <nav className="flex items-center gap-1">
            {user &&
              NAV_ITEMS.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {!loading && !user && pathname !== "/login" && (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
            )}
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground gap-1.5"
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Page content - pt-14 so content is not hidden under fixed header */}
      <main className="pt-14">{children}</main>
    </div>
  );
}
