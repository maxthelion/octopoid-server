-- Add flows table for extensible queue names with runtime validation
CREATE TABLE flows (
  name TEXT NOT NULL,
  cluster TEXT NOT NULL DEFAULT 'default',
  states TEXT NOT NULL,
  transitions TEXT NOT NULL,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (name, cluster)
);
