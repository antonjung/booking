-- Update notifications type to include registration_request
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('booking_request', 'booking_approved', 'booking_denied', 'registration_request'));

-- Registration requests table (self-service sign-up, awaiting admin approval)
CREATE TABLE IF NOT EXISTS registration_requests (
  id serial primary key,
  name text not null,
  email text not null,
  phone text,
  organisation text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.users(id),
  denial_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY reg_requests_select ON registration_requests
  FOR SELECT
  USING (current_user_role() IN ('admin', 'controller'));

CREATE TRIGGER registration_requests_updated_at
  BEFORE UPDATE ON registration_requests
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
