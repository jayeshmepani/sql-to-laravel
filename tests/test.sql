-- COMPREHENSIVE SQL -> LARAVEL MIGRATION FIXTURE
-- Goal: stress the parser and generator across phpMyAdmin-style dumps,
-- sequential DDL mutation, helper detection, special types, relationships,
-- indexes, generated columns, drops, renames, and transaction no-ops.

DROP TABLE IF EXISTS `deleted_shadow_table`, `legacy_members`, `obsolete_logs`, `temp_feature_flags`;
COMMIT;

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `profile_data` json DEFAULT NULL,
  `settings_json` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `chk_users_settings_json` CHECK (json_valid(`settings_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `users_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `users_email_unique` (`email`);

ALTER TABLE `users`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  MODIFY `email` varchar(191) NOT NULL;

CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `guard_name` varchar(50) NOT NULL DEFAULT 'web',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `roles_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `roles_name_guard_name_unique` (`name`, `guard_name`);

ALTER TABLE `roles`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

CREATE TABLE `permissions` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `context` varchar(40) NOT NULL DEFAULT 'api',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `permissions_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `permissions_name_context_unique` (`name`, `context`);

ALTER TABLE `permissions`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

CREATE TABLE `role_user` (
  `id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `assigned_by` bigint unsigned DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `role_user`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `role_user_role_id_user_id_unique` (`role_id`, `user_id`),
  ADD KEY `role_user_assigned_by_foreign` (`assigned_by`);

ALTER TABLE `role_user`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `role_user_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_user_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_user_assigned_by_foreign` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

CREATE TABLE `permission_role` (
  `permission_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `allow` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `permission_role`
  ADD PRIMARY KEY (`permission_id`, `role_id`),
  ADD CONSTRAINT `permission_role_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `permission_role_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

CREATE TABLE `profiles` (
  `id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `preferences` jsonb DEFAULT NULL,
  `bio` mediumtext,
  `status_note` varchar(255) GENERATED ALWAYS AS (concat('status:', coalesce(`avatar_url`, 'none'))) STORED,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `profiles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `profiles_user_id_unique` (`user_id`);

ALTER TABLE `profiles`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

CREATE TABLE `addresses` (
  `id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `line_one` varchar(255) NOT NULL,
  `line_two` varchar(255) DEFAULT NULL,
  `city` varchar(100) NOT NULL,
  `state` varchar(100) DEFAULT NULL,
  `country` varchar(100) NOT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `addresses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `addresses_user_id_foreign` (`user_id`);

ALTER TABLE `addresses`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `addresses_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

CREATE TABLE `posts` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `slug` varchar(180) NOT NULL,
  `title` varchar(255) NOT NULL,
  `excerpt` text,
  `body` longtext NOT NULL,
  `visibility` enum('draft','private','public') NOT NULL DEFAULT 'draft',
  `published_at` timestamp NULL DEFAULT NULL,
  `seo_title` varchar(255) GENERATED ALWAYS AS (upper(`title`)) VIRTUAL,
  `search_body` tsvector DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `posts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `posts_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `posts_slug_unique` (`slug`),
  ADD FULLTEXT KEY `posts_body_fulltext` (`title`, `body`);

ALTER TABLE `posts`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `posts_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

CREATE TABLE `comments` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `commentable_id` bigint unsigned NOT NULL,
  `commentable_type` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `comments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `comments_uuid_unique` (`uuid`),
  ADD KEY `comments_commentable_type_commentable_id_index` (`commentable_type`, `commentable_id`),
  ADD KEY `comments_user_id_foreign` (`user_id`);

ALTER TABLE `comments`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `comments_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

CREATE TABLE `media` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `mediable_id` bigint unsigned DEFAULT NULL,
  `mediable_type` varchar(255) DEFAULT NULL,
  `disk` varchar(50) NOT NULL DEFAULT 'public',
  `path` varchar(255) NOT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `size_bytes` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `media`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `media_uuid_unique` (`uuid`),
  ADD KEY `media_mediable_type_mediable_id_index` (`mediable_type`, `mediable_id`);

ALTER TABLE `media`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

CREATE TABLE `activity_feeds` (
  `id` bigint unsigned NOT NULL,
  `parentable_id` char(36) NOT NULL,
  `parentable_type` varchar(255) NOT NULL,
  `summary` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `activity_feeds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `activity_feeds_parentable_type_parentable_id_index` (`parentable_type`, `parentable_id`);

ALTER TABLE `activity_feeds`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

CREATE TABLE `reactions` (
  `id` bigint unsigned NOT NULL,
  `reactable_id` char(26) DEFAULT NULL,
  `reactable_type` varchar(255) DEFAULT NULL,
  `user_id` bigint unsigned NOT NULL,
  `kind` set('like','love','wow','sad') DEFAULT 'like',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `reactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reactions_reactable_type_reactable_id_index` (`reactable_type`, `reactable_id`);

ALTER TABLE `reactions`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `reactions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

CREATE TABLE `stations` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `owner_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `station_code` varchar(64) NOT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'ACTIVE',
  `network_profile` json DEFAULT NULL,
  `supports_pnc` tinyint(1) NOT NULL DEFAULT '0',
  `supports_v2g` tinyint(1) NOT NULL DEFAULT '0',
  `coordinates` point NOT NULL,
  `coverage_area` polygon DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `stations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `stations_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `stations_station_code_unique` (`station_code`),
  ADD SPATIAL KEY `stations_coordinates_spatial` (`coordinates`);

ALTER TABLE `stations`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `stations_owner_id_foreign` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

CREATE TABLE `connectors` (
  `id` bigint unsigned NOT NULL,
  `station_id` bigint unsigned NOT NULL,
  `connector_code` varchar(32) NOT NULL,
  `power_kw` decimal(8,2) NOT NULL DEFAULT '7.40',
  `raw_payload` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `chk_connectors_payload` CHECK (json_valid(`raw_payload`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `connectors`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `connectors_station_id_connector_code_unique` (`station_id`, `connector_code`);

ALTER TABLE `connectors`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `connectors_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE CASCADE;

CREATE TABLE `charging_sessions` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `connector_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `reservation_id` varchar(40) DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` timestamp NULL DEFAULT NULL,
  `kwh` decimal(10,3) DEFAULT NULL,
  `price_breakdown` json DEFAULT NULL,
  `metadata` jsonb DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `charging_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `charging_sessions_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `charging_sessions_reservation_id_unique` (`reservation_id`),
  ADD KEY `charging_sessions_connector_id_foreign` (`connector_id`);

ALTER TABLE `charging_sessions`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `charging_sessions_connector_id_foreign` FOREIGN KEY (`connector_id`) REFERENCES `connectors` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `charging_sessions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

CREATE TABLE `analytics_snapshots` (
  `id` bigint unsigned NOT NULL,
  `station_id` bigint unsigned NOT NULL,
  `payload` longtext NOT NULL,
  `search_vector` tsvector DEFAULT NULL,
  `embedding` vector(1536) DEFAULT NULL,
  `embedding_sparse` vector(30000) DEFAULT NULL COMMENT 'sparse_embedding',
  `region` geography DEFAULT NULL,
  `client_ip` inet DEFAULT NULL,
  `device_mac` macaddr DEFAULT NULL,
  `captured_at` timestamp with time zone NULL DEFAULT NULL,
  `created_at` timestamp with time zone NULL DEFAULT NULL,
  `updated_at` timestamp with time zone NULL DEFAULT NULL,
  `deleted_at` timestamp with time zone NULL DEFAULT NULL,
  CONSTRAINT `chk_analytics_payload` CHECK (json_valid(`payload`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `analytics_snapshots`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `analytics_snapshots`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `analytics_snapshots_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE CASCADE;

CREATE TABLE `hardware_modules` (
  `id` bigint unsigned NOT NULL,
  `station_id` bigint unsigned NOT NULL,
  `slot` tinyint unsigned NOT NULL DEFAULT '1',
  `module_uid` char(26) NOT NULL,
  `firmware_hash` binary(16) NOT NULL,
  `firmware_signature` blob NOT NULL,
  `specs` json DEFAULT NULL,
  `internal_notes` varchar(255) DEFAULT NULL INVISIBLE,
  `display_name` varchar(255) GENERATED ALWAYS AS (concat('SLOT-', `slot`)) VIRTUAL,
  `slug_lower` varchar(255) GENERATED ALWAYS AS (lower(`module_uid`)) STORED,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `hardware_modules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `hardware_modules_module_uid_unique` (`module_uid`);

ALTER TABLE `hardware_modules`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `hardware_modules_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE CASCADE;

CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `job_batches`
  ADD PRIMARY KEY (`id`);

CREATE TABLE `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `cache`
  ADD PRIMARY KEY (`key`);

CREATE TABLE `legacy_members` (
  `id` bigint unsigned NOT NULL,
  `old_email` varchar(255) NOT NULL,
  `obsolete_token` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `legacy_members`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `legacy_members_old_email_unique` (`old_email`);

ALTER TABLE `legacy_members`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  CHANGE `old_email` `email` varchar(255) NOT NULL,
  ADD COLUMN `uuid` char(36) NOT NULL AFTER `id`,
  ADD UNIQUE KEY `legacy_members_uuid_unique` (`uuid`),
  DROP COLUMN `obsolete_token`;

ALTER TABLE `legacy_members`
  RENAME TO `members`;

ALTER TABLE `members`
  ADD COLUMN `referrer_id` bigint unsigned DEFAULT NULL,
  ADD KEY `members_referrer_id_index` (`referrer_id`),
  ADD CONSTRAINT `members_referrer_id_foreign` FOREIGN KEY (`referrer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

ALTER TABLE `members`
  DROP INDEX `members_referrer_id_index`;

DROP INDEX `permissions_name_context_unique` ON `permissions`;

CREATE TABLE `temp_feature_flags` (
  `id` bigint unsigned NOT NULL,
  `name` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE `temp_feature_flags`;

COMMIT;

-- PostgreSQL schema-qualified and rename-chain stress cases
DROP TABLE IF EXISTS public.pg_shadow_drop;

CREATE TABLE public.pg_audit_sources (
  id bigserial NOT NULL,
  uuid uuid NOT NULL,
  source_key character varying(80) NOT NULL,
  settings jsonb,
  created_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL,
  deleted_at timestamp with time zone NULL
);

ALTER TABLE ONLY public.pg_audit_sources
  ADD CONSTRAINT pg_audit_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pg_audit_sources
  ADD CONSTRAINT pg_audit_sources_uuid_unique UNIQUE (uuid);

ALTER TABLE ONLY public.pg_audit_sources
  ADD CONSTRAINT pg_audit_sources_source_key_unique UNIQUE (source_key);

CREATE TABLE public.pg_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  source_id bigint NOT NULL,
  event_code character varying(100) NOT NULL,
  payload jsonb,
  search_vector tsvector,
  embedding vector(1024),
  region geography,
  client_ip inet,
  device_mac macaddr,
  created_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL
);

ALTER TABLE ONLY public.pg_audit_events
  ADD CONSTRAINT pg_audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pg_audit_events
  ADD CONSTRAINT pg_audit_events_source_id_foreign FOREIGN KEY (source_id) REFERENCES public.pg_audit_sources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pg_audit_events
  ADD CONSTRAINT pg_audit_events_event_code_unique UNIQUE (event_code);

CREATE TABLE `rename_chain_seed` (
  `id` bigint unsigned NOT NULL,
  `slug` varchar(120) NOT NULL,
  `temp_flag` tinyint(1) NOT NULL DEFAULT '1',
  `old_label` varchar(150) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `rename_chain_seed`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `rename_chain_seed_slug_unique` (`slug`);

ALTER TABLE `rename_chain_seed`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  CHANGE `old_label` `label` varchar(180) DEFAULT NULL,
  DROP COLUMN `temp_flag`;

ALTER TABLE `rename_chain_seed`
  RENAME TO `rename_chain_mid`;

ALTER TABLE `rename_chain_mid`
  ADD COLUMN `uuid` char(36) NOT NULL AFTER `id`,
  ADD UNIQUE KEY `rename_chain_mid_uuid_unique` (`uuid`);

ALTER TABLE `rename_chain_mid`
  RENAME TO `rename_chain_final`;

CREATE TABLE `drop_mutation_cases` (
  `id` bigint unsigned NOT NULL,
  `owner_id` bigint unsigned DEFAULT NULL,
  `legacy_code` varchar(80) NOT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `drop_mutation_cases`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `drop_mutation_cases_legacy_code_unique` (`legacy_code`),
  ADD KEY `drop_mutation_cases_owner_id_index` (`owner_id`);

ALTER TABLE `drop_mutation_cases`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  CHANGE `legacy_code` `external_code` varchar(80) NOT NULL,
  DROP COLUMN `active_flag`;

ALTER TABLE `drop_mutation_cases`
  DROP INDEX `drop_mutation_cases_owner_id_index`,
  ADD CONSTRAINT `drop_mutation_cases_owner_id_foreign` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Missing semicolon stress cases below
CREATE TABLE `missing_semicolon_alpha` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

CREATE TABLE `missing_semicolon_beta` (
  `id` bigint unsigned NOT NULL,
  `code` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

ALTER TABLE `missing_semicolon_beta`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `missing_semicolon_beta_code_unique` (`code`)

ALTER TABLE `missing_semicolon_beta`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT

COMMIT
