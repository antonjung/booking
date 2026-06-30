export interface User {
  id: string;
  username: string;
  email: string;
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
  is_whole_hall: boolean;
  active: boolean;
  color?: string;
}

export interface Booking {
  id: number;
  facility_id: number;
  facility_name: string;
  booker_id: string;
  booker_name: string;
  booker_email: string;
  booker_organisation?: string;
  organisation?: string;
  date: string;
  start_time: string;
  duration_slots: number;
  end_time: string;
  status: 'pending' | 'approved' | 'denied';
  notes?: string;
  controller_id?: string;
  controller_name?: string;
  controller_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: number;
  booking_id?: number;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  booking_date?: string;
  booking_start_time?: string;
  facility_name?: string;
}
