-- Initialization only: inspect user_version and existing tables first.
-- Never execute a contributor-provided schema or reset an existing database.
BEGIN IMMEDIATE;
CREATE TABLE item_records (
  github_host TEXT NOT NULL CHECK (length(github_host) > 0),
  repository TEXT NOT NULL CHECK (length(repository) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('issue', 'pullRequest')),
  number INTEGER NOT NULL CHECK (number > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (github_host, repository, kind, number),
  CHECK (json_extract(payload, '$.schemaVersion') IS 1),
  CHECK (json_extract(payload, '$.repository.githubHost') IS github_host),
  CHECK (json_extract(payload, '$.repository.name') IS repository),
  CHECK (json_extract(payload, '$.item.kind') IS kind),
  CHECK (json_type(payload, '$.item.number') IS 'integer'),
  CHECK (json_extract(payload, '$.item.number') IS number)
);
PRAGMA user_version = 1;
COMMIT;
