CREATE TABLE `google_credentials` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_identifier` varchar(255) NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `google_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`proposal_type` varchar(20) NOT NULL,
	`prospect_name` varchar(255) NOT NULL,
	`prospect_email` varchar(255),
	`prospect_linkedin` varchar(500),
	`prospect_company` varchar(255),
	`selected_offerings` json,
	`suggested_angle` text,
	`include_overview` boolean DEFAULT false,
	`include_case_studies` boolean DEFAULT false,
	`other_notes` text,
	`research_notes` text,
	`generated_pptd_path` varchar(500),
	`google_slides_url` varchar(500),
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `slide_library` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`deck_name` varchar(255) NOT NULL,
	`page_number` varchar(10) NOT NULL,
	`page_content` text NOT NULL,
	`preview_image_path` varchar(500),
	`slide_title` varchar(255),
	`slide_content` text,
	`offering_tags` json,
	`sector_tags` json,
	`is_global` boolean DEFAULT false,
	`is_template` boolean DEFAULT false,
	`created_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `slide_library_id` PRIMARY KEY(`id`)
);
