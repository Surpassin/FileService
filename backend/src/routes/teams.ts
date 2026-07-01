import { Router, Request, Response } from 'express';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET / — list teams the current user belongs to
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const userId = (req as any).user.userId;

    const result = await pool
      .request()
      .input('user_id', sql.UniqueIdentifier, userId)
      .query(
        `SELECT t.id, t.name, t.owner_id, t.created_at, t.updated_at,
                tm.role AS member_role,
                (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
         FROM teams t
         INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = @user_id
         ORDER BY t.name`
      );

    return res.json({ teams: result.recordset });
  } catch (error: any) {
    console.error('List teams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / — create a team
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const pool = await getPool();
    const userId = (req as any).user.userId;
    const teamId = uuidv4();
    const memberId = uuidv4();
    const now = new Date();

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, teamId)
      .input('name', sql.NVarChar, name)
      .input('owner_id', sql.UniqueIdentifier, userId)
      .input('created_at', sql.DateTime2, now)
      .input('updated_at', sql.DateTime2, now)
      .query(
        `INSERT INTO teams (id, name, owner_id, created_at, updated_at)
         VALUES (@id, @name, @owner_id, @created_at, @updated_at)`
      );

    // Add creator as admin member
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, memberId)
      .input('team_id', sql.UniqueIdentifier, teamId)
      .input('user_id', sql.UniqueIdentifier, userId)
      .input('role', sql.NVarChar, 'admin')
      .input('created_at', sql.DateTime2, now)
      .query(
        `INSERT INTO team_members (id, team_id, user_id, role, created_at)
         VALUES (@id, @team_id, @user_id, @role, @created_at)`
      );

    return res.status(201).json({
      team: {
        id: teamId,
        name,
        owner_id: userId,
        member_role: 'admin',
        member_count: 1,
        created_at: now,
        updated_at: now,
      },
    });
  } catch (error: any) {
    console.error('Create team error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/members — list team members
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Verify membership
    const membership = await pool
      .request()
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query('SELECT role FROM team_members WHERE team_id = @team_id AND user_id = @user_id');

    if (membership.recordset.length === 0) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }

    const result = await pool
      .request()
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .query(
        `SELECT tm.id, tm.role, tm.created_at,
                u.id AS user_id, u.name, u.email
         FROM team_members tm
         INNER JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = @team_id
         ORDER BY tm.created_at`
      );

    return res.json({ members: result.recordset });
  } catch (error: any) {
    console.error('List members error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/members — invite a user by email
router.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Verify requester is admin of this team
    const membership = await pool
      .request()
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query('SELECT role FROM team_members WHERE team_id = @team_id AND user_id = @user_id');

    if (membership.recordset.length === 0 || membership.recordset[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only team admins can invite members' });
    }

    // Find user by email
    const userResult = await pool
      .request()
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .query('SELECT id, name, email FROM users WHERE email = @email');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: 'No user found with that email. They need to register first.' });
    }

    const invitedUser = userResult.recordset[0];

    // Check if already a member
    const existing = await pool
      .request()
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, invitedUser.id)
      .query('SELECT id FROM team_members WHERE team_id = @team_id AND user_id = @user_id');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'User is already a member of this team' });
    }

    const memberId = uuidv4();
    const now = new Date();

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, memberId)
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, invitedUser.id)
      .input('role', sql.NVarChar, role || 'member')
      .input('created_at', sql.DateTime2, now)
      .query(
        `INSERT INTO team_members (id, team_id, user_id, role, created_at)
         VALUES (@id, @team_id, @user_id, @role, @created_at)`
      );

    return res.status(201).json({
      member: {
        id: memberId,
        user_id: invitedUser.id,
        name: invitedUser.name,
        email: invitedUser.email,
        role: role || 'member',
        created_at: now,
      },
    });
  } catch (error: any) {
    console.error('Invite member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id/members/:memberId — remove a member
router.delete('/:id/members/:memberId', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const userId = (req as any).user.userId;

    // Verify requester is admin
    const membership = await pool
      .request()
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .input('user_id', sql.UniqueIdentifier, userId)
      .query('SELECT role FROM team_members WHERE team_id = @team_id AND user_id = @user_id');

    if (membership.recordset.length === 0 || membership.recordset[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only team admins can remove members' });
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, req.params.memberId)
      .input('team_id', sql.UniqueIdentifier, req.params.id)
      .query('DELETE FROM team_members WHERE id = @id AND team_id = @team_id');

    return res.json({ message: 'Member removed' });
  } catch (error: any) {
    console.error('Remove member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
