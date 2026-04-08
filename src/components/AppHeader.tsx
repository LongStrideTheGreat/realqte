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

  const standaloneItems = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'CRM', href: '/crm' },
      { label: 'Mini Site', href: '/website' },
      { label: 'Profile', href: '/profile' },
      { label: 'Help', href: '/help' },
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
          className={`inline-flex items-center gap-2 transition ${
            hasActiveChild ? 'text-emerald-400 font-medium' : 'text-zinc-300 hover:text-white'
          }`}
        >
          <span>{group.label}</span>
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
          <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="p-2">
              {group.items.map((item) => {
                const href = resolveHref(item.href, setupComplete);
                const active = linkIsActive(pathname, href);

                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={closeAllMenus}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
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

  return (
    <header className="bg-zinc-900/90 backdrop-blur border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <Link href={dashboardHref} className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-2xl sm:text-[28px] font-bold text-emerald-400 whitespace-nowrap hover:opacity-90">
              RealQTE
            </h1>
            <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">
              .com
            </span>
          </Link>

          <div ref={desktopMenuRef} className="hidden xl:flex items-center gap-6 text-sm">
            {user ? (
              <>
                {standaloneItems.map((item) => {
                  const href = resolveHref(item.href, setupComplete);
                  const active = linkIsActive(pathname, href);

                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={active ? 'text-emerald-400 font-medium' : 'text-zinc-300 hover:text-white'}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                {renderDesktopGroup('create')}
                {renderDesktopGroup('manage')}
                {renderDesktopGroup('docs')}
                {renderDesktopGroup('stats')}

                <button onClick={onLogout} className="text-red-400 hover:text-red-300">
                  Logout
                </button>
              </>
            ) : (
              <>
                {guestLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="text-zinc-400 hover:text-white">
                    {item.label}
                  </Link>
                ))}
                <button onClick={onOpenLogin} className="text-zinc-300 hover:text-white">
                  Log in
                </button>
                <button
                  onClick={onOpenSignup}
                  className="bg-white text-black px-6 py-2.5 rounded-xl font-medium hover:bg-zinc-100"
                >
                  Sign up free
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="xl:hidden inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
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
                {standaloneItems.map((item) => {
                  const href = resolveHref(item.href, setupComplete);
                  const active = linkIsActive(pathname, href);

                  return (
                    <Link
                      key={item.href}
                      href={href}
                      onClick={closeAllMenus}
                      className={active ? 'text-emerald-400 font-medium' : 'text-zinc-300 hover:text-white'}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                {(Object.keys(desktopGroups) as GroupKey[]).map((key) => {
                  const group = desktopGroups[key];
                  const isOpen = openMobileGroups[key];

                  return (
                    <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
                      <button
                        type="button"
                        onClick={() => toggleMobileGroup(key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left text-zinc-200"
                      >
                        <span>{group.label}</span>
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
                        <div className="border-t border-zinc-800 px-2 py-2">
                          {group.items.map((item) => (
                            <Link
                              key={item.href}
                              href={resolveHref(item.href, setupComplete)}
                              onClick={closeAllMenus}
                              className="block rounded-xl px-3 py-2.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button onClick={onLogout} className="text-left text-red-400 hover:text-red-300">
                  Logout
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 text-sm">
                {guestLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-zinc-300 hover:text-white"
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
                  className="text-left text-zinc-300 hover:text-white"
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
