-- Add cancellation_pending and cancelled statuses
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'cancellation_pending', 'cancelled'));

-- Allow bookers to update their approved bookings (to request cancellation)
DROP POLICY IF EXISTS bookings_update ON bookings;
CREATE POLICY bookings_update ON bookings
  FOR UPDATE
  USING (
    (booker_id = auth.uid() AND status IN ('pending', 'approved')) OR
    current_user_role() IN ('admin', 'controller')
  );

-- Keep delete restricted to pending only (cancellations go through the request flow)
DROP POLICY IF EXISTS bookings_delete ON bookings;
CREATE POLICY bookings_delete ON bookings
  FOR DELETE
  USING (
    (booker_id = auth.uid() AND status = 'pending') OR
    current_user_role() IN ('admin', 'controller')
  );
