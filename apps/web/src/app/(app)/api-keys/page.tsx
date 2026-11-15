'use client';

import type {ApiKeySummary, CreatedApiKey} from '@vidflow/shared';
import {Check, Copy, KeyRound, Trash2} from 'lucide-react';
import {useCallback, useEffect, useState, type FormEvent} from 'react';

import {AppHeader} from '@/components/app/app-header';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {api, API_URL} from '@/lib/api';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setKeys((await api<{apiKeys: ApiKeySummary[]}>('/v1/api-keys')).apiKeys);
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const key = await api<CreatedApiKey>('/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify({name}),
    });
    setCreated(key);
    setCopied(false);
    setName('');
    await load();
  }

  async function revoke(id: string) {
    await api(`/v1/api-keys/${id}`, {method: 'DELETE'});
    await load();
  }

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">API keys</h1>
          <p className="mt-1 text-muted">Upload and read videos from your own servers.</p>
        </div>

        <Card>
          <form onSubmit={create} className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                required
                placeholder="Production server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit">Create key</Button>
          </form>
        </Card>

        {created && (
          <Card className="flex flex-col gap-3 border-accent/50">
            <p className="text-sm">Copy this key now; it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm bg-bg px-3 py-2 font-mono text-xs">
                {created.key}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(created.key);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-sm bg-bg p-3 font-mono text-xs text-muted">
              {`curl ${API_URL}/v1/videos \\\n  -H "Authorization: Bearer ${created.prefix}…"`}
            </pre>
          </Card>
        )}

        {keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-12 text-center">
            <KeyRound className="size-6 text-muted" aria-hidden />
            <p className="text-sm text-muted">No keys yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="font-mono text-xs text-muted">
                    {k.prefix}… · created {new Date(k.createdAt).toLocaleDateString()} ·{' '}
                    {k.lastUsedAt
                      ? `used ${new Date(k.lastUsedAt).toLocaleString()}`
                      : 'never used'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke ${k.name}`}
                  onClick={() => void revoke(k.id)}
                >
                  <Trash2 className="size-4" /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
