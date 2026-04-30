-- EXHAUSTIVE LARAVEL 12+ MIGRATION HELPER TEST SUITE
-- This file contains extreme edge cases, covering all native types, modern modifiers, constraints, and index types.

CREATE TABLE `numeric_exhaustive` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  
  -- Integers
  `c_tinyint` tinyint(4) NOT NULL,
  `c_tinyint_u` tinyint(3) unsigned NOT NULL,
  `c_smallint` smallint(6) NOT NULL,
  `c_smallint_u` smallint(5) unsigned NOT NULL,
  `c_mediumint` mediumint(9) NOT NULL,
  `c_mediumint_u` mediumint(8) unsigned NOT NULL,
  `c_int` int(11) NOT NULL,
  `c_int_u` int(10) unsigned NOT NULL,
  `c_bigint` bigint(20) NOT NULL,
  `c_bigint_u` bigint(20) unsigned NOT NULL,
  
  -- Decimals / Floats
  `c_decimal` decimal(15,5) NOT NULL DEFAULT '123.45678',
  `c_decimal_simple` decimal NOT NULL,
  `c_float` float NOT NULL,
  `c_double` double precision NOT NULL,
  `c_double_simple` double NOT NULL,
  
  -- Booleans
  `c_bool` tinyint(1) NOT NULL DEFAULT '0',
  `c_bool_true` tinyint(1) NOT NULL DEFAULT '1',
  `c_boolean` boolean NOT NULL DEFAULT true,
  `c_boolean_false` boolean NOT NULL DEFAULT false,
  
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `string_exhaustive` (
  `id` char(36) NOT NULL,
  
  -- Strings / Varchars
  `c_string` varchar(255) NOT NULL,
  `c_string_len` varchar(100) DEFAULT 'default_value',
  `c_char` char(10) NOT NULL,
  `c_char_len` char(50) NOT NULL,
  
  -- UUIDs / ULIDs
  `c_uuid` uuid NOT NULL,
  `c_ulid` char(26) NOT NULL,
  `c_ulid_alternative` char(26) NOT NULL,
  
  -- Texts
  `c_tinytext` tinytext,
  `c_text` text NOT NULL,
  `c_mediumtext` mediumtext,
  `c_longtext` longtext NOT NULL,
  
  -- Enum / Set
  `c_enum` enum('active','inactive','pending','archived') NOT NULL DEFAULT 'pending',
  `c_set` set('a','b','c') DEFAULT NULL,
  
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `temporal_exhaustive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  
  -- Dates and Times
  `c_date` date NOT NULL,
  `c_datetime` datetime NOT NULL,
  `c_time` time NOT NULL,
  `c_year` year(4) NOT NULL,
  
  -- Timestamps
  `c_timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `c_timestamp_update` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  
  -- Timezones (PostgreSQL specific usually, but supported by parser)
  `c_datetime_tz` timestamp with time zone NOT NULL,
  `c_time_tz` time with time zone NOT NULL,
  `c_timestamp_tz` timestamptz NOT NULL,
  `c_timetz` timetz NOT NULL,
  
  -- Laravel Defaults
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `specialized_exhaustive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  
  -- JSON
  `c_json` json NOT NULL,
  `c_jsonb` jsonb,
  `c_json_simulated` longtext NOT NULL,
  
  -- Binary
  `c_binary` binary NOT NULL,
  `c_blob` blob NOT NULL,
  `c_tinyblob` tinyblob NOT NULL,
  `c_mediumblob` mediumblob NOT NULL,
  `c_longblob` longblob NOT NULL,
  
  -- Network / IP
  `c_ip_address` varchar(45) DEFAULT NULL,
  `c_mac_address` varchar(17) DEFAULT NULL,
  `c_inet` inet,
  `c_macaddr` macaddr,
  
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_json_simulated` CHECK (json_valid(`c_json_simulated`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `spatial_exhaustive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  
  -- Geometry
  `c_geometry` geometry NOT NULL,
  `c_point` point NOT NULL,
  `c_linestring` linestring NOT NULL,
  `c_polygon` polygon NOT NULL,
  
  PRIMARY KEY (`id`),
  SPATIAL KEY `idx_c_point` (`c_point`),
  SPATIAL INDEX `idx_c_polygon` (`c_polygon`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `modifier_exhaustive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  
  -- Nullability & Defaults
  `c_nullable` varchar(255) DEFAULT NULL,
  `c_default_null_string` varchar(255) DEFAULT 'NULL',
  `c_default_int` int NOT NULL DEFAULT '42',
  `c_default_string` varchar(255) NOT NULL DEFAULT 'Hello World',
  `c_default_bool` tinyint(1) NOT NULL DEFAULT '1',
  `c_default_current` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes inline
  `c_unique` varchar(255) NOT NULL UNIQUE,
  `c_index` varchar(255) NOT NULL,
  `c_fulltext` text NOT NULL,
  
  -- Modern Modifiers (MySQL 8+)
  `c_invisible` varchar(255) NOT NULL INVISIBLE,
  `c_virtual` varchar(255) GENERATED ALWAYS AS (upper(`c_index`)) VIRTUAL,
  `c_stored` varchar(255) GENERATED ALWAYS AS (lower(`c_index`)) STORED,
  `c_complex_virtual` varchar(255) GENERATED ALWAYS AS (concat(`c_index`, ' - ', `c_unique`)) VIRTUAL,
  `c_instant` varchar(255) NOT NULL INSTANT,
  `c_lock` varchar(255) NOT NULL LOCK NONE,
  
  -- Comments
  `c_commented` varchar(100) NOT NULL COMMENT 'This is a very specific column comment',
  
  PRIMARY KEY (`id`),
  KEY `regular_idx` (`c_index`),
  FULLTEXT KEY `ft_idx` (`c_fulltext`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `relationship_exhaustive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  
  -- Implicit Foreign Keys (Guessed by name and type)
  `user_id` bigint unsigned NOT NULL,
  `profile_uuid` char(36) NOT NULL,
  `session_ulid` char(26) NOT NULL,
  
  -- Explicit Foreign Keys
  `parent_id` bigint unsigned DEFAULT NULL,
  `category_id` bigint unsigned NOT NULL,
  `owner_uuid` char(36) NOT NULL,
  
  -- Morphs (Standard)
  `commentable_id` bigint unsigned NOT NULL,
  `commentable_type` varchar(255) NOT NULL,
  
  -- Morphs (Nullable)
  `imageable_id` bigint unsigned DEFAULT NULL,
  `imageable_type` varchar(255) DEFAULT NULL,
  
  -- Morphs (UUID)
  `taggable_id` char(36) NOT NULL,
  `taggable_type` varchar(255) NOT NULL,
  
  -- Morphs (Nullable UUID)
  `fileable_id` char(36) DEFAULT NULL,
  `fileable_type` varchar(255) DEFAULT NULL,
  
  -- Morphs (ULID)
  `likeable_id` char(26) NOT NULL,
  `likeable_type` varchar(255) NOT NULL,
  
  PRIMARY KEY (`id`),
  -- Constraints covering all On Delete / On Update actions
  CONSTRAINT `fk_parent` FOREIGN KEY (`parent_id`) REFERENCES `relationship_exhaustive` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_category` FOREIGN KEY (`category_id`) REFERENCES `numeric_exhaustive` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_owner` FOREIGN KEY (`owner_uuid`) REFERENCES `string_exhaustive` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `composite_keys_exhaustive` (
  `pk_int_1` int NOT NULL,
  `pk_int_2` int NOT NULL,
  `fk_int_1` int NOT NULL,
  `fk_int_2` int NOT NULL,
  
  PRIMARY KEY (`pk_int_1`, `pk_int_2`),
  UNIQUE KEY `composite_unique` (`fk_int_1`, `fk_int_2`),
  KEY `composite_index` (`pk_int_1`, `fk_int_1`),
  CONSTRAINT `fk_composite_ref` FOREIGN KEY (`fk_int_1`, `fk_int_2`) REFERENCES `composite_keys_exhaustive` (`pk_int_1`, `pk_int_2`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `edge_case_names` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `table` varchar(255) NOT NULL COMMENT 'Reserved keyword',
  `primary` varchar(255) NOT NULL COMMENT 'Reserved keyword',
  `foreign` varchar(255) NOT NULL COMMENT 'Reserved keyword',
  `from` varchar(255) NOT NULL COMMENT 'Reserved keyword',
  `select` varchar(255) NOT NULL COMMENT 'Reserved keyword',
  `weird-name-with-dashes` varchar(255) NOT NULL,
  `name_with_numbers_123` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `extreme_exhaustive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  
  -- AI / ML Types
  `c_vector` vector(1536) NOT NULL,
  
  -- Obscure Spatial Types
  `c_geocollection` geometrycollection NOT NULL,
  `c_multipoint` multipoint NOT NULL,
  `c_multiline` multilinestring NOT NULL,
  `c_multipolygon` multipolygon NOT NULL,
  
  -- Specialized Strings
  `remember_token` varchar(100) DEFAULT NULL,
  `c_set_exhaustive` set('one','two','three','four') DEFAULT 'one',
  
  -- PostgreSQL / Modern Identity
  `c_identity_always` bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  `c_identity_default` bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  
  -- Advanced Temporal
  `c_datetimetz_explicit` timestamp with time zone NOT NULL,
  `c_timetz_explicit` time with time zone NOT NULL,
  
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `laravel_13_features` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `c_geography` geography NOT NULL,
  `c_tsvector` tsvector,
  `c_vector_sparse` vector(1536) NOT NULL COMMENT 'sparse_embedding',
  `created_at` timestamp with time zone NULL DEFAULT NULL,
  `updated_at` timestamp with time zone NULL DEFAULT NULL,
  `deleted_at` timestamp with time zone NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Missing Semicolon Edge Case 1
CREATE TABLE `missing_semicolon_1` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

-- Missing Semicolon Edge Case 2
CREATE TABLE `missing_semicolon_2` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

-- Missing Semicolon Edge Case 3
CREATE TABLE `missing_semicolon_3` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `description` text NOT NULL,
  PRIMARY KEY (`id`)
);
