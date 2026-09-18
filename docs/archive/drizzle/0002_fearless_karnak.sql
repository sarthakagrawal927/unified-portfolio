-- Pre-launch schema change. Refuses populated single-owner tables; never assigns existing data to a new user.
ALTER TABLE "auth_records" ADD COLUMN "userId" text;
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "userId" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "daily_snapshots" ADD COLUMN "userId" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "userId" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "userId" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "connections" DROP CONSTRAINT "connections_pkey";
--> statement-breakpoint
ALTER TABLE "daily_snapshots" DROP CONSTRAINT "daily_snapshots_pkey";
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_userId_id_pk" PRIMARY KEY("userId","id");
--> statement-breakpoint
ALTER TABLE "daily_snapshots" ADD CONSTRAINT "daily_snapshots_userId_day_pk" PRIMARY KEY("userId","day");
