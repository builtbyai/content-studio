import React, { useEffect, useRef, useState } from "react";
import { Menu, Search, LogOut, ChevronDown } from "lucide-react";
import NotificationsBell from "../NotificationsBell";
import SystemStatus from "../SystemStatus";
import JobsWidget from "../JobsWidget";

interface Props {
  userEmail: string;
  onMenuClick: () => void;       // toggles mobile sidebar
  onSearchClick: () => void;     // opens command palette
  onLogout: () => void;
  /** Optional breadcrumb / page title region. */
  title?: React.ReactNode;
}

export default function AppBar({ userEmail, onMenuClick, onSearchClick, onLogout, title }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <header className="h-14 bg-studio-bg/80 backdrop-blur-xl border-b border-studio-border sticky top-0 z-30 flex items-center px-3 sm:px-5 gap-3">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-1 rounded-md text-studio-text-muted hover:text-studio-text hover:bg-studio-surface-1"
        title="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title slot */}
      <div className="hidden sm:flex items-center min-w-0">
        {title}
      </div>

      {/* Global search trigger */}
      <button
        onClick={onSearchClick}
        className="flex-1 max-w-xl mx-auto flex items-center gap-2 px-3 h-9 rounded-lg bg-studio-surface-1 border border-studio-border hover:border-studio-border-strong text-studio-text-muted hover:text-studio-text transition-colors group"
        title="Search (⌘K)"
      >
        <Search className="w-4 h-4 text-studio-text-subtle group-hover:text-studio-bronze transition-colors" />
        <span className="text-xs text-studio-text-subtle flex-1 text-left">Search articles, assets, workflows…</span>
        <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-studio-surface-2 border border-studio-border text-studio-text-muted">⌘K</kbd>
      </button>

      {/* Right side: status + bell + user */}
      <div className="flex items-center gap-1.5 ml-auto">
        <div className="hidden md:flex items-center px-2.5 h-8 rounded-full bg-studio-surface-1 border border-studio-border">
          <SystemStatus compact />
        </div>

        <JobsWidget />
        <NotificationsBell />

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-2 rounded-lg hover:bg-studio-surface-1"
            title="Account"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-studio-bronze-light to-studio-bronze-dark flex items-center justify-center text-[10px] font-bold text-studio-bg">
              {userEmail.slice(0, 1).toUpperCase()}
            </div>
            <ChevronDown className="w-3 h-3 text-studio-text-muted" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 studio-glass-glow p-1.5 z-40 studio-fade-in">
              <div className="px-3 py-2 border-b border-studio-border mb-1">
                <div className="text-xs text-studio-text-muted">Signed in as</div>
                <div className="text-sm text-studio-text truncate">{userEmail}</div>
              </div>
              <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-studio-text-muted hover:text-studio-danger hover:bg-studio-surface-2 transition-colors">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
