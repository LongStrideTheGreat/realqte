'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { User } from 'firebase/auth';

type AppHeaderProps = {
  user: User | null;
  setupComplete: boolean;
  onLogout?: () => void;
  onOpenLogin?: () => void;
  onOpenSignup?: () => void;
};

type NavItem = {
  label: string;
  href: string;
};

type GroupKey = 'create' | 'manage' | 'docs' | 'stats';

const guestLinks: NavItem[] = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Help', href: '/help' },
];

const desktopGroups: Record<GroupKey, { label: string; items: NavItem[] }> = {
  create: {
    label: 'Create',
    items: [
      { label: 'New Invoice', href: '/new-invoice' },
      { label: 'New Quote', href: '/new-quote' },
    ],
  },
  manage: {
    label: 'Manage',
    items: [
      { label: 'Products', href: '/products' },
      { label: 'Customers', href: '/customers' },
    ],
  },
  docs: {
    label: 'My Docs',
    items: [
      { label: 'Quotes', href: '/quotes' },
      { label: 'Invoices', href: '/invoices' },
    ],
  },
  stats: {
    label: 'Stats',
    items: [
      { label: 'Accounting', href: '/accounting' },
      { label: 'Reports', href: '/reporting' },
    ],
  },
};

function resolveHref(href: string, setupComplete: boolean) {
  if (!setupComplete && href !== '/' && href !== '/profile' && href !== '/help') {
    return '/profile';
  }
  return href;
}

function linkIsActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href;
}

function getStandaloneActive(pathname: string, href: string, setupComplete: boolean) {
  return linkIsActive(pathname, resolveHref(href, setupComplete));
}

