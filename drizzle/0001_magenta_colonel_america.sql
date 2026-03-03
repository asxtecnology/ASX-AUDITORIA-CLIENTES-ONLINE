CREATE TABLE `alert_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`notify_on_violation` boolean NOT NULL DEFAULT true,
	`notify_on_run_complete` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `monitoring_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`total_products` int DEFAULT 0,
	`products_found` int DEFAULT 0,
	`violations_found` int DEFAULT 0,
	`error_message` text,
	`triggered_by` enum('scheduled','manual') NOT NULL DEFAULT 'scheduled',
	CONSTRAINT `monitoring_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` int NOT NULL,
	`product_id` int NOT NULL,
	`seller_name` varchar(255) NOT NULL,
	`seller_id` varchar(64),
	`ml_item_id` varchar(64),
	`ml_title` text,
	`ml_url` text,
	`ml_thumbnail` text,
	`preco_anunciado` decimal(10,2) NOT NULL,
	`preco_minimo` decimal(10,2) NOT NULL,
	`is_violation` boolean NOT NULL DEFAULT false,
	`validation_reason` varchar(255),
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(32) NOT NULL,
	`descricao` text NOT NULL,
	`ean` varchar(20),
	`unidade` varchar(10),
	`caixa` int,
	`voltagem` varchar(20),
	`ncm` varchar(20),
	`preco_custo` decimal(10,2) NOT NULL,
	`preco_minimo` decimal(10,2) NOT NULL,
	`margem_percent` decimal(5,2) NOT NULL DEFAULT '60.00',
	`status_base` varchar(20) DEFAULT 'ATIVO',
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_codigo_unique` UNIQUE(`codigo`)
);
--> statement-breakpoint
CREATE TABLE `violations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshot_id` int NOT NULL,
	`run_id` int NOT NULL,
	`product_id` int NOT NULL,
	`seller_name` varchar(255) NOT NULL,
	`seller_id` varchar(64),
	`ml_item_id` varchar(64),
	`ml_url` text,
	`ml_thumbnail` text,
	`ml_title` text,
	`preco_anunciado` decimal(10,2) NOT NULL,
	`preco_minimo` decimal(10,2) NOT NULL,
	`diferenca` decimal(10,2) NOT NULL,
	`percent_abaixo` decimal(5,2) NOT NULL,
	`status` enum('open','notified','resolved') NOT NULL DEFAULT 'open',
	`notified_at` timestamp,
	`resolved_at` timestamp,
	`detected_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `violations_id` PRIMARY KEY(`id`)
);
