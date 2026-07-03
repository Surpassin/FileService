const MONDAY_API_URL = 'https://api.monday.com/v2';

interface MondayItem {
  id: string;
  name: string;
  group: { title: string };
  column_values: {
    id: string;
    column: { title: string };
    text: string;
    value: string | null;
  }[];
  updated_at: string;
}

interface MondayBoardResponse {
  data: {
    boards: {
      items_page: {
        cursor: string | null;
        items: MondayItem[];
      };
    }[];
  };
}

function getApiToken(): string {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error('MONDAY_API_TOKEN environment variable is not set');
  }
  return token;
}

async function mondayQuery(query: string, variables?: Record<string, any>): Promise<any> {
  const token = getApiToken();
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'API-Version': '2025-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export async function fetchOLTData(userId?: string): Promise<string> {
  const boardId = '2797095247'; // OLT Actions board

  const query = `
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 200) {
          items {
            id
            name
            group { title }
            updated_at
            column_values {
              id
              column { title }
              text
              value
            }
          }
        }
      }
    }
  `;

  const result = await mondayQuery(query);
  const items = result.data?.boards?.[0]?.items_page?.items || [];

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const enrichedItems = items.map((item: MondayItem) => {
    const cols: Record<string, string> = {};
    item.column_values.forEach((cv) => {
      if (cv.text) {
        cols[cv.column.title] = cv.text;
      }
    });

    return {
      name: item.name,
      group: item.group.title,
      status: cols['Status'] || '',
      owner: cols['Owner'] || '',
      department: cols['Department'] || '',
      dueDate: cols['Due Date'] || '',
      phase: cols['Phase'] || '',
      outcome: cols['Outcome'] || '',
      actionSummary: cols['Action Summary'] || '',
      updatedAt: item.updated_at,
    };
  });

  const recentlyCompleted = enrichedItems.filter((item: any) => {
    const isDone = item.status === 'Done' || item.group === 'Completed';
    const updatedDate = new Date(item.updatedAt);
    return isDone && updatedDate >= oneWeekAgo;
  });

  const inProgress = enrichedItems.filter((item: any) => {
    return item.status === 'Working on it' || item.status === 'Ongoing';
  });

  const upcoming = enrichedItems.filter((item: any) => {
    if (!item.dueDate) return false;
    const due = new Date(item.dueDate);
    return due >= now && due <= oneWeekAhead &&
           item.status !== 'Done' && item.group !== 'Completed';
  });

  const notStarted = enrichedItems.filter((item: any) => {
    return item.status === 'Not Commenced' || item.status === 'Not Started';
  });

  let context = `## MONDAY.COM DATA — OLT Actions Board\n`;
  context += `Data fetched: ${now.toISOString()}\n\n`;

  context += `### Recently Completed (last 7 days) — ${recentlyCompleted.length} items\n`;
  recentlyCompleted.forEach((item: any) => {
    context += `- **${item.name}** | Owner: ${item.owner} | Dept: ${item.department} | Updated: ${item.updatedAt.split('T')[0]}`;
    if (item.outcome) context += ` | Outcome: ${item.outcome}`;
    context += '\n';
  });

  context += `\n### In Progress — ${inProgress.length} items\n`;
  inProgress.forEach((item: any) => {
    context += `- **${item.name}** | Owner: ${item.owner} | Dept: ${item.department} | Status: ${item.status}`;
    if (item.dueDate) context += ` | Due: ${item.dueDate}`;
    if (item.actionSummary) context += ` | Summary: ${item.actionSummary}`;
    context += '\n';
  });

  context += `\n### Due This Week — ${upcoming.length} items\n`;
  upcoming.forEach((item: any) => {
    context += `- **${item.name}** | Owner: ${item.owner} | Dept: ${item.department} | Due: ${item.dueDate}`;
    if (item.phase) context += ` | Phase: ${item.phase}`;
    context += '\n';
  });

  context += `\n### Not Started / Not Commenced — ${notStarted.length} items\n`;
  notStarted.forEach((item: any) => {
    context += `- **${item.name}** | Owner: ${item.owner} | Dept: ${item.department}`;
    if (item.dueDate) context += ` | Due: ${item.dueDate}`;
    context += '\n';
  });

  return context;
}

