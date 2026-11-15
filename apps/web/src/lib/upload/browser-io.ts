import {api} from '../api';
import type {UploaderIO} from './uploader';

/** PUT with XHR: fetch can't report upload progress. */
function putPart(
  url: string,
  body: Blob,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('ETag');
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else
        reject(
          new Error(
            etag
              ? `Part upload failed (${xhr.status})`
              : 'Storage hid the ETag (check bucket CORS)',
          ),
        );
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new DOMException('Upload paused', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), {once: true});
    xhr.send(body);
  });
}

/** localStorage can be missing or throw (private mode, blocked storage); resuming is a bonus. */
const safeStore: UploaderIO['store'] = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export const browserIO: UploaderIO = {
  call: api,
  putPart,
  store: safeStore,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};