function NavIcon({ label }: { label: string }) {
  const common = 'h-[16px] w-[16px]';

  switch (label) {
    case 'Dashboard':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case 'Create':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'Manage':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16" />
          <path d="M4 12h10" />
          <path d="M4 17h16" />
        </svg>
      );
    case 'My Docs':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7z" />
          <path d="M14 3v4h4" />
        </svg>
      );
    case 'CRM':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
          <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'Mini Site':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
        </svg>
      );
    case 'Stats':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19h16" />
          <path d="M7 15V9" />
          <path d="M12 15V5" />
          <path d="M17 15v-3" />
        </svg>
      );
    case 'Profile':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="8" r="4" />
        </svg>
      );
    case 'Help':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'Logout':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AppHeader({
  user,
  setupComplete,
  onLogout,
  onOpenLogin,
  onOpenSignup,
}: AppHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDesktopGroup, setOpenDesktopGroup] = useState<GroupKey | null>(null);
  const [openMobileGroups, setOpenMobileGroups] = useState<Record<GroupKey, boolean>>({
    create: false,
    manage: false,
    docs: false,
    stats: false,
  });

  const desktopMenuRef = useRef<HTMLDivElement | null>(null);

  const dashboardHref = user ? '/' : '/';

  const userNavOrder = useMemo(
    () => [
      { type: 'link' as const, label: 'Dashboard', href: '/' },
      { type: 'group' as const, key: 'create' as GroupKey },
      { type: 'group' as const, key: 'manage' as GroupKey },
      { type: 'group' as const, key: 'docs' as GroupKey },
      { type: 'link' as const, label: 'CRM', href: '/crm' },
      { type: 'link' as const, label: 'Mini Site', href: '/website' },
      { type: 'group' as const, key: 'stats' as GroupKey },
      { type: 'link' as const, label: 'Profile', href: '/profile' },
      { type: 'link' as const, label: 'Help', href: '/help' },
    ],
    []
  );

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenDesktopGroup(null);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!desktopMenuRef.current) return;
      if (!desktopMenuRef.current.contains(event.target as Node)) {
        setOpenDesktopGroup(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeAllMenus = () => {
    setMobileMenuOpen(false);
    setOpenDesktopGroup(null);
  };

  const toggleMobileGroup = (key: GroupKey) => {
    setOpenMobileGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getDesktopLinkClasses = (active: boolean) =>
    `group relative inline-flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200 ${
      active
        ? 'bg-emerald-500/12 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]'
        : 'text-zinc-300 hover:text-white hover:bg-zinc-800/90'
    }`;

  const getMobileLinkClasses = (active: boolean) =>
    `flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${
      active
        ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/20'
        : 'text-zinc-300 hover:text-white hover:bg-zinc-800 border border-transparent'
    }`;

  const renderStandaloneDesktopLink = (label: string, href: string) => {
    const active = getStandaloneActive(pathname, href, setupComplete);
    const resolvedHref = resolveHref(href, setupComplete);

    return (
      <Link key={href} href={resolvedHref} className={getDesktopLinkClasses(active)}>
        <NavIcon label={label} />
        <span>{label}</span>
        <span
          className={`absolute inset-x-3 -bottom-[2px] h-[2px] rounded-full transition-opacity duration-200 ${
            active ? 'bg-emerald-400 opacity-100' : 'bg-white/0 opacity-0 group-hover:opacity-60 group-hover:bg-zinc-500'
          }`}
        />
      </Link>
    );
  };

  const renderStandaloneMobileLink = (label: string, href: string) => {
    const active = getStandaloneActive(pathname, href, setupComplete);
    const resolvedHref = resolveHref(href, setupComplete);

    return (
      <Link
        key={href}
        href={resolvedHref}
        onClick={closeAllMenus}
        className={getMobileLinkClasses(active)}
      >
        <NavIcon label={label} />
        <span>{label}</span>
      </Link>
    );
  };

  const renderDesktopGroup = (key: GroupKey) => {
    const group = desktopGroups[key];
    const isOpen = openDesktopGroup === key;
    const hasActiveChild = group.items.some((item) =>
      linkIsActive(pathname, resolveHref(item.href, setupComplete))
    );

    return (
      <div key={key} className="relative">
        <button
          type="button"
          onClick={() => setOpenDesktopGroup((prev) => (prev === key ? null : key))}
          className={`group relative inline-flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200 ${
            hasActiveChild || isOpen
              ? 'bg-emerald-500/12 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]'
              : 'text-zinc-300 hover:text-white hover:bg-zinc-800/90'
          }`}
        >
          <NavIcon label={group.label} />
          <span>{group.label}</span>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 7.5l5 5 5-5" />
          </svg>
          <span
            className={`absolute inset-x-3 -bottom-[2px] h-[2px] rounded-full transition-opacity duration-200 ${
              hasActiveChild || isOpen
                ? 'bg-emerald-400 opacity-100'
                : 'bg-white/0 opacity-0 group-hover:opacity-60 group-hover:bg-zinc-500'
            }`}
          />
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-3 w-64 rounded-2xl border border-zinc-800 bg-zinc-900/98 shadow-2xl overflow-hidden backdrop-blur">
            <div className="border-b border-zinc-800 px-4 py-3 bg-zinc-950/70">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{group.label}</p>
            </div>
            <div className="p-2">
              {group.items.map((item) => {
                const href = resolveHref(item.href, setupComplete);
                const active = linkIsActive(pathname, href);

                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={closeAllMenus}
                    className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm transition ${
                      active
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 5l6 5-6 5" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMobileGroup = (key: GroupKey) => {
    const group = desktopGroups[key];
    const isOpen = openMobileGroups[key];
    const hasActiveChild = group.items.some((item) =>
      linkIsActive(pathname, resolveHref(item.href, setupComplete))
    );

    return (
      <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleMobileGroup(key)}
          className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
            hasActiveChild || isOpen ? 'text-emerald-300 bg-emerald-500/8' : 'text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <span className="inline-flex items-center gap-3">
            <NavIcon label={group.label} />
            <span>{group.label}</span>
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 7.5l5 5 5-5" />
          </svg>
        </button>

        {isOpen && (
          <div className="border-t border-zinc-800 px-2 py-2 bg-zinc-950/70">
            {group.items.map((item) => {
              const href = resolveHref(item.href, setupComplete);
              const active = linkIsActive(pathname, href);

              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={closeAllMenus}
                  className={`block rounded-xl px-3 py-2.5 transition ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/90 bg-zinc-900/85 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-900/78 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <Link href={dashboardHref} className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <h1 className="text-2xl sm:text-[28px] font-bold text-emerald-400 whitespace-nowrap hover:opacity-90 transition-opacity">
                RealQTE
              </h1>
              <div className="absolute -bottom-1 left-0 h-[2px] w-full rounded-full bg-gradient-to-r from-emerald-400/90 via-emerald-300/70 to-transparent" />
            </div>
            <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
              .com
            </span>
          </Link>

          <div ref={desktopMenuRef} className="hidden xl:flex items-center gap-2 text-sm">
            {user ? (
              <>
                {userNavOrder.map((item) => {
                  if (item.type === 'group') {
                    return renderDesktopGroup(item.key);
                  }

                  return renderStandaloneDesktopLink(item.label, item.href);
                })}

                <div className="ml-2 h-8 w-px bg-zinc-800" />

                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-red-400 transition-all duration-200 hover:text-red-300 hover:bg-red-500/10"
                >
                  <NavIcon label="Logout" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                {guestLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl px-3 py-2 text-zinc-400 transition hover:text-white hover:bg-zinc-800/90"
                  >
                    {item.label}
                  </Link>
                ))}
                <button
                  onClick={onOpenLogin}
                  className="rounded-xl px-3 py-2 text-zinc-300 transition hover:text-white hover:bg-zinc-800/90"
                >
                  Log in
                </button>
                <button
                  onClick={onOpenSignup}
                  className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100 transition shadow-sm"
                >
                  Sign up free
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="xl:hidden mt-4 border-t border-zinc-800 pt-4">
            {user ? (
              <div className="grid grid-cols-1 gap-3 text-sm">
                {userNavOrder.map((item) => {
                  if (item.type === 'group') {
                    return renderMobileGroup(item.key);
                  }

                  return renderStandaloneMobileLink(item.label, item.href);
                })}

                <button
                  onClick={onLogout}
                  className="flex items-center gap-3 text-left rounded-2xl px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                >
                  <NavIcon label="Logout" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 text-sm">
                {guestLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-zinc-300 hover:text-white rounded-xl px-2 py-1"
                    onClick={closeAllMenus}
                  >
                    {item.label}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    closeAllMenus();
                    onOpenLogin?.();
                  }}
                  className="text-left text-zinc-300 hover:text-white rounded-xl px-2 py-1"
                >
                  Log in
                </button>
                <button
                  onClick={() => {
                    closeAllMenus();
                    onOpenSignup?.();
                  }}
                  className="bg-white text-black px-4 py-2.5 rounded-xl font-medium hover:bg-zinc-100 text-left"
                >
                  Sign up free
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
