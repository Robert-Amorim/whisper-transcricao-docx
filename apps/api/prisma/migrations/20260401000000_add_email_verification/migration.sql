ALTER TABLE `users`
  ADD COLUMN `email_verified_at` DATETIME(3) NULL,
  ADD COLUMN `email_verification_token` VARCHAR(191) NULL,
  ADD COLUMN `email_verification_expires_at` DATETIME(3) NULL;

ALTER TABLE `users`
  ADD UNIQUE INDEX `users_email_verification_token_key`(`email_verification_token`);
