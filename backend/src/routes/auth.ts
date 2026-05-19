import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database';
import { authenticateToken } from '../middleware/auth';
import { User } from '../types';

const router = Router();

// POST /api/auth/login
router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const secret = process.env.JWT_SECRET || 'village-hall-booking-secret-change-in-production';
  const token = jwt.sign({ userId: user.id, role: user.role }, secret, { expiresIn: '7d' });

  const { password_hash: _ph, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req: Request, res: Response): void => {
  const user = db.prepare('SELECT id, username, email, name, organisation, phone, role, contact_preference, created_at FROM users WHERE id = ?').get(req.user!.userId) as Omit<User, 'password_hash'> | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

// PUT /api/auth/me
router.put('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { name, organisation, phone, contact_preference, current_password, new_password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId) as User | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (organisation !== undefined) updates.organisation = organisation;
  if (phone !== undefined) updates.phone = phone;
  if (contact_preference !== undefined) {
    if (!['email', 'notification', 'both'].includes(contact_preference)) {
      res.status(400).json({ error: 'Invalid contact_preference' });
      return;
    }
    updates.contact_preference = contact_preference;
  }

  if (new_password) {
    if (!current_password) {
      res.status(400).json({ error: 'Current password required to change password' });
      return;
    }
    const valid = bcrypt.compareSync(current_password, user.password_hash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    updates.password_hash = bcrypt.hashSync(new_password, 10);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.user!.userId];
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT id, username, email, name, organisation, phone, role, contact_preference, created_at FROM users WHERE id = ?').get(req.user!.userId);
  res.json(updated);
});

export default router;
