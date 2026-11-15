import Link from 'next/link';

/** Wordmark: a play triangle plus the name. */
export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold">
      <svg viewBox="0 0 16 16" className="size-4 fill-accent" aria-hidden>
        <path d="M3 2.5v11l10-5.5z" />
      </svg>
      <span>vidflow</span>
    </Link>
  );
}
