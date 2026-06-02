-- MySQL / phpMyAdmin-style split schema
DROP TABLE IF EXISTS `pm_orders`, `pm_users`;

CREATE TABLE `pm_users` (
  `id` bigint unsigned NOT NULL,
  `uuid` char(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `pm_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `pm_users_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `pm_users_email_unique` (`email`);

ALTER TABLE `pm_users`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

CREATE TABLE `pm_orders` (
  `id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `status` enum('draft','paid','cancelled') NOT NULL DEFAULT 'draft',
  `meta` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `chk_pm_orders_meta` CHECK (json_valid(`meta`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `pm_orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `pm_orders_user_id_foreign` (`user_id`);

ALTER TABLE `pm_orders`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  ADD CONSTRAINT `pm_orders_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `pm_users` (`id`) ON DELETE SET NULL;

COMMIT;
