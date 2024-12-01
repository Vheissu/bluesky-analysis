const Database = require('better-sqlite3');
const path = require('path');

// Initialize database in a data directory
const db = new Database(path.join(__dirname, 'data', 'followers.db'));

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS followers (
    did TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    display_name TEXT,
    avatar TEXT,
    description TEXT,
    indexed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    did TEXT NOT NULL,
    handle TEXT NOT NULL,
    display_name TEXT,
    timestamp INTEGER NOT NULL,
    created_at TEXT,
    path TEXT,
    avatar TEXT,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Index for faster queries on timestamp
  CREATE INDEX IF NOT EXISTS idx_follow_events_timestamp 
  ON follow_events(timestamp DESC);
`);

// Prepare statements for better performance
const statements = {
  insertFollower: db.prepare(`
    INSERT OR REPLACE INTO followers (
      did, handle, display_name, avatar, description, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `),

  removeFollower: db.prepare(`
    DELETE FROM followers WHERE did = ?
  `),

  insertEvent: db.prepare(`
    INSERT INTO follow_events (
      type, did, handle, display_name, timestamp, created_at, 
      path, avatar, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getAllFollowers: db.prepare(`
    SELECT * FROM followers
  `),

  getFollower: db.prepare(`
    SELECT * FROM followers WHERE did = ?
  `),

  getRecentEvents: db.prepare(`
    SELECT * FROM follow_events 
    ORDER BY timestamp DESC, id DESC
    LIMIT @limit 
    OFFSET @offset
  `),

  getEventCount: db.prepare('SELECT COUNT(*) as count FROM follow_events'),

  getPaginatedFollowers: db.prepare(`
    SELECT * FROM followers
    ORDER BY handle COLLATE NOCASE ASC
    LIMIT @limit 
    OFFSET @offset
  `),

  getFollowerCount: db.prepare(`
    SELECT COUNT(*) as count FROM followers
  `),

  setLastCheck: db.prepare(`
    INSERT OR REPLACE INTO metadata (key, value)
    VALUES ('last_check', ?)
  `),

  getLastCheck: db.prepare(`
    SELECT value FROM metadata WHERE key = 'last_check'
  `),
};

module.exports = {
  db,
  statements
}; 