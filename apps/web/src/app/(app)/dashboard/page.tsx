'use client';

import {Film, KeyRound, Upload, Webhook} from 'lucide-react';
import Link from 'next/link';

import {AppHeader} from '@/components/app/app-header';
import {Card} from '@/components/ui/card';
import {authClient} from '@/lib/auth-client';

const FEATURES = [
  {icon: Upload, title: 'Upload', text: 'Resumable uploads straight to storage.', href: '/upload'},
  {icon: Film, title: 'Library', text: 'Your videos with an adaptive player.', chapter: 11},
  {icon: Webhook, title: 'Webhooks', text: 'Get told when a video is ready.', chapter: 10},
  {icon: KeyRound, title: 'API keys', text: 'Upload from your own app.', chapter: 11},
];

export default function DashboardPage() {
  const {data, isPending} = authClient.useSession();

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">
            {isPending ? 'Loading…' : `Welcome, ${data?.user.name ?? ''}`}
          </h1>
          <p className="mt-1 text-muted">Your video pipeline is set up.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({icon: Icon, title, text, href, chapter}) => {
            const body = (
              <Card className="flex h-full flex-col gap-2 transition-colors hover:border-accent/50">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="font-medium">{title}</h2>
                <p className="text-sm text-muted">{text}</p>
                <span className="mt-auto font-mono text-xs text-muted">
                  {href ? 'open →' : `chapter ${chapter}`}
                </span>
              </Card>
            );
            return href ? (
              <Link key={title} href={href}>
                {body}
              </Link>
            ) : (
              <div key={title}>{body}</div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
