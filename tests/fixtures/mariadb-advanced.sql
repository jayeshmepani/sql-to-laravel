-- MariaDB-oriented fixture
CREATE TABLE `mdb_devices` (
  `id` bigint unsigned NOT NULL,
  `device_code` varchar(64) NOT NULL,
  `payload` longtext DEFAULT NULL,
  `embedding` vector(768) DEFAULT NULL,
  `calc_name` varchar(255) GENERATED ALWAYS AS (upper(`device_code`)) STORED,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `chk_mdb_devices_payload` CHECK (json_valid(`payload`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `mdb_devices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `mdb_devices_device_code_unique` (`device_code`);

ALTER TABLE `mdb_devices`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `mdb_devices`
  ADD COLUMN `firmware_hash` binary(16) NOT NULL AFTER `device_code`,
  ADD COLUMN `internal_notes` varchar(255) DEFAULT NULL INVISIBLE AFTER `payload`;

COMMIT;
