ALTER TABLE `support_threads`
  ADD COLUMN `customer_last_viewed_at` DATETIME(3) NULL,
  ADD COLUMN `staff_last_viewed_at` DATETIME(3) NULL,
  ADD COLUMN `last_customer_message_at` DATETIME(3) NULL,
  ADD COLUMN `last_staff_message_at` DATETIME(3) NULL;

CREATE INDEX `support_threads_last_customer_message_at_idx`
  ON `support_threads`(`last_customer_message_at`);

CREATE INDEX `support_threads_last_staff_message_at_idx`
  ON `support_threads`(`last_staff_message_at`);
