import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../config/database';
import { authenticate } from '../middleware/auth';
import { runAgent } from '../services/agent-service';
import { fetchOLTData, fetchCEOBoardData } from '../services/monday-service';

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

    // Verify agent access (owner or team member)
    const agentResult = await pool
      .request()
      .input('id', sql.UniqueIdentifier, agentId)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query(
        `SELECT id FROM agents WHERE id = @id
         AND (owner_id = @user_id
              OR team_id IN (SELECT team_id FROM team_members WHERE user_id = @user_id))`
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
    try {
      const agentConfig = JSON.parse(agent.config || '{}');
      if (agentConfig.integrations?.monday) {
        const mondayBoards = agentConfig.integrations.monday.boards || [];
        let mondayContext = '';
        if (mondayBoards.includes('olt_actions')) {
          mondayContext += await fetchOLTData();
        }
        if (mondayBoards.includes('ceo')) {
          mondayContext += await fetchCEOBoardData();
        }
        if (mondayContext) {
          systemPrompt += '\n\n---\n\n# LIVE DATA FROM MONDAY.COM\n' + mondayContext;
        }
      }
    } catch (integrationErr: any) {
      console.error('Integration data fetch error:', integrationErr.message);
    }

    // Call Claude API
    const assistantContent = await runAgent(
      systemPrompt,
      messages,
      agent.model || 'claude-sonnet-4-20250514'
    );

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
