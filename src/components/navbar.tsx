'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePathname } from 'next/navigation';

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('ps-theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('ps-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ps-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ps-theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
      style={{ background: 'rgba(255, 255, 255, 0.10)' }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { label: 'Marketplace', href: '/' },
    { label: 'Publish', href: '/provider' },
    { label: 'Agents', href: '/agents' },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transform-gpu"
      style={{
        background: 'linear-gradient(135deg, rgba(85, 153, 254, 0.98) 0%, rgba(63, 65, 116, 0.98) 100%)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="mx-auto max-w-7xl px-6 max-md:px-4">
        <div className="flex items-center justify-between h-16 gap-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <Image
                src="/logo.png"
                alt="Hashgraph Online"
                width={30}
                height={30}
                className="h-[30px] w-[30px]"
                priority
              />
              <span
                className="text-sm font-semibold tracking-tight hidden min-[400px]:block"
                style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}
              >
                Programmable Secrets
              </span>
            </Link>

            <div className="flex items-center gap-1 max-md:hidden">
              {links.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-[13px] no-underline font-semibold px-3 py-1.5 rounded-lg transition-colors duration-150"
                    style={{
                      color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                      background: isActive ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <a
                href="https://github.com/hashgraph-online/programmable-secrets-contracts"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] no-underline font-semibold px-3 py-1.5 rounded-lg transition-colors duration-150"
                style={{ color: 'rgba(255, 255, 255, 0.7)' }}
              >
                Contracts ↗
              </a>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'full',
              }}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
