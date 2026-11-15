'use client';

import {Film, KeyRound, Upload, Webhook} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useEffect} from 'react';

import {Logo} from '@/components/logo';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {authClient} from '@/lib/auth-client';

const UPCOMING = [
  {icon: Upload, title: 'Upload', text: 'Resumable uploads straight to storage.', chapter: 4},
  {icon: Film, title: 'Library', text: 'Your videos with an adaptive player.', chapter: 11},
  {icon: Webhook, title: 'Webhooks', text: 'Get told when a video is ready.', chapter: 10},
  {icon: KeyRound, title: 'API keys', text: 'Upload from your own app.', chapter: 11},
];

export default function DashboardPage() {
  const router = useRouter();
  const {data, isPending} = authClient.useSession();

  useEffect(() => {
    // The cookie existed but the session is gone (expired or revoked).
    if (!isPending && !data) router.replace('/sign-in');
  }, [isPending, data, router]);

  async function signOut() {
    await authClient.signOut();
    router.replace('/sign-in');
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <Logo />
        <div className="flex items-center gap-3">
          {data && <span className="text-sm text-muted">{data.user.email}</span>}
          <Button variant="secondary" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">
            {isPending ? 'Loading…' : `Welcome, ${data?.user.name ?? ''}`}
          </h1>
          <p className="mt-1 text-muted">Your video pipeline is set up.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {UPCOMING.map(({icon: Icon, title, text, chapter}) => (
            <Card key={title} className="flex flex-col gap-2">
              <Icon className="size-5 text-accent" aria-hidden />
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted">{text}</p>
              <span className="mt-auto font-mono text-xs text-muted">chapter {chapter}</span>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
