const MONDAY_API_URL = 'https://api.monday.com/v2';

interface MondayItem {
  id: string;
  name: string;
  group: { title: string };
  column_values: {
    id: string;
    title: string;
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
      'API-Version': '2024-10',
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
        items_page(limit: 100) {
          items {
            id
            name
            group { title }
            updated_at
            column_values {
              id
              title
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
        cols[cv.title] = cv.text;
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
              title
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
        cols[cv.title] = cv.text;
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
