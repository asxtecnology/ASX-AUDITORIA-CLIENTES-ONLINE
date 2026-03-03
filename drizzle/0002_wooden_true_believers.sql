CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`loja_ml` varchar(255),
	`link_loja` text,
	`status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
	`total_produtos` int DEFAULT 0,
	`total_violacoes` int DEFAULT 0,
	`ultima_verificacao` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_seller_id_unique` UNIQUE(`seller_id`)
);
--> statement-breakpoint
CREATE TABLE `historico_precos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo_asx` varchar(32) NOT NULL,
	`plataforma` varchar(32) NOT NULL DEFAULT 'mercadolivre',
	`vendedor` varchar(255) NOT NULL,
	`item_id` varchar(64),
	`preco` decimal(10,2) NOT NULL,
	`data_captura` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historico_precos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plataforma` varchar(32) NOT NULL DEFAULT 'mercadolivre',
	`vendedor_id` varchar(64),
	`nome` varchar(255) NOT NULL,
	`cliente_id` int,
	`total_violacoes` int DEFAULT 0,
	`total_anuncios` int DEFAULT 0,
	`primeira_vez` timestamp DEFAULT (now()),
	`ultima_vez` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `monitoring_runs` ADD `plataforma` varchar(32) DEFAULT 'mercadolivre';--> statement-breakpoint
ALTER TABLE `monitoring_runs` ADD `cliente_id` int;--> statement-breakpoint
ALTER TABLE `price_snapshots` ADD `cliente_id` int;--> statement-breakpoint
ALTER TABLE `price_snapshots` ADD `plataforma` varchar(32) DEFAULT 'mercadolivre';--> statement-breakpoint
ALTER TABLE `price_snapshots` ADD `confianca` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `price_snapshots` ADD `metodo_match` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `categoria` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `linha` enum('PREMIUM','PLUS','ECO');--> statement-breakpoint
ALTER TABLE `violations` ADD `cliente_id` int;--> statement-breakpoint
ALTER TABLE `violations` ADD `plataforma` varchar(32) DEFAULT 'mercadolivre';--> statement-breakpoint
ALTER TABLE `violations` ADD `confianca` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `violations` ADD `metodo_match` varchar(64);