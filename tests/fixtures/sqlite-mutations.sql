-- SQLite-friendly mutation fixture
CREATE TABLE "sq_projects" (
  "id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "owner_id" integer NULL,
  "legacy_slug" varchar(255) NULL
);

ALTER TABLE "sq_projects"
  ADD PRIMARY KEY ("id");

ALTER TABLE "sq_projects"
  CHANGE "legacy_slug" "slug" varchar(120) NULL;

ALTER TABLE "sq_projects"
  ADD COLUMN "metadata" json NULL;

ALTER TABLE "sq_projects"
  DROP COLUMN "owner_id";

COMMIT;
