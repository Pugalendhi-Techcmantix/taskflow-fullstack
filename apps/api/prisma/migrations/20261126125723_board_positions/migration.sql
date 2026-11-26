-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "position" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "tasks_project_id_sprint_id_status_position_idx" ON "tasks"("project_id", "sprint_id", "status", "position");

-- Hand-added: give existing tasks a board order (oldest first, 1024 apart) inside each column (project + sprint + status).
UPDATE "tasks" AS t
SET "position" = ranked.rn * 1024
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "project_id", "sprint_id", "status" ORDER BY "number") AS rn
  FROM "tasks"
) AS ranked
WHERE ranked."id" = t."id";
