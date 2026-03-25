"use client";

import { useState, useEffect, useRef } from "react";
import LanguageSwitcher from "./LanguageSwitcher";
import type { Locale } from "@/lib/locales";

interface NavLink {
  href: string;
  label: string;
}

export default function NavbarClient({
  links,
  locale,
}: {
  links: NavLink[];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <>
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-white focus:border focus:border-gray-400 focus:rounded"
      >
        Skip to main content
      </a>

      <nav
        aria-label="Main navigation"
        className="border-b border-gray-200 bg-white"
        ref={menuRef}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            {/* Logo / brand */}
            <a href="/" className="font-semibold text-gray-900 text-sm sm:text-base">
              Health Watchers
            </a>

            {/* Desktop links */}
            <ul className="hidden md:flex gap-6 list-none m-0 p-0">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-sm text-gray-700 hover:text-gray-900 focus:outline-none focus:underline"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <LanguageSwitcher current={locale} />
            </div>

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? (
                // X icon
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // Hamburger icon
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div id="mobile-menu" className="md:hidden border-t border-gray-100 bg-white px-4 pb-4">
            <ul className="mt-3 flex flex-col gap-3 list-none m-0 p-0">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="block text-sm text-gray-700 hover:text-gray-900 py-1 focus:outline-none focus:underline"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <LanguageSwitcher current={locale} />
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
