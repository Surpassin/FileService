const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL_TEMPLATE = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';

function getGraphConfig(): { tenantId: string; clientId: string; clientSecret: string; userEmail: string } {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const userEmail = process.env.OUTLOOK_USER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !userEmail) {
    throw new Error(
      'Outlook integration is not configured. Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and OUTLOOK_USER_EMAIL in the App Service settings.'
    );
  }

  return { tenantId, clientId, clientSecret, userEmail };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = getGraphConfig();

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(TOKEN_URL_TEMPLATE.replace('{tenant}', tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`Microsoft token error ${response.status}:`, errBody);
    throw new Error(`Could not authenticate with Microsoft: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function graphGet(path: string): Promise<any> {
  const token = await getGraphToken();
  const response = await fetch(`${GRAPH_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="AUS Eastern Standard Time"',
    },
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`Microsoft Graph error ${response.status} [${path}]:`, errBody);
    throw new Error(`Microsoft Graph error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchOutlookData(): Promise<string> {
  const { userEmail } = getGraphConfig();
  const user = encodeURIComponent(userEmail);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const startIso = weekAgo.toISOString();
  const nowIso = now.toISOString();
  const endIso = weekAhead.toISOString();

  // Calendar: meetings from the past week and the week ahead
  const calendarData = await graphGet(
    `/users/${user}/calendarView?startDateTime=${startIso}&endDateTime=${endIso}` +
      `&$select=subject,start,end,organizer,attendees,isCancelled&$orderby=start/dateTime&$top=100`
  );

  // Sent mail from the past week — subjects and recipients only
  const sentData = await graphGet(
    `/users/${user}/mailFolders/SentItems/messages?` +
      `$filter=sentDateTime ge ${startIso}&$select=subject,sentDateTime,toRecipients&$orderby=sentDateTime desc&$top=50`
  );

  const events = (calendarData.value || []).filter((e: any) => !e.isCancelled);
  const pastEvents = events.filter((e: any) => e.start?.dateTime && new Date(e.start.dateTime + 'Z') <= now);
  const upcomingEvents = events.filter((e: any) => e.start?.dateTime && new Date(e.start.dateTime + 'Z') > now);
  const sentMails = sentData.value || [];

  let context = `\n## OUTLOOK DATA — ${userEmail}\n`;
  context += `Data fetched: ${nowIso}\n`;

  context += `\n### Meetings attended (last 7 days) — ${pastEvents.length}\n`;
  pastEvents.forEach((e: any) => {
    const date = (e.start?.dateTime || '').split('T')[0];
    const attendeeNames = (e.attendees || [])
      .map((a: any) => a.emailAddress?.name)
      .filter(Boolean)
      .slice(0, 6)
      .join(', ');
    context += `- **${e.subject || '(no subject)'}** | ${date}`;
    if (attendeeNames) context += ` | With: ${attendeeNames}`;
    context += '\n';
  });

  context += `\n### Upcoming meetings (next 7 days) — ${upcomingEvents.length}\n`;
  upcomingEvents.forEach((e: any) => {
    const date = (e.start?.dateTime || '').split('T')[0];
    context += `- **${e.subject || '(no subject)'}** | ${date}\n`;
  });

  context += `\n### Emails sent (last 7 days) — ${sentMails.length}\n`;
  sentMails.forEach((m: any) => {
    const date = (m.sentDateTime || '').split('T')[0];
    const recipients = (m.toRecipients || [])
      .map((r: any) => r.emailAddress?.name)
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');
    context += `- **${m.subject || '(no subject)'}** | ${date}`;
    if (recipients) context += ` | To: ${recipients}`;
    context += '\n';
  });

  return context;
}
