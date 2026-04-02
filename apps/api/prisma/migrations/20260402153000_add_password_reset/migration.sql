ALTER TABLE `users`
  ADD COLUMN `password_reset_token` VARCHAR(191) NULL,
  ADD COLUMN `password_reset_expires_at` DATETIME(3) NULL;

ALTER TABLE `users`
  ADD UNIQUE INDEX `users_password_reset_token_key`(`password_reset_token`);
