'use client';

import Link from 'next/link';

type FooterLink = {
  readonly label: string;
  readonly href: string;
};

type FooterSection = {
  readonly title: string;
  readonly links: FooterLink[];
};

const footerSections: FooterSection[] = [
  {
    title: 'Docs',
    links: [
      { label: 'Agent Guide', href: '/agents?path=agent' },
      { label: 'Developer Guide', href: '/agents?path=human' },
      { label: 'Skill Install Flow', href: '/agents?path=agent' },
      { label: 'Contracts Repo', href: 'https://github.com/hashgraph-online/programmable-secrets-contracts' },
      { label: 'Skill Repo', href: 'https://github.com/hashgraph-online/programmable-secrets-skill' },
      { label: 'Frontend Repo', href: 'https://github.com/hashgraph-online/programmable-secrets-fe' },
    ],
  },
  {
    title: 'Networks',
    links: [
      { label: 'Arbitrum Sepolia', href: 'https://sepolia.arbiscan.io' },
      { label: 'Robinhood Testnet', href: 'https://explorer.testnet.chain.robinhood.com' },
      { label: 'ERC-8004 Contracts', href: 'https://github.com/erc-8004/erc-8004-contracts' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Telegram', href: 'https://t.me/hashinals' },
      { label: 'X', href: 'https://x.com/HashgraphOnline' },
    ],
  },
  {
    title: 'More',
    links: [
      { label: 'GitHub', href: 'https://github.com/hashgraph-online' },
      { label: 'Contracts Repo', href: 'https://github.com/hashgraph-online/programmable-secrets-contracts' },
      { label: 'Programmable Secrets Skill', href: 'https://github.com/hashgraph-online/programmable-secrets-skill' },
    ],
  },
  {
    title: 'Programmable Secrets',
    links: [
      { label: 'Marketplace', href: '/' },
      { label: 'Publish Dataset', href: '/provider' },
      { label: 'Agent Onboarding', href: '/agents?path=agent' },
    ],
  },
];

function FooterLinkList({ title, links }: FooterSection) {
  return (
    <div>
      <h3
        className="text-lg font-semibold mb-3"
        style={{ color: '#ffffff' }}
      >
        {title}
      </h3>
      <ul className="space-y-1.5">
        {links.map((link) => {
          const isExternal = link.href.startsWith('http');
          return (
            <li key={`${title}-${link.href}`}>
              {isExternal ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#a5b4fc' }}
                  className="hover:!text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  href={link.href}
                  prefetch={false}
                  style={{ color: '#a5b4fc' }}
                  className="hover:!text-white transition-colors no-underline"
                >
                  {link.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer
      className="py-8"
      style={{
        background: 'linear-gradient(to right, #3f4174, #4a5a9e)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {footerSections.map((section) => (
            <FooterLinkList key={section.title} {...section} />
          ))}
        </div>

        <div
          className="mt-6 pt-6 text-center"
          style={{ borderTop: '1px solid rgba(165, 180, 252, 0.2)' }}
        >
          <p className="text-sm" style={{ color: '#93c5fd' }}>
            Copyright © {new Date().getFullYear()} Programmable Secrets.
          </p>
        </div>
      </div>
    </footer>
  );
}
