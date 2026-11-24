import { timingSafeEqual } from 'node:crypto';

export function httpGuard({ token, allowedHosts }) {
  if (!token || token.length < 32) throw new Error('HTTP requires MCP_AUTH_TOKEN with at least 32 characters');
  if (!allowedHosts?.length) throw new Error('HTTP requires an explicit host allowlist');
  const expected = Buffer.from(`Bearer ${token}`);
  return (req, res, next) => {
    if (!allowedHosts.includes(req.headers.host)) return res.status(403).json({ error: 'Host not allowed' });
    if (req.headers.origin) {
      try { if (!allowedHosts.includes(new URL(req.headers.origin).host)) return res.status(403).json({ error: 'Origin not allowed' }); }
      catch { return res.status(403).json({ error: 'Origin not allowed' }); }
    }
    const actual = Buffer.from(req.headers.authorization || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Bearer authentication required' });
    next();
  };
}
