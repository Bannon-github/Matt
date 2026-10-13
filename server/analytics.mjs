import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

export const MIN_READING_MS = 5000;
export const MAX_READING_MS = 30 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const short = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';

export class ViewLog {
  constructor(path, now = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS views (id TEXT PRIMARY KEY, session TEXT NOT NULL,
      opened INTEGER NOT NULL, closed INTEGER, active_ms INTEGER, counted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, view_id TEXT, kind TEXT NOT NULL,
      occurred INTEGER NOT NULL, ip TEXT, user_agent TEXT, language TEXT, metadata TEXT, reason TEXT);`);
    this.prune();
  }
  prune() {
    const before = this.now() - 30 * 24 * 3600000;
    this.db.prepare('DELETE FROM events WHERE occurred < ?').run(before);
    this.db.prepare('DELETE FROM views WHERE opened < ?').run(before);
  }
  event(id, kind, request, data, reason) {
    const metadata = { clientTime: short(data.clientTime, 40), timezone: short(data.timezone, 100),
      viewport: short(data.viewport, 30), visibility: short(data.visibility, 20) };
    this.db.prepare(`INSERT INTO events(view_id,kind,occurred,ip,user_agent,language,metadata,reason)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, kind, this.now(), short(request.ip, 80),
      short(request.userAgent), short(request.language, 100), JSON.stringify(metadata), reason);
  }
  open(session, request, data = {}) {
    this.prune();
    const id = randomUUID();
    this.db.prepare('INSERT INTO views(id,session,opened) VALUES (?,?,?)').run(id, hash(session), this.now());
    this.event(id, 'open', request, data, 'opened');
    return { viewId: id };
  }
  close(session, request, data = {}) {
    const id = short(data.viewId, 80);
    const row = this.db.prepare('SELECT * FROM views WHERE id = ?').get(id);
    const elapsed = row ? this.now() - row.opened : 0;
    let reason = 'valid';
    if (!row) reason = 'missing-open';
    else if (row.session !== hash(session)) reason = 'session-mismatch';
    else if (row.closed !== null) reason = 'duplicate-close';
    else if (!Number.isSafeInteger(data.activeMs) || data.activeMs < 0 || data.activeMs > elapsed + 1000) reason = 'invalid-duration';
    else if (elapsed > MAX_READING_MS || elapsed < 0) reason = 'expired';
    else if (data.activeMs < MIN_READING_MS || elapsed < MIN_READING_MS) reason = 'too-short';
    const counted = reason === 'valid';
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (row && row.session === hash(session) && row.closed === null) {
        this.db.prepare('UPDATE views SET closed=?,active_ms=?,counted=? WHERE id=?')
          .run(this.now(), Number.isSafeInteger(data.activeMs) ? data.activeMs : null, Number(counted), id);
      }
      this.event(id, 'close', request, data, reason);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { counted, reason };
  }
  dispose() { this.db.close(); }
}
