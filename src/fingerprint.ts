import { createHash } from 'node:crypto';

export function normalizeContent(content: string): string {
  return content
    .replace(/<!--.*?-->/gs, '')
    .replace(/\[see also:[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fingerprint(content: string): string {
  const normalized = normalizeContent(content);
  return createHash('sha256').update(normalized).digest('hex');
}
