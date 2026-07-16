import React from "react";
import { ChevronDown, X } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: NavItem[];        // If undefined, treated as single-tab (id = section.id)
}

interface Props {
  sections: NavSection[];
  activeId: string;
  onSelect: (id: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Optional footer rendered at bottom of sidebar (e.g., user menu). */
  footer?: React.ReactNode;
}

// Modern sidebar:
//   - Desktop: fixed 248px column with collapsible sections + active highlight
//   - Mobile: full-screen drawer that slides in from the left
export default function Sidebar({ sections, activeId, onSelect, mobileOpen, onMobileClose, footer }: Props) {
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of sections) init[s.id] = true;
    return init;
  });

  // Auto-expand the section that contains the active tab
  React.useEffect(() => {
    for (const s of sections) {
      if (s.items?.some((i) => i.id === activeId) && !openMap[s.id]) {
        setOpenMap((prev) => ({ ...prev, [s.id]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const toggle = (id: string) => setOpenMap((p) => ({ ...p, [id]: !p[id] }));

  const inner = (
    <nav className="h-full flex flex-col py-3 px-2">
      <div className="flex items-center gap-2 px-2 mb-4">
        <img src="/logo.svg" alt="Acme" className="h-7 w-auto drop-shadow-[0_0_8px_rgba(195,163,91,0.3)]" />
        <div>
          <div className="text-sm font-display font-black italic uppercase tracking-tighter leading-none">
            ACME<span className="text-studio-bronze">.</span>
          </div>
          <div className="text-[9px] font-mono text-studio-bronze uppercase tracking-widest leading-none mt-1">
            Intelligence Studio
          </div>
        </div>
        <button onClick={onMobileClose} className="ml-auto p-1.5 text-studio-text-muted hover:text-studio-text lg:hidden" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 px-1">
        {sections.map((s) => {
          const Icon = s.icon;
          const hasChildren = !!s.items?.length;
          const open = !!openMap[s.id];
          const isActiveSection = hasChildren
            ? s.items!.some((i) => i.id === activeId)
            : activeId === s.id;

          if (!hasChildren) {
            return (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); onMobileClose(); }}
                className="studio-nav-item"
                data-active={isActiveSection}
              >
                <Icon className="w-4 h-4 studio-nav-item-icon" />
                <span className="flex-1">{s.label}</span>
              </button>
            );
          }

          return (
            <div key={s.id}>
              <button
                onClick={() => toggle(s.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                  isActiveSection ? "text-studio-text" : "text-studio-text-muted hover:text-studio-text"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActiveSection ? "text-studio-bronze" : ""}`} />
                <span className="flex-1 text-xs font-mono uppercase tracking-wider text-left">{s.label}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
              </button>
              {open && (
                <div className="mt-0.5 ml-1 pl-3 border-l border-studio-border space-y-0.5">
                  {s.items!.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onSelect(item.id); onMobileClose(); }}
                        className="studio-nav-item"
                        data-active={activeId === item.id}
                      >
                        <ItemIcon className="w-3.5 h-3.5 studio-nav-item-icon" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge != null && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-studio-surface-2 text-studio-text-muted">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footer && <div className="mt-3 border-t border-studio-border pt-3 px-1">{footer}</div>}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[248px] bg-studio-surface-0 border-r border-studio-border shrink-0 sticky top-0 h-screen">
        {inner}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-studio-bg/70 backdrop-blur-sm transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={onMobileClose}
        />
        {/* Drawer */}
        <aside
          className={`absolute top-0 left-0 bottom-0 w-[280px] bg-studio-surface-0 border-r border-studio-border shadow-2xl transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {inner}
        </aside>
      </div>
    </>
  );
}