export async function readDocBlocks(docId: string): Promise<any[]> {
  let allBlocks: any[] = [];
  let page = 1;

  while (page <= 10) {
    const query = `
      query {
        docs(ids: [${docId}]) {
          blocks(limit: 100, page: ${page}) {
            id
            type
            content
            parent_block_id
          }
        }
      }
    `;

    const result = await mondayQuery(query);
    const blocks = result.data?.docs?.[0]?.blocks || [];
    allBlocks = allBlocks.concat(blocks);

    if (blocks.length < 100) break;
    page++;
  }

  return allBlocks;
}

export function findCEOSectionBlocks(
  blocks: any[],
  targetDate: Date
): { deliveredBlockId: string | null; prioritiesBlockId: string | null } {
  const day = String(targetDate.getDate()).padStart(2, '0');
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const year = targetDate.getFullYear();

  const datePatterns = [
    `${day}/${month}/${year}`,
    `${month}/${day}/${year}`,
    `${year}-${month}-${day}`,
  ];

  let dateBlockIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const content = blocks[i].content || '';
    if (datePatterns.some((fmt) => content.includes(fmt))) {
      dateBlockIdx = i;
      break;
    }
  }

  if (dateBlockIdx === -1) {
    return { deliveredBlockId: null, prioritiesBlockId: null };
  }

  let deliveredBlockId: string | null = null;
  let prioritiesBlockId: string | null = null;

  for (let i = dateBlockIdx + 1; i < blocks.length; i++) {
    const content = (blocks[i].content || '').toLowerCase();

    if (i > dateBlockIdx + 1) {
      const otherContent = blocks[i].content || '';
      const hasDatePattern = /\d{2}\/\d{2}\/\d{4}/.test(otherContent);
      const isCurrentDate = otherContent.includes(datePatterns[0]);
      if (hasDatePattern && !isCurrentDate) {
        break;
      }
    }

    if (content.includes('ceo') && !content.includes('delivered') && !content.includes('priority')) {
      for (let j = i + 1; j < blocks.length && j < i + 10; j++) {
        const subContent = (blocks[j].content || '').toLowerCase();
        if (!deliveredBlockId && subContent.includes('delivered')) {
          deliveredBlockId = blocks[j].id;
        }
        if (subContent.includes('priority')) {
          prioritiesBlockId = blocks[j].id;
          break;
        }
      }
      break;
    }
  }

  return { deliveredBlockId, prioritiesBlockId };
}

