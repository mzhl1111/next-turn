CREATE TABLE `run_artifacts` (
	`run_id` text NOT NULL,
	`name` text NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`media_type` text NOT NULL,
	`visibility` text NOT NULL,
	PRIMARY KEY(`run_id`, `name`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_events_sequence_unique` ON `run_events` (`run_id`,`sequence`);--> statement-breakpoint
ALTER TABLE `runs` ADD `schema_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `import_key` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `scenario_id` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `outcome` text;--> statement-breakpoint
CREATE UNIQUE INDEX `runs_import_key_unique` ON `runs` (`import_key`);