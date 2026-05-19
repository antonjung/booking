import { Router, Request, Response } from 'express';
import db from '../database';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/notifications — get own notifications (unread first, then recent)
router.get('/', authenticateToken, (req: Request, res: Response): void => {
  const notifications = db.prepare(`
    SELECT n.*, b.date as booking_date, b.start_time as booking_start_time,
    f.name as facility_name
    FROM notifications n
    LEFT JOIN bookings b ON n.booking_id = b.id
    LEFT JOIN facilities f ON b.facility_id = f.id
    WHERE n.user_id = ?
    ORDER BY n.read ASC, n.created_at DESC
    LIMIT 50
  `).all(req.user!.userId);

  res.json(notifications);
});

// GET /api/notifications/count — count unread
router.get('/count', authenticateToken, (req: Request, res: Response): void => {
  const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(req.user!.userId) as { count: number };
  res.json({ count: result.count });
});

// PUT /api/notifications/read-all — mark all as read
router.put('/read-all', authenticateToken, (req: Request, res: Response): void => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user!.userId);
  res.json({ message: 'All notifications marked as read' });
});

// PUT /api/notifications/:id/read — mark as read
router.put('/:id/read', authenticateToken, (req: Request, res: Response): void => {
  const { id } = req.params;

  const notification = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, req.user!.userId);
  if (!notification) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  res.json({ message: 'Notification marked as read' });
});

export default router;