async function createDocBlock(
  docId: number,
  afterBlockId: string,
  text: string
): Promise<string> {
  const contentPayload = JSON.stringify({ deltaFormat: [{ insert: text }] });
  const query = `
    mutation {
      create_doc_block(
        type: bulleted_list,
        doc_id: ${docId},
        after_block_id: "${afterBlockId}",
        content: ${JSON.stringify(contentPayload)}
      ) {
        id
      }
    }
  `;

  const result = await mondayQuery(query);
  return result.data?.create_doc_block?.id || '';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

async function findCurrentOLTDoc(): Promise<{ id: number; name: string } | null> {
  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();
  const targetName = `${currentMonth} ${currentYear} OLT`;

  const query = `
    query {
      docs(limit: 500) {
        id
        name
      }
    }
  `;

  const result = await mondayQuery(query);
  const docs = result.data?.docs || [];

  const match = docs.find((doc: any) =>
    doc.name.toLowerCase().includes(targetName.toLowerCase())
  );

  if (match) {
    return { id: Number(match.id), name: match.name };
  }

  const nextMonth = new Date(now);
  nextMonth.setMonth(now.getMonth() + 1);
  const nextMonthName = MONTH_NAMES[nextMonth.getMonth()];
  const nextYear = nextMonth.getFullYear();
  const nextTargetName = `${nextMonthName} ${nextYear} OLT`;

  const nextMatch = docs.find((doc: any) =>
    doc.name.toLowerCase().includes(nextTargetName.toLowerCase())
  );

  if (nextMatch) {
    return { id: Number(nextMatch.id), name: nextMatch.name };
  }

  return null;
}

export async function writeOLTReport(
  delivered: string[],
  priorities: string[]
): Promise<{ success: boolean; message: string }> {
  const doc = await findCurrentOLTDoc();
  if (!doc) {
    const now = new Date();
    return {
      success: false,
      message: `Could not find the OLT doc for ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}. Make sure a doc named "${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()} OLT" exists in Monday.com.`,
    };
  }

  const blocks = await readDocBlocks(String(doc.id));

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + mondayOffset);

  let { deliveredBlockId, prioritiesBlockId } = findCEOSectionBlocks(blocks, thisMonday);

  if (!deliveredBlockId || !prioritiesBlockId) {
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const retry = findCEOSectionBlocks(blocks, nextMonday);
    deliveredBlockId = retry.deliveredBlockId;
    prioritiesBlockId = retry.prioritiesBlockId;
  }

  if (!deliveredBlockId || !prioritiesBlockId) {
    return {
      success: false,
      message: `Found doc "${doc.name}" but could not locate the CEO section for this week. Looked for dates near ${thisMonday.toLocaleDateString('en-AU')}.`,
    };
  }

  let lastDeliveredId = deliveredBlockId;
  for (const item of delivered) {
    const newId = await createDocBlock(doc.id, lastDeliveredId, item);
    if (newId) lastDeliveredId = newId;
  }

  let lastPriorityId = prioritiesBlockId;
  for (const item of priorities) {
    const newId = await createDocBlock(doc.id, lastPriorityId, item);
    if (newId) lastPriorityId = newId;
  }

  return {
    success: true,
    message: `Successfully wrote ${delivered.length} delivered items and ${priorities.length} priorities to "${doc.name}".`,
  };
}

export async function fetchCEOBoardData(): Promise<string> {
  const boardId = '2815053883'; // CEO board

  const query = `
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 100) {
          items {
            id
            name
            group { title }
            updated_at
            column_values {
              id
              column { title }
              text
              value
            }
          }
        }
      }
    }
  `;

  const result = await mondayQuery(query);
  const items = result.data?.boards?.[0]?.items_page?.items || [];

  const enrichedItems = items.map((item: MondayItem) => {
    const cols: Record<string, string> = {};
    item.column_values.forEach((cv) => {
      if (cv.text) {
        cols[cv.column.title] = cv.text;
      }
    });

    return {
      name: item.name,
      group: item.group.title,
      area: cols['Area/Dept'] || '',
      priority: cols['Priority'] || '',
      date: cols['Date'] || '',
      status: cols['Platform Rating - Total Synergy'] || '',
      updatedAt: item.updated_at,
    };
  });

  const todoItems = enrichedItems.filter((item: any) =>
    item.group === 'Richard To Do' || item.group === 'CEO Actions & Info'
  );

  const completedItems = enrichedItems.filter((item: any) =>
    item.group === 'Complete'
  );

  let context = `\n## MONDAY.COM DATA — CEO Board\n`;

  context += `\n### To Do / Active — ${todoItems.length} items\n`;
  todoItems.forEach((item: any) => {
    context += `- **${item.name}** | Area: ${item.area} | Priority: ${item.priority}`;
    if (item.date) context += ` | Date: ${item.date}`;
    context += '\n';
  });

  context += `\n### Recently Completed — showing last 10\n`;
  completedItems.slice(0, 10).forEach((item: any) => {
    context += `- **${item.name}** | Area: ${item.area} | Updated: ${item.updatedAt.split('T')[0]}\n`;
  });

  return context;
}
