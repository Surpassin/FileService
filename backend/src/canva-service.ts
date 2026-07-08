import sql from 'mssql';
import { getPool } from '../config/database';

const CANVA_API = 'https://api.canva.com/rest/v1';
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

function getCanvaConfig(): { clientId: string; clientSecret: string; templateId: string } {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const templateId = process.env.CANVA_TEMPLATE_ID;
  if (!clientId || !clientSecret || !templateId) {
    throw new Error(
      'Canva integration is not configured. Set CANVA_CLIENT_ID, CANVA_CLIENT_SECRET and CANVA_TEMPLATE_ID in the App Service settings.'
    );
  }
  return { clientId, clientSecret, templateId };
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getCanvaConfig();
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function storeCanvaTokens(accessToken: string, refreshToken: string, expiresInSeconds: number): Promise<void> {
  const pool = await getPool();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  await pool
    .request()
    .input('access_token', sql.NVarChar(sql.MAX), accessToken)
    .input('refresh_token', sql.NVarChar(sql.MAX), refreshToken)
    .input('expires_at', sql.DateTime2, expiresAt)
    .query(`
      MERGE integration_tokens AS target
      USING (SELECT 'canva' AS provider) AS source
      ON target.provider = source.provider
      WHEN MATCHED THEN
        UPDATE SET access_token = @access_token, refresh_token = @refresh_token, expires_at = @expires_at, updated_at = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (provider, access_token, refresh_token, expires_at)
        VALUES ('canva', @access_token, @refresh_token, @expires_at);
    `);
}

async function getCanvaAccessToken(): Promise<string> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT access_token, refresh_token, expires_at FROM integration_tokens WHERE provider = 'canva'`);

  if (result.recordset.length === 0) {
    throw new Error(
      'Canva is not connected yet. An admin needs to authorise it once by visiting /api/canva/connect.'
    );
  }

  const row = result.recordset[0];
  const expiresAt = new Date(row.expires_at);

  // Still valid for at least 5 minutes — use it
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return row.access_token;
  }

  // Refresh (Canva rotates refresh tokens — must persist the new one)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`Canva token refresh error ${response.status}:`, errBody);
    throw new Error(
      'Canva connection has expired and could not be refreshed. An admin needs to re-authorise via /api/canva/connect.'
    );
  }

  const data = await response.json();
  await storeCanvaTokens(data.access_token, data.refresh_token, data.expires_in);
  return data.access_token;
}

async function canvaFetch(path: string, options: { method?: string; body?: any } = {}): Promise<any> {
  const token = await getCanvaAccessToken();
  const response = await fetch(`${CANVA_API}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`Canva API ${response.status} [${path}]:`, errBody.slice(0, 500));
    throw new Error(`Canva API error (${response.status}): ${errBody.slice(0, 200)}`);
  }

  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateLinkedInImage(headline: string, subtext: string): Promise<string> {
  const { templateId } = getCanvaConfig();

  // Discover the template's autofill fields and map our text onto them
  const datasetResult = await canvaFetch(`/brand-templates/${templateId}/dataset`);
  const dataset = datasetResult.dataset || {};
  const textFields = Object.entries(dataset)
    .filter(([, def]: [string, any]) => def.type === 'text')
    .map(([name]) => name);

  if (textFields.length === 0) {
    throw new Error(
      'The Canva brand template has no text data fields. Open the template in Canva and add autofill data fields for the headline (and optionally subtext).'
    );
  }

  const data: Record<string, { type: string; text: string }> = {};
  data[textFields[0]] = { type: 'text', text: headline };
  if (textFields.length > 1 && subtext) {
    data[textFields[1]] = { type: 'text', text: subtext };
  }
  console.log('Canva autofill fields used:', textFields.join(', '));

  // Create the design from the template
  const autofillJob = await canvaFetch('/autofills', {
    method: 'POST',
    body: {
      brand_template_id: templateId,
      title: `LinkedIn post — ${headline.slice(0, 40)}`,
      data,
    },
  });

  let designId: string | null = null;
  let jobId = autofillJob.job?.id;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const status = await canvaFetch(`/autofills/${jobId}`);
    const job = status.job || {};
    if (job.status === 'success') {
      designId = job.result?.design?.id || null;
      break;
    }
    if (job.status === 'failed') {
      throw new Error(`Canva could not fill the template: ${JSON.stringify(job.error || {}).slice(0, 200)}`);
    }
  }

  if (!designId) {
    throw new Error('Canva took too long to create the design. Try again in a minute.');
  }

  // Export the design as PNG
  const exportJob = await canvaFetch('/exports', {
    method: 'POST',
    body: {
      design_id: designId,
      format: { type: 'png' },
    },
  });

  jobId = exportJob.job?.id;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const status = await canvaFetch(`/exports/${jobId}`);
    const job = status.job || {};
    if (job.status === 'success') {
      const url = (job.urls && job.urls[0]) || null;
      if (url) return url;
      throw new Error('Canva export finished but returned no image URL.');
    }
    if (job.status === 'failed') {
      throw new Error(`Canva could not export the image: ${JSON.stringify(job.error || {}).slice(0, 200)}`);
    }
  }

  throw new Error('Canva took too long to export the image. Try again in a minute.');
}
