import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storeCanvaTokens } from '../services/canva-service';

const router = Router();

const AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const SCOPES = 'asset:read brandtemplate:content:read brandtemplate:meta:read design:content:read design:content:write profile:read';

// In-memory PKCE store (single-instance app; entries expire after 10 minutes)
const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

function cleanupPkceStore() {
  const now = Date.now();
  for (const [state, entry] of pkceStore) {
    if (now - entry.createdAt > 10 * 60 * 1000) pkceStore.delete(state);
  }
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getRedirectUri(req: Request): string {
  const host = req.get('host');
  return `https://${host}/api/canva/callback`;
}

// GET /api/canva/connect?setup=<CANVA_SETUP_KEY> — start the one-time authorisation
router.get('/connect', (req: Request, res: Response) => {
  const setupKey = process.env.CANVA_SETUP_KEY;
  if (!setupKey || req.query.setup !== setupKey) {
    return res.status(403).send('Missing or incorrect setup key.');
  }

  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('CANVA_CLIENT_ID is not configured in the App Service settings.');
  }

  cleanupPkceStore();
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64Url(crypto.randomBytes(24));
  pkceStore.set(state, { verifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

// GET /api/canva/callback — Canva redirects here after the user approves
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.status(400).send(`Canva authorisation was declined: ${error}`);
    }

    const entry = state ? pkceStore.get(state) : undefined;
    if (!code || !entry) {
      return res.status(400).send('Invalid or expired authorisation attempt. Start again from /api/canva/connect.');
    }
    pkceStore.delete(state);

    const clientId = process.env.CANVA_CLIENT_ID || '';
    const clientSecret = process.env.CANVA_CLIENT_SECRET || '';

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: entry.verifier,
      redirect_uri: getRedirectUri(req),
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`Canva token exchange error ${response.status}:`, errBody);
      return res.status(500).send(`Could not complete Canva connection (${response.status}). Check the client ID/secret settings.`);
    }

    const data = await response.json();
    await storeCanvaTokens(data.access_token, data.refresh_token, data.expires_in);

    return res.send(
      '<html><body style="font-family: sans-serif; text-align: center; padding-top: 4rem;">' +
      '<h1>&#9989; Canva connected</h1>' +
      '<p>The Omnii Command Centre can now generate images from your Canva brand templates.</p>' +
      '<p>You can close this window.</p>' +
      '</body></html>'
    );
  } catch (err: any) {
    console.error('Canva callback error:', err.message);
    return res.status(500).send('Something went wrong storing the Canva connection. Check the server logs.');
  }
});

export default router;
