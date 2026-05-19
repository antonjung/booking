export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  name: string;
  organisation?: string;
  phone?: string;
  role: 'admin' | 'controller' | 'booker';
  contact_preference: 'email' | 'notification' | 'both';
  created_at: string;
}

export interface Facility {
  id: number;
  name: string;
  description?: string;
  type: 'room' | 'equipment' | 'service';
  capacity?: number;
  is_whole_hall: number;
  active: number;
  color?: string;
  created_at: string;
}

export interface Booking {
  id: number;
  facility_id: number;
  booker_id: number;
  date: string;
  start_time: string;
  duration_slots: number;
  status: 'pending' | 'approved' | 'denied';
  notes?: string;
  controller_id?: number;
  controller_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  booking_id?: number;
  message: string;
  type: 'booking_request' | 'booking_approved' | 'booking_denied';
  read: number;
  created_at: string;
}

export interface JwtPayload {
  userId: number;
  role: string;
}
