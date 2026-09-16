-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "DataRegion" AS ENUM ('EU', 'US', 'AFRICA', 'APAC', 'LATAM');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'STARTER', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'ORG', 'TEAM', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('MEMBER', 'GUEST', 'CLIENT', 'VENDOR', 'AGENT', 'SERVICE_ACCOUNT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PresenceState" AS ENUM ('ONLINE', 'AWAY', 'BUSY', 'IN_MEETING', 'FOCUS', 'DND', 'OFFLINE');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('LEAD', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('ORG', 'WORKSPACE', 'TEAM', 'PROJECT', 'OBJECT');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('VIEW', 'COMMENT', 'EDIT', 'MANAGE', 'OWNER');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CheckpointPolicy" AS ENUM ('NEVER', 'SENSITIVE_ONLY', 'ALWAYS');

-- CreateEnum
CREATE TYPE "CheckpointState" AS ENUM ('WAITING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOWEST', 'LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('WORKSPACE', 'PROJECT', 'SPRINT', 'CHANNEL', 'DATABASE', 'PORTFOLIO', 'GOAL', 'PIPELINE', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('ASSIGNEE', 'REVIEWER', 'APPROVER', 'FOLLOWER', 'WATCHER');

-- CreateEnum
CREATE TYPE "EdgeRelation" AS ENUM ('BLOCKS', 'BLOCKED_BY', 'DUPLICATES', 'RELATES_TO', 'DERIVED_FROM', 'CONVERTED_TO', 'PARENT_OF', 'MENTIONS', 'ATTACHED_TO', 'OWNS', 'DISCUSSED_IN', 'DECIDED_IN', 'RESULTED_IN', 'FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('SEQUENTIAL', 'PARALLEL', 'QUORUM');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DELEGATED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('TEXT', 'FORUM', 'VOICE', 'STAGE', 'ANNOUNCEMENT', 'DM', 'GROUP_DM');

-- CreateEnum
CREATE TYPE "ChannelRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'VOICE', 'VIDEO', 'FILE', 'SYSTEM', 'CANVAS', 'POLL');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'IMAP', 'ORYON');

-- CreateEnum
CREATE TYPE "EmailState" AS ENUM ('OPEN', 'SNOOZED', 'ARCHIVED', 'SPAM');

-- CreateEnum
CREATE TYPE "TriageBucket" AS ENUM ('URGENT', 'ACTION_NEEDED', 'FYI', 'ROUTINE', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('ORYON', 'ZOOM', 'TEAMS', 'MEET', 'WEBEX', 'SIP');

-- CreateEnum
CREATE TYPE "MeetingState" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingRole" AS ENUM ('ORGANIZER', 'COHOST', 'PRESENTER', 'ATTENDEE', 'OBSERVER');

-- CreateEnum
CREATE TYPE "RsvpState" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('RECORDING', 'TRANSCRIPT', 'NOTES', 'SUMMARY', 'DECISIONS', 'TASKS', 'DOCUMENT', 'WHITEBOARD', 'CHAT_LOG', 'AI_REPORT', 'CLIP');

-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('DOC', 'WIKI', 'SOP', 'MEETING_NOTES', 'POSTMORTEM', 'TEMPLATE', 'KB_ARTICLE');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('BOARD', 'KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'WORKLOAD', 'CAPACITY', 'MATRIX', 'GALLERY', 'MAP', 'MIND_MAP', 'HILL_CHART', 'BURNDOWN', 'BURNUP', 'CUMULATIVE_FLOW', 'PORTFOLIO', 'CHART', 'FORM');

-- CreateEnum
CREATE TYPE "ViewScope" AS ENUM ('PERSONAL', 'TEAM', 'SHARED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RunState" AS ENUM ('RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('EVENT', 'SCHEDULE', 'MANUAL', 'MENTION', 'WEBHOOK', 'FORM');

-- CreateEnum
CREATE TYPE "AuditDecision" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryDomain" TEXT,
    "dataRegion" "DataRegion" NOT NULL DEFAULT 'EU',
    "reporting_currency" TEXT NOT NULL DEFAULT 'USD',
    "default_locale" TEXT NOT NULL DEFAULT 'pt-MZ',
    "default_timezone" TEXT NOT NULL DEFAULT 'Africa/Maputo',
    "plan" "PlanTier" NOT NULL DEFAULT 'TRIAL',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'ORG',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "job_title" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Maputo',
    "locale" TEXT NOT NULL DEFAULT 'pt-MZ',
    "working_hours" JSONB,
    "type" "PrincipalType" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "manager_id" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "presence" "PresenceState" NOT NULL DEFAULT 'OFFLINE',
    "status_emoji" TEXT,
    "status_text" TEXT,
    "status_expires_at" TIMESTAMP(3),
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parent_team_id" TEXT,
    "lead_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatar_url" TEXT,
    "principal_id" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "model_policy_id" TEXT,
    "knowledge_scope" JSONB NOT NULL DEFAULT '{}',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "schedule" TEXT,
    "checkpoint_policy" "CheckpointPolicy" NOT NULL DEFAULT 'SENSITIVE_ONLY',
    "budget_cap_cents" BIGINT,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_bindings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" TEXT,
    "granted_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "principal_id" TEXT,
    "team_id" TEXT,
    "external_email" TEXT,
    "level" "AccessLevel" NOT NULL,
    "field_mask" TEXT[],
    "granted_by" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_labels" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "blocks_external" BOOLEAN NOT NULL DEFAULT false,
    "blocks_ai" BOOLEAN NOT NULL DEFAULT false,
    "blocks_download" BOOLEAN NOT NULL DEFAULT false,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "retention_days" INTEGER,

    CONSTRAINT "classification_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_type_defs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plural_name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "id_prefix" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "status_model" JSONB NOT NULL DEFAULT '{}',
    "default_views" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "object_type_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_objects" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "type_key" TEXT NOT NULL,
    "type_def_id" TEXT NOT NULL,
    "human_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "status_category" "StatusCategory" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "owner_id" TEXT,
    "parent_object_id" TEXT,
    "start_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "estimate_minutes" INTEGER,
    "actual_minutes" INTEGER,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "money_amount" DECIMAL(19,4),
    "money_currency" TEXT,
    "probability" INTEGER,
    "secondary_date" TIMESTAMP(3),
    "external_ref" TEXT,
    "severity" INTEGER,
    "classification" TEXT,
    "tags" TEXT[],
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "search_vector" tsvector,
    "embedding" vector(1536),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "work_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_placements" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "container_type" "ContainerType" NOT NULL,
    "container_id" TEXT NOT NULL,
    "section_id" TEXT,
    "position" DECIMAL(20,10) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "object_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "user_id" TEXT,
    "agent_id" TEXT,
    "role" "AssignmentRole" NOT NULL DEFAULT 'ASSIGNEE',
    "allocation" INTEGER,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "from_type" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_type" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "relation" "EdgeRelation" NOT NULL,
    "lag_days" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_transitions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_type" "PrincipalType" NOT NULL,
    "comment" TEXT,
    "duration_ms" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "author_id" TEXT NOT NULL,
    "author_type" "PrincipalType" NOT NULL DEFAULT 'MEMBER',
    "body_json" JSONB NOT NULL,
    "body_text" TEXT NOT NULL,
    "mentions" TEXT[],
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "anchor_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" TEXT,
    "folder_id" TEXT,
    "tags" TEXT[],
    "classification" TEXT,
    "ocr_text" TEXT,
    "embedding" vector(1536),
    "license_expires_at" TIMESTAMP(3),
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "object_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "mode" "ApprovalMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "quorum" INTEGER,
    "approver_id" TEXT,
    "approver_team_id" TEXT,
    "delegated_to_id" TEXT,
    "state" "ApprovalState" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "signature_id" TEXT,
    "due_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "minutes" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "rate_amount" DECIMAL(19,4),
    "rate_currency" TEXT,
    "note" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "purpose" TEXT,
    "kind" "ChannelKind" NOT NULL DEFAULT 'TEXT',
    "visibility" "Visibility" NOT NULL DEFAULT 'ORG',
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "shared_with_org_ids" TEXT[],
    "linked_object_id" TEXT,
    "sla_minutes" INTEGER,
    "retention_days" INTEGER,
    "ai_excluded" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChannelRole" NOT NULL DEFAULT 'MEMBER',
    "last_read_at" TIMESTAMP(3),
    "notification" "NotificationLevel" NOT NULL DEFAULT 'MENTIONS',
    "muted_until" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "author_id" TEXT NOT NULL,
    "author_type" "PrincipalType" NOT NULL DEFAULT 'MEMBER',
    "body_json" JSONB NOT NULL,
    "body_text" TEXT NOT NULL,
    "mentions" TEXT[],
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "media_file_id" TEXT,
    "transcript" TEXT,
    "source_locale" TEXT,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "pinned_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "message_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "address" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "oauth_ref" TEXT NOT NULL,
    "sync_cursor" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "signature_html" TEXT,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "participants" TEXT[],
    "labels" TEXT[],
    "triage_bucket" "TriageBucket",
    "triage_reason" TEXT,
    "assignee_id" TEXT,
    "state" "EmailState" NOT NULL DEFAULT 'OPEN',
    "snoozed_until" TIMESTAMP(3),
    "linked_object_id" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "object_id" TEXT,
    "title" TEXT NOT NULL,
    "agenda_json" JSONB NOT NULL DEFAULT '[]',
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "room_id" TEXT,
    "join_url" TEXT NOT NULL,
    "provider" "MeetingProvider" NOT NULL DEFAULT 'ORYON',
    "external_ref" TEXT,
    "recurrence_rule" TEXT,
    "e2ee" BOOLEAN NOT NULL DEFAULT false,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_disabled_at" TIMESTAMP(3),
    "estimated_cost_cents" BIGINT,
    "effectiveness_score" INTEGER,
    "state" "MeetingState" NOT NULL DEFAULT 'SCHEDULED',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "role" "MeetingRole" NOT NULL DEFAULT 'ATTENDEE',
    "rsvp" "RsvpState" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "talk_time_ms" BIGINT,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_artifacts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "file_id" TEXT,
    "page_id" TEXT,
    "content_json" JSONB,
    "transcript" TEXT,
    "language" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "building_id" TEXT,
    "floor" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "equipment" TEXT[],
    "device_id" TEXT,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "readiness_json" JSONB,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "parent_page_id" TEXT,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "cover_url" TEXT,
    "content_yjs" BYTEA,
    "content_json" JSONB,
    "content_text" TEXT,
    "kind" "PageKind" NOT NULL DEFAULT 'DOC',
    "owner_id" TEXT,
    "classification" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "review_every_days" INTEGER,
    "next_review_at" TIMESTAMP(3),
    "published_slug" TEXT,
    "published_at" TIMESTAMP(3),
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "position" DECIMAL(20,10) NOT NULL,
    "search_vector" tsvector,
    "embedding" vector(1536),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_versions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" BYTEA NOT NULL,
    "author_id" TEXT NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "databases" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "sync_source" JSONB,
    "row_security" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_records" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "database_id" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "position" DECIMAL(20,10) NOT NULL,
    "embedding" vector(1536),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "data_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "view_type" "ViewType" NOT NULL,
    "container_type" "ContainerType" NOT NULL,
    "container_id" TEXT NOT NULL,
    "database_id" TEXT,
    "filters" JSONB NOT NULL DEFAULT '[]',
    "sorts" JSONB NOT NULL DEFAULT '[]',
    "grouping" JSONB,
    "visible_fields" TEXT[],
    "scope" "ViewScope" NOT NULL DEFAULT 'PERSONAL',
    "owner_id" TEXT,
    "query" TEXT,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_json" JSONB NOT NULL,
    "steps_json" JSONB NOT NULL,
    "state" "WorkflowState" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "trigger_event_id" TEXT,
    "input_json" JSONB NOT NULL,
    "step_log_json" JSONB NOT NULL DEFAULT '[]',
    "state" "RunState" NOT NULL DEFAULT 'RUNNING',
    "error_json" JSONB,
    "waiting_on_approval_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_id" TEXT,
    "actor_type" "PrincipalType" NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "causation_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "triggered_by" TEXT,
    "trigger_type" "TriggerType" NOT NULL,
    "input_json" JSONB NOT NULL,
    "steps_json" JSONB NOT NULL DEFAULT '[]',
    "tool_calls_json" JSONB NOT NULL DEFAULT '[]',
    "read_resources" JSONB NOT NULL DEFAULT '[]',
    "written_resources" JSONB NOT NULL DEFAULT '[]',
    "output_json" JSONB,
    "state" "RunState" NOT NULL DEFAULT 'RUNNING',
    "checkpoint_state" "CheckpointState",
    "checkpoint_approver_id" TEXT,
    "model_key" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost_cents" BIGINT,
    "rollback_token" TEXT,
    "rolled_back_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_policies" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routing_rules" JSONB NOT NULL,
    "allowed_models" TEXT[],
    "fallback_model" TEXT NOT NULL,
    "max_classification" TEXT,
    "residency_region" "DataRegion",
    "monthly_cap_cents" BIGINT,

    CONSTRAINT "model_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" "PrincipalType" NOT NULL,
    "on_behalf_of_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "decision" "AuditDecision" NOT NULL DEFAULT 'ALLOW',
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "deliver_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channels" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "workspaces_org_id_idx" ON "workspaces"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_org_id_key_key" ON "workspaces"("org_id", "key");

-- CreateIndex
CREATE INDEX "users_org_id_status_idx" ON "users"("org_id", "status");

-- CreateIndex
CREATE INDEX "users_org_id_manager_id_idx" ON "users"("org_id", "manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users"("org_id", "email");

-- CreateIndex
CREATE INDEX "teams_org_id_parent_team_id_idx" ON "teams"("org_id", "parent_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_org_id_slug_key" ON "teams"("org_id", "slug");

-- CreateIndex
CREATE INDEX "team_members_org_id_user_id_idx" ON "team_members"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "agents_org_id_status_idx" ON "agents"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agents_org_id_key_key" ON "agents"("org_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_org_id_key_key" ON "roles"("org_id", "key");

-- CreateIndex
CREATE INDEX "role_bindings_org_id_principal_id_idx" ON "role_bindings"("org_id", "principal_id");

-- CreateIndex
CREATE INDEX "role_bindings_org_id_expires_at_idx" ON "role_bindings"("org_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_bindings_role_id_principal_id_scope_type_scope_id_key" ON "role_bindings"("role_id", "principal_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "access_grants_org_id_resource_type_resource_id_idx" ON "access_grants"("org_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "access_grants_org_id_principal_id_idx" ON "access_grants"("org_id", "principal_id");

-- CreateIndex
CREATE INDEX "access_grants_org_id_expires_at_idx" ON "access_grants"("org_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "classification_labels_org_id_key_key" ON "classification_labels"("org_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "object_type_defs_org_id_key_key" ON "object_type_defs"("org_id", "key");

-- CreateIndex
CREATE INDEX "work_objects_org_id_type_key_status_category_idx" ON "work_objects"("org_id", "type_key", "status_category");

-- CreateIndex
CREATE INDEX "work_objects_org_id_owner_id_due_at_idx" ON "work_objects"("org_id", "owner_id", "due_at");

-- CreateIndex
CREATE INDEX "work_objects_org_id_workspace_id_updated_at_idx" ON "work_objects"("org_id", "workspace_id", "updated_at");

-- CreateIndex
CREATE INDEX "work_objects_org_id_parent_object_id_idx" ON "work_objects"("org_id", "parent_object_id");

-- CreateIndex
CREATE INDEX "work_objects_org_id_external_ref_idx" ON "work_objects"("org_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "work_objects_org_id_human_id_key" ON "work_objects"("org_id", "human_id");

-- CreateIndex
CREATE INDEX "object_placements_org_id_container_type_container_id_positi_idx" ON "object_placements"("org_id", "container_type", "container_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "object_placements_object_id_container_type_container_id_key" ON "object_placements"("object_id", "container_type", "container_id");

-- CreateIndex
CREATE INDEX "assignments_org_id_user_id_idx" ON "assignments"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_object_id_user_id_role_key" ON "assignments"("object_id", "user_id", "role");

-- CreateIndex
CREATE INDEX "edges_org_id_from_type_from_id_relation_idx" ON "edges"("org_id", "from_type", "from_id", "relation");

-- CreateIndex
CREATE INDEX "edges_org_id_to_type_to_id_relation_idx" ON "edges"("org_id", "to_type", "to_id", "relation");

-- CreateIndex
CREATE UNIQUE INDEX "edges_from_type_from_id_to_type_to_id_relation_key" ON "edges"("from_type", "from_id", "to_type", "to_id", "relation");

-- CreateIndex
CREATE INDEX "status_transitions_org_id_object_id_created_at_idx" ON "status_transitions"("org_id", "object_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_org_id_target_type_target_id_created_at_idx" ON "comments"("org_id", "target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "file_assets_org_id_folder_id_idx" ON "file_assets"("org_id", "folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_org_id_checksum_sha256_version_key" ON "file_assets"("org_id", "checksum_sha256", "version");

-- CreateIndex
CREATE INDEX "attachments_org_id_target_type_target_id_idx" ON "attachments"("org_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_file_id_target_type_target_id_key" ON "attachments"("file_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "approvals_org_id_approver_id_state_idx" ON "approvals"("org_id", "approver_id", "state");

-- CreateIndex
CREATE INDEX "approvals_org_id_object_id_step_index_idx" ON "approvals"("org_id", "object_id", "step_index");

-- CreateIndex
CREATE INDEX "time_entries_org_id_user_id_started_at_idx" ON "time_entries"("org_id", "user_id", "started_at");

-- CreateIndex
CREATE INDEX "time_entries_org_id_object_id_idx" ON "time_entries"("org_id", "object_id");

-- CreateIndex
CREATE INDEX "channels_org_id_kind_archived_at_idx" ON "channels"("org_id", "kind", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "channels_org_id_key_key" ON "channels"("org_id", "key");

-- CreateIndex
CREATE INDEX "channel_members_org_id_user_id_idx" ON "channel_members"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channel_id_user_id_key" ON "channel_members"("channel_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_org_id_channel_id_created_at_idx" ON "messages"("org_id", "channel_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_org_id_parent_id_idx" ON "messages"("org_id", "parent_id");

-- CreateIndex
CREATE INDEX "messages_org_id_scheduled_for_idx" ON "messages"("org_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "reactions_org_id_target_type_target_id_idx" ON "reactions"("org_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_target_type_target_id_user_id_emoji_key" ON "reactions"("target_type", "target_id", "user_id", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_org_id_address_key" ON "email_accounts"("org_id", "address");

-- CreateIndex
CREATE INDEX "email_threads_org_id_account_id_last_message_at_idx" ON "email_threads"("org_id", "account_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "email_threads_org_id_assignee_id_state_idx" ON "email_threads"("org_id", "assignee_id", "state");

-- CreateIndex
CREATE INDEX "meetings_org_id_start_at_idx" ON "meetings"("org_id", "start_at");

-- CreateIndex
CREATE INDEX "meetings_org_id_state_idx" ON "meetings"("org_id", "state");

-- CreateIndex
CREATE INDEX "meeting_participants_org_id_user_id_idx" ON "meeting_participants"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meeting_id_user_id_key" ON "meeting_participants"("meeting_id", "user_id");

-- CreateIndex
CREATE INDEX "meeting_artifacts_org_id_meeting_id_kind_idx" ON "meeting_artifacts"("org_id", "meeting_id", "kind");

-- CreateIndex
CREATE INDEX "rooms_org_id_building_id_idx" ON "rooms"("org_id", "building_id");

-- CreateIndex
CREATE INDEX "pages_org_id_parent_page_id_position_idx" ON "pages"("org_id", "parent_page_id", "position");

-- CreateIndex
CREATE INDEX "pages_org_id_next_review_at_idx" ON "pages"("org_id", "next_review_at");

-- CreateIndex
CREATE UNIQUE INDEX "pages_org_id_published_slug_key" ON "pages"("org_id", "published_slug");

-- CreateIndex
CREATE INDEX "page_versions_org_id_page_id_version_idx" ON "page_versions"("org_id", "page_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "page_versions_page_id_version_key" ON "page_versions"("page_id", "version");

-- CreateIndex
CREATE INDEX "databases_org_id_workspace_id_idx" ON "databases"("org_id", "workspace_id");

-- CreateIndex
CREATE INDEX "data_records_org_id_database_id_position_idx" ON "data_records"("org_id", "database_id", "position");

-- CreateIndex
CREATE INDEX "saved_views_org_id_container_type_container_id_idx" ON "saved_views"("org_id", "container_type", "container_id");

-- CreateIndex
CREATE INDEX "workflows_org_id_state_idx" ON "workflows"("org_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_org_id_key_version_key" ON "workflows"("org_id", "key", "version");

-- CreateIndex
CREATE INDEX "workflow_runs_org_id_workflow_id_started_at_idx" ON "workflow_runs"("org_id", "workflow_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_runs_org_id_state_idx" ON "workflow_runs"("org_id", "state");

-- CreateIndex
CREATE INDEX "domain_events_org_id_name_created_at_idx" ON "domain_events"("org_id", "name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "domain_events_org_id_subject_type_subject_id_created_at_idx" ON "domain_events"("org_id", "subject_type", "subject_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "domain_events_correlation_id_idx" ON "domain_events"("correlation_id");

-- CreateIndex
CREATE INDEX "domain_events_published_at_idx" ON "domain_events"("published_at");

-- CreateIndex
CREATE INDEX "agent_runs_org_id_agent_id_started_at_idx" ON "agent_runs"("org_id", "agent_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "agent_runs_org_id_state_idx" ON "agent_runs"("org_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "model_policies_org_id_key_key" ON "model_policies"("org_id", "key");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_id_resource_type_resource_id_created_at_idx" ON "audit_logs"("org_id", "resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_id_actor_id_created_at_idx" ON "audit_logs"("org_id", "actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_org_id_user_id_read_at_deliver_at_idx" ON "notifications"("org_id", "user_id", "read_at", "deliver_at" DESC);

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_team_id_fkey" FOREIGN KEY ("parent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_model_policy_id_fkey" FOREIGN KEY ("model_policy_id") REFERENCES "model_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_bindings" ADD CONSTRAINT "role_bindings_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_bindings" ADD CONSTRAINT "role_bindings_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_labels" ADD CONSTRAINT "classification_labels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "object_type_defs" ADD CONSTRAINT "object_type_defs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_objects" ADD CONSTRAINT "work_objects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_objects" ADD CONSTRAINT "work_objects_type_def_id_fkey" FOREIGN KEY ("type_def_id") REFERENCES "object_type_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_objects" ADD CONSTRAINT "work_objects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_objects" ADD CONSTRAINT "work_objects_parent_object_id_fkey" FOREIGN KEY ("parent_object_id") REFERENCES "work_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "object_placements" ADD CONSTRAINT "object_placements_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "work_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_artifacts" ADD CONSTRAINT "meeting_artifacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_artifacts" ADD CONSTRAINT "meeting_artifacts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_page_id_fkey" FOREIGN KEY ("parent_page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_database_id_fkey" FOREIGN KEY ("database_id") REFERENCES "databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_database_id_fkey" FOREIGN KEY ("database_id") REFERENCES "databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation for every table that carries org_id.
DO $$
DECLARE
	row_record record;
BEGIN
	FOR row_record IN
		SELECT DISTINCT c.table_schema, c.table_name
		FROM information_schema.columns c
		WHERE c.table_schema = 'public'
			AND c.column_name = 'org_id'
			AND c.table_name <> '_prisma_migrations'
		ORDER BY c.table_name
	LOOP
		EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', row_record.table_schema, row_record.table_name);
		EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', row_record.table_schema, row_record.table_name);
		EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', row_record.table_schema, row_record.table_name);
		EXECUTE format(
			'CREATE POLICY tenant_isolation ON %I.%I USING (org_id = current_setting(''app.org_id'', true)) WITH CHECK (org_id = current_setting(''app.org_id'', true))',
			row_record.table_schema,
			row_record.table_name
		);
	END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.organizations;
CREATE POLICY tenant_isolation ON public.organizations
	USING (id = current_setting('app.org_id', true))
	WITH CHECK (id = current_setting('app.org_id', true));
