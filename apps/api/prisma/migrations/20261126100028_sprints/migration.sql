-- CreateTable
CREATE TABLE "sprints" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sprints_project_id_status_idx" ON "sprints"("project_id", "status");

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added rules the database enforces by itself (the API validates too):
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_status_valid" CHECK ("status" IN ('planned', 'active', 'completed'));
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_dates_in_order" CHECK ("end_date" >= "start_date");
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_name_length" CHECK (char_length("name") BETWEEN 1 AND 60);
-- At most ONE active sprint per project, even if two people press "Start" at the same moment.
CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints"("project_id") WHERE "status" = 'active';
