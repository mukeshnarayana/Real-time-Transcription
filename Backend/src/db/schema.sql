CREATE TABLE IF NOT EXISTS transcriptions (
  id            SERIAL PRIMARY KEY,
  text          TEXT NOT NULL,
  language_hint VARCHAR(10) NOT NULL DEFAULT 'auto',   -- auto | hi-IN | en-IN
  source        VARCHAR(10) NOT NULL DEFAULT 'live',   -- live | file
  duration_sec  INTEGER,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at
  ON transcriptions (created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transcriptions_updated_at ON transcriptions;
CREATE TRIGGER trg_transcriptions_updated_at
  BEFORE UPDATE ON transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
