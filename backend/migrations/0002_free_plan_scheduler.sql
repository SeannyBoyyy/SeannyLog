-- Avoid scanning retained rows on every minute's cleanup.
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
CREATE INDEX deliveries_claimed_at ON deliveries(claimed_at);
CREATE INDEX installations_updated_at ON installations(updated_at);
CREATE INDEX subscriptions_eligible_id ON subscriptions(current_day_eligible, installation_id);

-- A durable round-robin cursor bounds per-invocation work without starving
-- subscriptions later in the list. It contains no additional workout data.
CREATE TABLE scheduler_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  cursor TEXT NOT NULL
);
INSERT INTO scheduler_state(id, cursor) VALUES (1, '');
