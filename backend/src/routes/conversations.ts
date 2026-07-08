import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../config/database';
import { authenticate } from '../middleware/auth';
import { runAgent } from '../services/agent-service';
import { fetchOLTData, fetchCEOBoardData, writeOLTReport } from '../services/monday-service';
import { fetchOutlookData } from '../services/outlook-service';
import { fetchClientBidData } from '../services/powerbi-service';
import { generateLinkedInImage } from '../services/canva-service';
const router = Router();

// All routes require authentication
router.use(authenticate);

// GET / — list conversations for current user, optionally filtered by ?agentId=
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const userId = (req as any).user.userId;
    const agentId = req.query.agentId as string | undefined;

    const request = pool.request().input('user_id', sql.UniqueIdentifier, userId);

    let query = `SELECT c.id, c.agent_id, c.user_id, c.title, c.created_at, c.updated_at
                 FROM conversations c
                 WHERE c.user_id = @user_id`;

    if (agentId) {
      query += ' AND c.agent_id = @agent_id';
      request.input('agent_id', sql.UniqueIdentifier, agentId);
    }

    query += ' ORDER BY c.updated_at DESC';

    const result = await request.query(query);

    return res.json({ conversations: result.recordset });
  } catch (error: any) {
    console.error('List conversations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id — get conversation with its messages (verify user ownership)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Get conversation
    const convResult = await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query(
        `SELECT id, agent_id, user_id, title, created_at, updated_at
         FROM conversations WHERE id = @id AND user_id = @user_id`
      );

    if (convResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const msgResult = await pool
      .request()
      .input('conversation_id', sql.UniqueIdentifier, req.params.id)
      .query(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages WHERE conversation_id = @conversation_id
         ORDER BY created_at ASC`
      );

    return res.json({
      conversation: convResult.recordset[0],
      messages: msgResult.recordset,
    });
  } catch (error: any) {
    console.error('Get conversation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / — create conversation
router.post('/', async (req: Request, res: Response) => {
  try {
    const { agentId, title } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Verify agent access
    const agentResult = await pool
      .request()
      .input('id', sql.UniqueIdentifier, agentId)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query(
        `SELECT id FROM agents WHERE id = @id
         AND (owner_id = @user_id
              OR (visibility = 'team'
                  AND team_id IN (SELECT team_id FROM team_members WHERE user_id = @user_id))
              OR (visibility = 'selected'
                  AND id IN (SELECT agent_id FROM agent_access WHERE user_id = @user_id)))`
      );

    if (agentResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const conversationId = uuidv4();
    const now = new Date();

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, conversationId)
      .input('agent_id', sql.UniqueIdentifier, agentId)
      .input('user_id', sql.UniqueIdentifier, userId)
      .input('title', sql.NVarChar, title || null)
      .input('created_at', sql.DateTime2, now)
      .input('updated_at', sql.DateTime2, now)
      .query(
        `INSERT INTO conversations (id, agent_id, user_id, title, created_at, updated_at)
         VALUES (@id, @agent_id, @user_id, @title, @created_at, @updated_at)`
      );

    return res.status(201).json({
      conversation: {
        id: conversationId,
        agent_id: agentId,
        user_id: userId,
        title: title || null,
        created_at: now,
        updated_at: now,
      },
    });
  } catch (error: any) {
    console.error('Create conversation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/messages — send a message and get Claude response
router.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Verify conversation ownership
    const convResult = await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query(
        `SELECT c.id, c.agent_id
         FROM conversations c
         WHERE c.id = @id AND c.user_id = @user_id`
      );

    if (convResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.recordset[0];

    // Load agent config
    const agentResult = await pool
      .request()
      .input('id', sql.UniqueIdentifier, conversation.agent_id)
      .query(
        `SELECT system_prompt, model, config FROM agents WHERE id = @id`
      );

    if (agentResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.recordset[0];
    const now = new Date();

    // Insert user message
    const userMessageId = uuidv4();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, userMessageId)
      .input('conversation_id', sql.UniqueIdentifier, req.params.id)
      .input('role', sql.NVarChar, 'user')
      .input('content', sql.NVarChar(sql.MAX), content)
      .input('created_at', sql.DateTime2, now)
      .query(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (@id, @conversation_id, @role, @content, @created_at)`
      );

    // Load full conversation history
    const historyResult = await pool
      .request()
      .input('conversation_id', sql.UniqueIdentifier, req.params.id)
      .query(
        `SELECT role, content FROM messages
         WHERE conversation_id = @conversation_id
         ORDER BY created_at ASC`
      );

    const messages = historyResult.recordset.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }));

    // Fetch integration data if configured
    let systemPrompt = agent.system_prompt || 'You are a helpful assistant.';
    let assistantContent: string = 'No response generated.';

    try {
      const agentConfig = JSON.parse(agent.config || '{}');

      if (agentConfig.integrations?.monday?.write_to_doc) {
        let mondayContext = '';
        const mondayBoards = agentConfig.integrations.monday.boards || [];
        if (mondayBoards.includes('olt_actions')) {
          mondayContext += await fetchOLTData();
        }
        if (mondayBoards.includes('ceo')) {
          mondayContext += await fetchCEOBoardData();
        }
        if (agentConfig.integrations?.outlook) {
          mondayContext += await fetchOutlookData();
        }

        const structuredPrompt = `${systemPrompt}

${mondayContext ? '# LIVE DATA FROM MONDAY.COM AND OUTLOOK\n' + mondayContext : ''}

You help the CEO prepare the CEO section of the weekly OLT meeting doc. You work in two steps: DRAFT, then WRITE.

STRICT ACCURACY RULES:
- Base every item ONLY on the data above (Monday.com boards, Outlook calendar and emails) or on facts the user has stated in this conversation.
- NEVER invent details, blockers, dates, outcomes, or context that are not explicitly present in that data or the user's messages.
- Use item names exactly as they appear in the data. Do not embellish or expand them.
- If the data is stale, thin, or ambiguous, say so honestly and ask the user what they actually worked on — do not fill gaps with plausible-sounding content.

WORKFLOW:
1. When asked to generate the section, respond with a DRAFT for the user to review. Do not write to the doc.
2. Only write to the doc after the user has seen a draft and explicitly approved it (e.g. "yes", "write it", "publish", "go ahead").

You MUST respond with ONLY valid JSON in one of these two formats:

To show a draft, answer a question, or ask for more information (makes NO changes to the doc):
{"action": "chat", "message": "your reply, markdown formatting allowed"}

To write approved items to the doc (ONLY after the user has explicitly approved a draft):
{"action": "write", "delivered": ["item 1", "item 2", "item 3"], "priorities": ["item 1", "item 2", "item 3"]}

Each delivered/priorities item must be a concise sentence with no numbering or bullet markers.
Return ONLY the JSON object, no other text.`;

        const structuredResponse = await runAgent(
          structuredPrompt,
          messages,
          agent.model || 'claude-sonnet-4-20250514'
        );

        let parsed: any = null;
        try {
          const jsonMatch = structuredResponse.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jsonMatch ? jsonMatch[0] : structuredResponse);
        } catch {
          parsed = null;
        }

        if (
          parsed?.action === 'write' &&
          Array.isArray(parsed.delivered) && parsed.delivered.length > 0 &&
          Array.isArray(parsed.priorities) && parsed.priorities.length > 0
        ) {
          const delivered: string[] = parsed.delivered;
          const priorities: string[] = parsed.priorities;
          const writeResult = await writeOLTReport(delivered, priorities);
          if (writeResult.success) {
            assistantContent = `Done — I've updated the OLT meeting doc on Monday.com.\n\n**Delivered last week:**\n${delivered.map((d) => `- ${d}`).join('\n')}\n\n**Priorities this week:**\n${priorities.map((p) => `- ${p}`).join('\n')}`;
          } else {
            assistantContent = `I couldn't write to the doc: ${writeResult.message}\n\n**Delivered last week:**\n${delivered.map((d) => `- ${d}`).join('\n')}\n\n**Priorities this week:**\n${priorities.map((p) => `- ${p}`).join('\n')}`;
          }
        } else if (parsed?.action === 'chat' && typeof parsed.message === 'string') {
          assistantContent = parsed.message;
        } else {
          assistantContent = structuredResponse;
        }
        } else if (agentConfig.integrations?.powerbi_bid) {
        // Step 1: identify which client the user is asking about
        const extractResponse = await runAgent(
          'Identify the client company the user wants a bid/no-bid assessment for, based on the conversation. Respond with ONLY valid JSON: {"client": "company name"} if a client has been named, or {"client": null} if no specific client has been mentioned yet. Return ONLY the JSON object.',
          messages,
          agent.model || 'claude-sonnet-4-20250514'
        );

        let clientName: string | null = null;
        try {
          const m = extractResponse.match(/\{[\s\S]*\}/);
          const extracted = JSON.parse(m ? m[0] : extractResponse);
          if (extracted.client && typeof extracted.client === 'string') {
            clientName = extracted.client;
          }
        } catch { /* no client identified */ }

        // Step 2: pull live client data from Power BI, then answer
        let bidContext = '';
        if (clientName) {
          bidContext = await fetchClientBidData(clientName);
        }

        const finalPrompt = `${systemPrompt}
${bidContext
  ? '\n---\n' + bidContext + '\nSTRICT ACCURACY RULES: score the framework using ONLY the live figures above and facts the user has stated. NEVER invent numbers, history, or client details not present in that data. If a figure needed for scoring is missing, say so and ask the user.'
  : '\n---\nNo client has been identified in the conversation yet, or no data could be fetched. If the user wants a bid/no-bid assessment, ask which client the opportunity is for. Do not invent client data.'}`;

        assistantContent = await runAgent(
          finalPrompt,
          messages,
          agent.model || 'claude-sonnet-4-20250514'
        );
            } else if (agentConfig.integrations?.canva_image) {
        const canvaPrompt = `${systemPrompt}

You also produce an on-brand image (generated via Canva) with every finished LinkedIn post. The image displays a short headline in large text.

You MUST respond with ONLY valid JSON in one of these two formats:

To reply conversationally, ask for missing information, or discuss ideas (no post yet):
{"action": "chat", "message": "your reply, markdown formatting allowed"}

When delivering a finished LinkedIn post:
{"action": "post", "copy": "the complete LinkedIn post text, ready to publish", "headline": "5-10 punchy words to appear IN the image", "subtext": "one short supporting line for the image, or an empty string"}

ACCURACY RULES: base posts ONLY on facts the user has provided. NEVER invent project details, client names, statistics or achievements. If a key fact is missing, use action "chat" to ask for it.
Return ONLY the JSON object, no other text.`;

        const canvaResponse = await runAgent(
          canvaPrompt,
          messages,
          agent.model || 'claude-sonnet-4-20250514'
        );

        let parsedPost: any = null;
        try {
          const m = canvaResponse.match(/\{[\s\S]*\}/);
          parsedPost = JSON.parse(m ? m[0] : canvaResponse);
        } catch {
          parsedPost = null;
        }

        if (parsedPost?.action === 'post' && typeof parsedPost.copy === 'string' && typeof parsedPost.headline === 'string') {
          try {
            const imageUrl = await generateLinkedInImage(parsedPost.headline, parsedPost.subtext || '');
            assistantContent = `${parsedPost.copy}\n\n![LinkedIn graphic](${imageUrl})\n\n_Image headline: "${parsedPost.headline}" — the image link expires within 24 hours, so download it soon._`;
          } catch (imageErr: any) {
            assistantContent = `${parsedPost.copy}\n\n⚠️ I wrote the post but couldn't generate the image: ${imageErr.message}`;
          }
        } else if (parsedPost?.action === 'chat' && typeof parsedPost.message === 'string') {
          assistantContent = parsedPost.message;
        } else {
          assistantContent = canvaResponse;
        }
      } else {
        if (agentConfig.integrations?.monday) {
          const mondayBoards = agentConfig.integrations.monday.boards || [];
          let mondayContext = '';
          if (mondayBoards.includes('olt_actions')) {
            mondayContext += await fetchOLTData();
          }
          if (mondayBoards.includes('ceo')) {
            mondayContext += await fetchCEOBoardData();
          }
          if (agentConfig.integrations?.outlook) {
            mondayContext += await fetchOutlookData();
          }
          if (mondayContext) {
            systemPrompt += '\n\n---\n\n# LIVE DATA FROM MONDAY.COM\n' + mondayContext;
          }
        }

        assistantContent = await runAgent(
          systemPrompt,
          messages,
          agent.model || 'claude-sonnet-4-20250514'
        );
      }
    } catch (integrationErr: any) {
      console.error('Integration/agent error:', integrationErr.message);
      assistantContent = `Error: ${integrationErr.message}`;
    }

    // Insert assistant message
    const assistantMessageId = uuidv4();
    const assistantCreatedAt = new Date();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, assistantMessageId)
      .input('conversation_id', sql.UniqueIdentifier, req.params.id)
      .input('role', sql.NVarChar, 'assistant')
      .input('content', sql.NVarChar(sql.MAX), assistantContent)
      .input('created_at', sql.DateTime2, assistantCreatedAt)
      .query(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (@id, @conversation_id, @role, @content, @created_at)`
      );

    // Update conversation.updated_at
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('updated_at', sql.DateTime2, assistantCreatedAt)
      .query('UPDATE conversations SET updated_at = @updated_at WHERE id = @id');

    return res.json({
      message: {
        id: userMessageId,
        conversation_id: req.params.id,
        role: 'user',
        content,
        created_at: now,
      },
      reply: {
        id: assistantMessageId,
        conversation_id: req.params.id,
        role: 'assistant',
        content: assistantContent,
        created_at: assistantCreatedAt,
      },
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// DELETE /:id — delete conversation and its messages
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Verify ownership
    const existing = await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query('SELECT id FROM conversations WHERE id = @id AND user_id = @user_id');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete messages first
    await pool
      .request()
      .input('conversation_id', sql.UniqueIdentifier, req.params.id)
      .query('DELETE FROM messages WHERE conversation_id = @conversation_id');

    // Delete conversation
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query('DELETE FROM conversations WHERE id = @id AND user_id = @user_id');

    return res.json({ message: 'Conversation deleted successfully' });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
