const POWERBI_WORKSPACE_ID = 'b8ae0454-408d-44a4-80e8-eac7add2d293'; // IgniteAI
const POWERBI_DATASET_ID = '7320aefe-c30c-4e5a-958a-fa2066faf397'; // Bid Conversion Report
const METADATA_TABLE = 'EXVW_BI_Project_Accounting_Project_Metadata';
const PERIOD_TABLE = 'U2VW_BI_Project_Accounting_By_Period_Live';

function getGraphConfig(): { tenantId: string; clientId: string; clientSecret: string } {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Power BI integration is not configured. Set MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET in the App Service settings.'
    );
  }

  return { tenantId, clientId, clientSecret };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getPowerBIToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = getGraphConfig();

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://analysis.windows.net/powerbi/api/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`Power BI token error ${response.status}:`, errBody);
    throw new Error(`Could not authenticate with Microsoft for Power BI: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function executeDax(daxQuery: string): Promise<any[]> {
  const token = await getPowerBIToken();
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${POWERBI_WORKSPACE_ID}/datasets/${POWERBI_DATASET_ID}/executeQueries`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      queries: [{ query: daxQuery }],
      serializerSettings: { includeNulls: true },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`Power BI query error ${response.status}:`, errBody.slice(0, 500));
    throw new Error(`Power BI query failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.results?.[0]?.tables?.[0]?.rows || [];
}

// Escape double quotes for DAX string literals
function daxEscape(value: string): string {
  return value.replace(/"/g, '""');
}

async function searchClientNames(term: string): Promise<string[]> {
  const escaped = daxEscape(term.trim());
  const query = `
    EVALUATE
    SELECTCOLUMNS(
      FILTER(
        DISTINCT(SELECTCOLUMNS('${METADATA_TABLE}', "ClientName", '${METADATA_TABLE}'[Client])),
        NOT(ISBLANK([ClientName])) && SEARCH("${escaped}", [ClientName], 1, 0) > 0
      ),
      "ClientName", [ClientName]
    )
  `;

  const rows = await executeDax(query);
  return rows.map((r: any) => r['[ClientName]']).filter(Boolean);
}

export async function findMatchingClients(
  searchTerm: string
): Promise<{ term: string; matches: string[] }> {
  const phrase = searchTerm.trim();

  // Try progressively looser searches: full phrase first, then the most
  // distinctive words, including singular forms (Hutchinsons -> Hutchinson)
  const attempts: string[] = [phrase];
  const words = phrase
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort((a, b) => b.length - a.length);
  for (const w of words) {
    attempts.push(w);
    if (w.toLowerCase().endsWith('s')) attempts.push(w.slice(0, -1));
  }

  for (const attempt of attempts) {
    const matches = await searchClientNames(attempt);
    if (matches.length > 0) {
      return { term: attempt, matches };
    }
  }

  return { term: phrase, matches: [] };
}

export async function fetchClientBidData(clientName: string): Promise<string> {
  const { term, matches: exactMatches } = await findMatchingClients(clientName);

  if (exactMatches.length === 0) {
    return `\n## POWER BI CLIENT DATA\nNo client matching "${clientName}" was found in the Bid Conversion dataset. The name may be spelled differently in Deltek PIM — ask the user to check the exact client name.\n`;
  }

  let context = `\n## POWER BI CLIENT DATA (Bid Conversion Report — Deltek PIM)\n`;
  context += `Search term: "${clientName}" — ${exactMatches.length} matching client name(s) found.\n`;

  // Many large clients are split across branch entities in PIM. When more
  // than one entity matches, give the combined group record first.
  if (exactMatches.length > 1) {
    const t = daxEscape(term);
    const combinedQuery = `
      EVALUATE
      ROW(
        "Bids", CALCULATE(SUM('${METADATA_TABLE}'[Bid Submitted]), FILTER('${METADATA_TABLE}', SEARCH("${t}", '${METADATA_TABLE}'[Client], 1, 0) > 0)),
        "Wins", CALCULATE(SUM('${METADATA_TABLE}'[Project Won]), FILTER('${METADATA_TABLE}', SEARCH("${t}", '${METADATA_TABLE}'[Client], 1, 0) > 0)),
        "TotalFees", CALCULATE(SUM('${METADATA_TABLE}'[Total Project Fee]), FILTER('${METADATA_TABLE}', SEARCH("${t}", '${METADATA_TABLE}'[Client], 1, 0) > 0)),
        "WinValue", CALCULATE(SUM('${METADATA_TABLE}'[Win Value]), FILTER('${METADATA_TABLE}', SEARCH("${t}", '${METADATA_TABLE}'[Client], 1, 0) > 0))
      )
    `;
    const combinedRows = await executeDax(combinedQuery);
    const cb = combinedRows[0] || {};
    const cBids = cb['[Bids]'] || 0;
    const cWins = cb['[Wins]'] || 0;
    const cConv = cBids > 0 ? ((100 * cWins) / cBids).toFixed(1) + '%' : 'n/a';
    context += `\n### COMBINED GROUP RECORD (all ${exactMatches.length} matching entities)\n`;
    context += `- Bids submitted: ${cBids}\n- Bids won: ${cWins}\n- Conversion rate: ${cConv}\n`;
    context += `- Total fees bid: $${Number(cb['[TotalFees]'] || 0).toLocaleString()}\n`;
    context += `- Total win value: $${Number(cb['[WinValue]'] || 0).toLocaleString()}\n`;
    context += `Use this combined record for the client-level framework scoring unless the user specifies a particular entity.\n`;
  }

  // Limit detailed stats to the first 3 matches to keep context manageable
  for (const client of exactMatches.slice(0, 3)) {
    const c = daxEscape(client);

    const summaryQuery = `
      EVALUATE
      ROW(
        "Bids", CALCULATE(SUM('${METADATA_TABLE}'[Bid Submitted]), '${METADATA_TABLE}'[Client] = "${c}"),
        "Wins", CALCULATE(SUM('${METADATA_TABLE}'[Project Won]), '${METADATA_TABLE}'[Client] = "${c}"),
        "TotalFees", CALCULATE(SUM('${METADATA_TABLE}'[Total Project Fee]), '${METADATA_TABLE}'[Client] = "${c}"),
        "WinValue", CALCULATE(SUM('${METADATA_TABLE}'[Win Value]), '${METADATA_TABLE}'[Client] = "${c}"),
        "AvgBidDuration", CALCULATE(AVERAGE('${METADATA_TABLE}'[Bid Duration (Days)]), '${METADATA_TABLE}'[Client] = "${c}")
      )
    `;

    const profitQuery = `
      EVALUATE
      ROW(
        "InvoicesToDate", CALCULATE(SUM('${PERIOD_TABLE}'[Invoices To Date]), '${PERIOD_TABLE}'[Billing Client] = "${c}"),
        "ProfitToDate", CALCULATE(SUM('${PERIOD_TABLE}'[Profit To Date]), '${PERIOD_TABLE}'[Billing Client] = "${c}"),
        "CostToDate", CALCULATE(SUM('${PERIOD_TABLE}'[All Cost To Date]), '${PERIOD_TABLE}'[Billing Client] = "${c}")
      )
    `;

    const recentBidsQuery = `
      EVALUATE
      TOPN(
        8,
        CALCULATETABLE(
          SELECTCOLUMNS(
            '${METADATA_TABLE}',
            "Project", '${METADATA_TABLE}'[Project Code and Name],
            "Won", '${METADATA_TABLE}'[Project Won],
            "Fee", '${METADATA_TABLE}'[Total Project Fee],
            "Submitted", '${METADATA_TABLE}'[Submission Issued Date],
            "Sector", '${METADATA_TABLE}'[Sector]
          ),
          '${METADATA_TABLE}'[Client] = "${c}",
          '${METADATA_TABLE}'[Bid Submitted] = 1
        ),
        [Submitted], DESC
      )
    `;

    const [summaryRows, profitRows, recentRows] = await Promise.all([
      executeDax(summaryQuery),
      executeDax(profitQuery),
      executeDax(recentBidsQuery),
    ]);

    const s = summaryRows[0] || {};
    const p = profitRows[0] || {};
    const bids = s['[Bids]'] || 0;
    const wins = s['[Wins]'] || 0;
    const conversionRate = bids > 0 ? (100 * wins) / bids : null;
    const invoices = p['[InvoicesToDate]'] || 0;
    const profit = p['[ProfitToDate]'] || 0;
    const profitMargin = invoices > 0 ? (100 * profit) / invoices : null;

    context += `\n### ${client}\n`;
    context += `- Bids submitted (all time): ${bids}\n`;
    context += `- Bids won: ${wins}\n`;
    context += `- Conversion rate: ${conversionRate !== null ? conversionRate.toFixed(1) + '%' : 'no bid history'}\n`;
    context += `- Total fees bid: $${Number(s['[TotalFees]'] || 0).toLocaleString()}\n`;
    context += `- Total win value: $${Number(s['[WinValue]'] || 0).toLocaleString()}\n`;
    if (s['[AvgBidDuration]']) context += `- Average bid duration: ${Number(s['[AvgBidDuration]']).toFixed(0)} days\n`;
    context += `- Invoiced to date (as billing client): $${Number(invoices).toLocaleString()}\n`;
    context += `- Profit to date: $${Number(profit).toLocaleString()}`;
    context += profitMargin !== null ? ` (margin ${profitMargin.toFixed(1)}% of invoiced)\n` : '\n';

    if (recentRows.length > 0) {
      context += `- Recent bids:\n`;
      recentRows.forEach((r: any) => {
        const won = r['[Won]'] ? 'WON' : 'lost/pending';
        const fee = Number(r['[Fee]'] || 0).toLocaleString();
        const date = (r['[Submitted]'] || '').toString().split('T')[0];
        const sector = r['[Sector]'] ? ` | ${r['[Sector]']}` : '';
        context += `  - ${r['[Project]'] || '(unnamed)'} | ${date} | $${fee} | ${won}${sector}\n`;
      });
    }
  }

  if (exactMatches.length > 3) {
    context += `\nOther matching client names (no stats pulled): ${exactMatches.slice(3).join('; ')}\n`;
  }

  context += `\nNOTE: conversion rate and profit margin above are computed from live Deltek PIM data. Map them to the framework thresholds when scoring.\n`;

  return context;
}
