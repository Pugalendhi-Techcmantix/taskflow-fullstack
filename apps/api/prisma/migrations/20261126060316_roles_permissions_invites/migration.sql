-- Module 2: roles, permissions and invites.
-- Hand-edited so it works on a database that already has users:
-- roles are inserted first, existing users get a role, and only then is role_id made required.

-- 1. Lookup tables ------------------------------------------------------------
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Default data (matches packages/core/src/access.ts and the prototype) -----
INSERT INTO "roles" ("id", "name", "sort_order") VALUES
    ('admin', 'Admin', 1),
    ('project_manager', 'Project Manager', 2),
    ('developer', 'Developer', 3),
    ('viewer', 'Viewer', 4);

INSERT INTO "permissions" ("key", "label", "sort_order") VALUES
    ('project:create', 'Create projects', 1),
    ('project:update', 'Edit project settings', 2),
    ('project:delete', 'Delete projects', 3),
    ('sprint:manage', 'Create, start & complete sprints', 4),
    ('task:create', 'Create tasks', 5),
    ('task:update', 'Edit tasks', 6),
    ('task:move', 'Move cards on the board', 7),
    ('task:delete', 'Delete tasks', 8),
    ('comment:create', 'Comment on tasks', 9),
    ('user:manage', 'Invite & manage members', 10),
    ('role:manage', 'Edit roles & permissions', 11);

-- Admin: everything
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT 'admin', "key" FROM "permissions";

-- Project Manager
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
    ('project_manager', 'project:create'),
    ('project_manager', 'project:update'),
    ('project_manager', 'sprint:manage'),
    ('project_manager', 'task:create'),
    ('project_manager', 'task:update'),
    ('project_manager', 'task:move'),
    ('project_manager', 'task:delete'),
    ('project_manager', 'comment:create');

-- Developer
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
    ('developer', 'task:create'),
    ('developer', 'task:update'),
    ('developer', 'task:move'),
    ('developer', 'comment:create');

-- Viewer: nothing (read-only)

-- 3. Give every existing user a role: the oldest account becomes Admin, the rest Viewer
ALTER TABLE "users" ADD COLUMN "role_id" TEXT;
UPDATE "users" SET "role_id" = 'viewer';
UPDATE "users" SET "role_id" = 'admin'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC, "id" ASC LIMIT 1);
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Invites -----------------------------------------------------------------
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");
CREATE INDEX "invites_email_idx" ON "invites"("email");
ALTER TABLE "invites" ADD CONSTRAINT "invites_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
