'use client';

import {
  WEBHOOK_EVENT_NAMES,
  type CreatedWebhook,
  type WebhookDeliverySummary,
  type WebhookSummary,
} from '@vidflow/shared';
import {Check, ChevronDown, Copy, Send, Trash2, Webhook} from 'lucide-react';
import {useCallback, useEffect, useState, type FormEvent} from 'react';

import {AppHeader} from '@/components/app/app-header';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {api, ApiError} from '@/lib/api';
import {cn} from '@/lib/cn';

const DELIVERY_STYLE: Record<WebhookDeliverySummary['status'], string> = {
  delivered: 'text-accent',
  pending: 'text-warning',
  failed: 'text-danger',
};

function Deliveries({webhookId, refreshKey}: {webhookId: string; refreshKey: number}) {
  const [rows, setRows] = useState<WebhookDeliverySummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const {deliveries} = await api<{deliveries: WebhookDeliverySummary[]}>(
        `/v1/webhooks/${webhookId}/deliveries`,
      );
      if (alive) setRows(deliveries);
    };
    void load();
    // Deliveries retry in the background; refresh while the panel is open.
    const timer = setInterval(() => void load(), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [webhookId, refreshKey]);

  if (!rows) return <p className="px-4 py-3 text-sm text-muted">Loading…</p>;
  if (rows.length === 0) return <p className="px-4 py-3 text-sm text-muted">No deliveries yet.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="font-mono text-xs text-muted">
        <tr>
          <th className="px-4 py-2 font-normal">event</th>
          <th className="px-4 py-2 font-normal">status</th>
          <th className="px-4 py-2 font-normal">attempts</th>
          <th className="px-4 py-2 font-normal">response</th>
          <th className="px-4 py-2 font-normal">when</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2 font-mono text-xs">{d.event}</td>
            <td className={cn('px-4 py-2 font-mono text-xs', DELIVERY_STYLE[d.status])}>
              {d.status}
            </td>
            <td className="px-4 py-2 font-mono text-xs">{d.attempts}</td>
            <td
              className="max-w-56 truncate px-4 py-2 text-xs text-muted"
              title={d.lastError ?? ''}
            >
              {d.lastStatusCode ?? '—'}
              {d.lastError ? ` · ${d.lastError}` : ''}
            </td>
            <td className="px-4 py-2 text-xs text-muted">
              {new Date(d.createdAt).toLocaleTimeString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<WebhookSummary[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['video.ready', 'video.failed']);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWebhook | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    const {webhooks} = await api<{webhooks: WebhookSummary[]}>('/v1/webhooks');
    setHooks(webhooks);
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const hook = await api<CreatedWebhook>('/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify({url, events}),
      });
      setCreated(hook);
      setUrl('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the webhook');
    }
  }

  async function toggle(hook: WebhookSummary) {
    await api(`/v1/webhooks/${hook.id}`, {
      method: 'PATCH',
      body: JSON.stringify({active: !hook.active}),
    });
    await load();
  }

  async function remove(hook: WebhookSummary) {
    await api(`/v1/webhooks/${hook.id}`, {method: 'DELETE'});
    await load();
  }

  async function test(hook: WebhookSummary) {
    await api(`/v1/webhooks/${hook.id}/test`, {method: 'POST'});
    setOpen(hook.id);
    setRefresh((n) => n + 1);
  }

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Webhooks</h1>
          <p className="mt-1 text-muted">
            Get a signed POST when a video is uploaded, starts processing, is ready or fails.
          </p>
        </div>

        <Card>
          <form onSubmit={create} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="url">Endpoint URL</Label>
              <Input
                id="url"
                type="url"
                required
                placeholder="https://example.com/webhooks/vidflow"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm font-medium">Events</legend>
              {WEBHOOK_EVENT_NAMES.map((name) => {
                const on = events.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setEvents((list) => (on ? list.filter((x) => x !== name) : [...list, name]))
                    }
                    className={cn(
                      'rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors',
                      on ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted',
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </fieldset>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div>
              <Button type="submit" disabled={events.length === 0}>
                Add endpoint
              </Button>
            </div>
          </form>
        </Card>

        {created && (
          <Card className="flex flex-col gap-3 border-accent/50">
            <p className="text-sm">
              Signing secret for <span className="font-mono">{created.url}</span>. Copy it now; it
              won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm bg-bg px-3 py-2 font-mono text-xs">
                {created.secret}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(created.secret);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-muted">
              Verify each request: HMAC-SHA256 of <code>{'`${t}.${body}`'}</code> must equal{' '}
              <code>v1</code> in the <code>Vidflow-Signature</code> header.
            </p>
          </Card>
        )}

        {hooks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-12 text-center">
            <Webhook className="size-6 text-muted" aria-hidden />
            <p className="text-sm text-muted">No endpoints yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {hooks.map((hook) => (
              <li
                key={hook.id}
                className="overflow-hidden rounded-md border border-border bg-surface"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn('size-2 rounded-full', hook.active ? 'bg-accent' : 'bg-muted')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{hook.url}</p>
                    <p className="font-mono text-xs text-muted">
                      {hook.events.join(' · ')} · {hook.secretHint}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void test(hook)}>
                    <Send className="size-4" /> Test
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void toggle(hook)}>
                    {hook.active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete"
                    onClick={() => void remove(hook)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Deliveries"
                    onClick={() => setOpen(open === hook.id ? null : hook.id)}
                  >
                    <ChevronDown
                      className={cn(
                        'size-4 transition-transform',
                        open === hook.id && 'rotate-180',
                      )}
                    />
                  </Button>
                </div>
                {open === hook.id && (
                  <div className="border-t border-border">
                    <Deliveries webhookId={hook.id} refreshKey={refresh} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
