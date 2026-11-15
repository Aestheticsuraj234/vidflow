'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect} from 'react';

import {Logo} from '@/components/logo';
import {Button} from '@/components/ui/button';
import {authClient} from '@/lib/auth-client';
import {cn} from '@/lib/cn';

const NAV = [
  {href: '/dashboard', label: 'Dashboard'},
  {href: '/upload', label: 'Upload'},
  {href: '/webhooks', label: 'Webhooks'},
];

/** Top bar for signed-in pages. Sends you to sign-in if the session is gone. */
export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const {data, isPending} = authClient.useSession();

  useEffect(() => {
    if (!isPending && !data) router.replace('/sign-in');
  }, [isPending, data, router]);

  async function signOut() {
    await authClient.signOut();
    router.replace('/sign-in');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-8">
        <Logo />
        <nav className="flex gap-1">
          {NAV.map(({href, label}) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'rounded-sm px-3 py-1.5 text-sm text-muted hover:text-fg',
                pathname.startsWith(href) && 'bg-surface-2 text-fg',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {data && <span className="text-sm text-muted">{data.user.email}</span>}
        <Button variant="secondary" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
