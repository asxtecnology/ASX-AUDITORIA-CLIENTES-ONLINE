CREATE TABLE `alert_configs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` int,
	`emailsDestinatarios` text,
	`frequencia` varchar(50) DEFAULT 'immediate',
	`minViolacoes` int DEFAULT 1,
	`incluirResumo` boolean DEFAULT true,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`email` varchar(255),
	`telefone` varchar(50),
	`lojaML` varchar(255),
	`sellerId` varchar(64) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'ativo',
	`totalProdutos` int DEFAULT 0,
	`totalViolacoes` int DEFAULT 0,
	`ultimaVerificacao` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_sellerId_unique` UNIQUE(`sellerId`)
);
--> statement-breakpoint
CREATE TABLE `historico_precos` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`codigo_asx` varchar(32) NOT NULL,
	`item_id` varchar(64),
	`vendedor` varchar(255) NOT NULL,
	`preco` decimal(10,2) NOT NULL,
	`plataforma` varchar(50) NOT NULL DEFAULT 'mercadolivre',
	`data_captura` date NOT NULL,
	CONSTRAINT `historico_precos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monitoring_runs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`clienteId` int,
	`plataforma` varchar(50) DEFAULT 'mercadolivre',
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`totalFound` int DEFAULT 0,
	`totalViolations` int DEFAULT 0,
	`triggeredBy` varchar(50) NOT NULL DEFAULT 'scheduled',
	`errorMessage` text,
	CONSTRAINT `monitoring_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`clienteId` int,
	`runId` int NOT NULL,
	`mlItemId` varchar(50),
	`mlTitle` text,
	`mlUrl` text,
	`mlThumbnail` text,
	`sellerId` varchar(50),
	`sellerName` varchar(200),
	`precoAnunciado` decimal(10,2) NOT NULL,
	`precoMinimo` decimal(10,2),
	`plataforma` varchar(50) DEFAULT 'mercadolivre',
	`isViolation` boolean DEFAULT false,
	`metodoMatch` varchar(50),
	`confianca` int DEFAULT 0,
	`validationReason` text,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`codigo` varchar(32) NOT NULL,
	`descricao` text NOT NULL,
	`ean` varchar(20),
	`categoria` varchar(64),
	`linha` varchar(64),
	`precoCusto` decimal(10,2) NOT NULL DEFAULT '0',
	`precoMinimo` decimal(10,2) NOT NULL DEFAULT '0',
	`margemPercent` decimal(5,2) NOT NULL DEFAULT '60',
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_codigo_unique` UNIQUE(`codigo`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` varchar(10) NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `vendedores` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`cliente_id` int,
	`vendedor_id` varchar(100),
	`nome` varchar(200) NOT NULL,
	`plataforma` varchar(50) NOT NULL DEFAULT 'mercadolivre',
	`total_anuncios` int DEFAULT 0,
	`total_violacoes` int DEFAULT 0,
	`primeira_vez` timestamp DEFAULT (now()),
	`ultima_vez` timestamp DEFAULT (now()),
	CONSTRAINT `vendedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `violations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`productId` int,
	`clienteId` int,
	`runId` int,
	`snapshotId` int,
	`mlItemId` varchar(50),
	`mlTitle` text,
	`mlUrl` text,
	`mlThumbnail` text,
	`sellerId` varchar(50),
	`sellerName` varchar(200),
	`precoAnunciado` decimal(10,2),
	`precoMinimo` decimal(10,2),
	`diferenca` decimal(10,2),
	`percentAbaixo` decimal(5,2),
	`plataforma` varchar(50) DEFAULT 'mercadolivre',
	`metodoMatch` varchar(50),
	`confianca` int DEFAULT 0,
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`detected_at` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedBy` varchar(200),
	`notes` text,
	CONSTRAINT `violations_id` PRIMARY KEY(`id`)
);
