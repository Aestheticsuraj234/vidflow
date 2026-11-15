'use client';

import type {LiveVideoMessage} from '@vidflow/shared';
import {useEffect, useRef, useState} from 'react';

import {API_URL} from './api';

/**
 * Subscribes to `GET /v1/live` and calls `onUpdate` for every change to the
 * user's videos. EventSource reconnects by itself after network drops.
 */
export function useLiveVideos(onUpdate: (m: LiveVideoMessage) => void): {connected: boolean} {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onUpdate);
  handler.current = onUpdate;

  useEffect(() => {
    const source = new EventSource(`${API_URL}/v1/live`, {withCredentials: true});
    source.addEventListener('ready', () => setConnected(true));
    source.addEventListener('video', (e) => {
      try {
        handler.current(JSON.parse((e as MessageEvent<string>).data) as LiveVideoMessage);
      } catch {
        // ignore malformed messages
      }
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  return {connected};
}
