CREATE TABLE "auth_records" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'NEEDS_LOGIN' NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"credentials" text,
	"generation" integer DEFAULT 0 NOT NULL,
	"lastAttemptAt" timestamp with time zone,
	"lastSuccessAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"errorCode" text,
	"leaseUntil" timestamp with time zone,
	"activeSnapshotId" text
);
--> statement-breakpoint
CREATE TABLE "daily_snapshots" (
	"day" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"asOf" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"durationMs" integer NOT NULL,
	"success" boolean NOT NULL,
	"errorCode" text,
	"version" text
);
--> statement-breakpoint
CREATE INDEX "snapshot_provider_time" ON "snapshots" USING btree ("provider","asOf");