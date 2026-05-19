import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { User } from '../types';

const router = Router();

// GET /api/users — list all users (admin + controller)
router.get('/', authenticateToken, requireRole('admin', 'controller'), (req: Request, res: Response): void => {
  const users = db.prepare('SELECT id, username, email, name, organisation, phone, role, contact_preference, created_at FROM users ORDER BY name').all();
  res.json(users);
});

// POST /api/users — create user (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const { username, email, password, name, organisation, phone, role, contact_preference } = req.body;

  if (!username || !email || !password || !name || !role) {
    res.status(400).json({ error: 'username, email, password, name, and role are required' });
    return;
  }

  if (!['admin', 'controller', 'booker'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    res.status(409).json({ error: 'Username or email already in use' });
    return;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const pref = contact_preference || 'both';

  try {
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, name, organisation, phone, role, contact_preference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(username, email, password_hash, name, organisation || null, phone || null, role, pref);

    const newUser = db.prepare('SELECT id, username, email, name, organisation, phone, role, contact_preference, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newUser);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// PUT /api/users/:id — update user (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { username, email, password, name, organisation, phone, role, contact_preference } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (username !== undefined) updates.username = username;
  if (email !== undefined) updates.email = email;
  if (name !== undefined) updates.name = name;
  if (organisation !== undefined) updates.organisation = organisation;
  if (phone !== undefined) updates.phone = phone;
  if (role !== undefined) {
    if (!['admin', 'controller', 'booker'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    updates.role = role;
  }
  if (contact_preference !== undefined) {
    if (!['email', 'notification', 'both'].includes(contact_preference)) {
      res.status(400).json({ error: 'Invalid contact_preference' });
      return;
    }
    updates.contact_preference = contact_preference;
  }
  if (password) {
    updates.password_hash = bcrypt.hashSync(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT id, username, email, name, organisation, phone, role, contact_preference, created_at FROM users WHERE id = ?').get(id);
    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// DELETE /api/users/:id — delete user (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;

  // Prevent self-deletion
  if (parseInt(id) === req.user!.userId) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ message: 'User deleted' });
});

export default router;
