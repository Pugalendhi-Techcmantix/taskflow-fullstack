-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "project_id" UUID,
    "task_id" UUID,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_created_at_id_idx" ON "activity_logs"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_project_id_created_at_idx" ON "activity_logs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_task_id_created_at_idx" ON "activity_logs"("task_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_created_at_idx" ON "activity_logs"("actor_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-added rules the database enforces by itself (the API validates too):
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_type_valid" CHECK ("type" IN ('task', 'sprint', 'project', 'comment', 'user'));
-- The action belongs to its type: task.* and subtask.* are task events, sprint.* sprint events, and so on.
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_action_matches_type" CHECK (
  ("type" = 'task' AND ("action" LIKE 'task.%' OR "action" LIKE 'subtask.%'))
  OR ("type" <> 'task' AND "action" LIKE "type" || '.%')
);
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_data_is_object" CHECK (jsonb_typeof("data") = 'object');