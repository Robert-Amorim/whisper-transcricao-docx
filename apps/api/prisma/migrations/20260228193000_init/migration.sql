-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `available_balance` DECIMAL(12, 6) NOT NULL DEFAULT 0,
    `held_balance` DECIMAL(12, 6) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallets_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('credit', 'hold', 'capture', 'refund', 'adjustment') NOT NULL,
    `amount` DECIMAL(12, 6) NOT NULL,
    `job_id` VARCHAR(191) NULL,
    `payment_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wallet_ledger_idempotency_key_key`(`idempotency_key`),
    INDEX `wallet_ledger_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('mercado_pago') NOT NULL,
    `provider_payment_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 6) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL,
    `raw_payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_provider_payment_id_key`(`provider_payment_id`),
    INDEX `payments_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transcription_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('uploaded', 'validating', 'queued', 'processing', 'completed', 'failed') NOT NULL,
    `source_object_key` VARCHAR(191) NOT NULL,
    `language` VARCHAR(191) NOT NULL,
    `duration_seconds` INTEGER NULL,
    `price_per_minute` DECIMAL(12, 6) NOT NULL,
    `charge_amount` DECIMAL(12, 6) NULL,
    `error_code` VARCHAR(191) NULL,
    `error_message` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `transcription_jobs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `transcription_jobs_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transcription_chunks` (
    `id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `chunk_index` INTEGER NOT NULL,
    `start_sec` DECIMAL(12, 3) NULL,
    `end_sec` DECIMAL(12, 3) NULL,
    `status` ENUM('queued', 'processing', 'completed', 'failed') NOT NULL,
    `provider_request_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transcription_chunks_job_id_chunk_index_key`(`job_id`, `chunk_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_outputs` (
    `id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `format` ENUM('txt', 'srt') NOT NULL,
    `object_key` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `job_outputs_job_id_format_key`(`job_id`, `format`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledger` ADD CONSTRAINT `wallet_ledger_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledger` ADD CONSTRAINT `wallet_ledger_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `transcription_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledger` ADD CONSTRAINT `wallet_ledger_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcription_jobs` ADD CONSTRAINT `transcription_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcription_chunks` ADD CONSTRAINT `transcription_chunks_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `transcription_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_outputs` ADD CONSTRAINT `job_outputs_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `transcription_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

