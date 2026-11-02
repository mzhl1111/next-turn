CREATE TABLE IF NOT EXISTS `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL
);
