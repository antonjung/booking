import { Router, Request, Response } from 'express';
import db from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/facilities — list active facilities (all authenticated)
router.get('/', authenticateToken, (req: Request, res: Response): void => {
  const facilities = db.prepare('SELECT * FROM facilities WHERE active = 1 ORDER BY name').all();
  res.json(facilities);
});

// GET /api/facilities/all — list all facilities including inactive (admin only)
router.get('/all', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const facilities = db.prepare('SELECT * FROM facilities ORDER BY name').all();
  res.json(facilities);
});

// POST /api/facilities — create facility (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const { name, description, type, capacity, is_whole_hall } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: 'name and type are required' });
    return;
  }

  if (!['room', 'equipment', 'service'].includes(type)) {
    res.status(400).json({ error: 'Invalid type. Must be room, equipment, or service' });
    return;
  }

  try {
    const result = db.prepare(`
      INSERT INTO facilities (name, description, type, capacity, is_whole_hall)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, description || null, type, capacity || null, is_whole_hall ? 1 : 0);

    const newFacility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newFacility);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// PUT /api/facilities/:id — update facility (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { name, description, type, capacity, is_whole_hall, active } = req.body;

  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
  if (!facility) {
    res.status(404).json({ error: 'Facility not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (type !== undefined) {
    if (!['room', 'equipment', 'service'].includes(type)) {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }
    updates.type = type;
  }
  if (capacity !== undefined) updates.capacity = capacity;
  if (is_whole_hall !== undefined) updates.is_whole_hall = is_whole_hall ? 1 : 0;
  if (active !== undefined) updates.active = active ? 1 : 0;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE facilities SET ${setClause} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// DELETE /api/facilities/:id — deactivate facility (admin only, sets active=0)
router.delete('/:id', authenticateToken, requireRole('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;

  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
  if (!facility) {
    res.status(404).json({ error: 'Facility not found' });
    return;
  }

  db.prepare('UPDATE facilities SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Facility deactivated' });
});

export default router;
