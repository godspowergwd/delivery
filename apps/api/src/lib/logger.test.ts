import { describe, expect, it } from 'vitest';
import { redactLogText } from './logger';

describe('log secret redaction', () => {
  it('redacts connection credentials, query tokens, bearer tokens, and JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature123';
    const message = [
      'postgresql://user:password@db.example.com/app',
      'https://api.example.test/path?access_token=provider-secret&limit=1',
      'Authorization: Bearer bearer-secret',
      jwt,
    ].join(' ');
    const redacted = redactLogText(message);
    expect(redacted).not.toContain('password@');
    expect(redacted).not.toContain('provider-secret');
    expect(redacted).not.toContain('bearer-secret');
    expect(redacted).not.toContain(jwt);
    expect(redacted).toContain('limit=1');
  });
});