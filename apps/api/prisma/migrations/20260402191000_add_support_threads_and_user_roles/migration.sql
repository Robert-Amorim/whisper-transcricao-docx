ALTER TABLE `users`
    ADD COLUMN `role` ENUM('customer', 'support', 'admin') NOT NULL DEFAULT 'customer' AFTER `email`;

CREATE TABLE `support_threads` (
    `id` VARCHAR(191) NOT NULL,
    `channel` ENUM('in_app', 'public_form') NOT NULL,
    `status` ENUM('new', 'open', 'waiting_user', 'waiting_support', 'resolved', 'closed') NOT NULL DEFAULT 'new',
    `priority` ENUM('normal') NOT NULL DEFAULT 'normal',
    `category` ENUM('acesso', 'pagamento', 'transcricao', 'entrega', 'conta') NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `requester_user_id` VARCHAR(191) NULL,
    `requester_name` VARCHAR(191) NULL,
    `requester_email` VARCHAR(191) NOT NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `resolved_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,

    INDEX `support_threads_requester_user_id_created_at_idx`(`requester_user_id`, `created_at`),
    INDEX `support_threads_assignee_user_id_status_updated_at_idx`(`assignee_user_id`, `status`, `updated_at`),
    INDEX `support_threads_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `support_threads_requester_email_idx`(`requester_email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_messages` (
    `id` VARCHAR(191) NOT NULL,
    `thread_id` VARCHAR(191) NOT NULL,
    `author_role` ENUM('customer', 'support', 'admin', 'system') NOT NULL,
    `author_user_id` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `delivery_channel` ENUM('in_app', 'email') NOT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_thread_id_created_at_idx`(`thread_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_internal_notes` (
    `id` VARCHAR(191) NOT NULL,
    `thread_id` VARCHAR(191) NOT NULL,
    `author_user_id` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `support_internal_notes_thread_id_created_at_idx`(`thread_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `support_threads`
    ADD CONSTRAINT `support_threads_requester_user_id_fkey`
        FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `support_threads_assignee_user_id_fkey`
        FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `support_messages`
    ADD CONSTRAINT `support_messages_thread_id_fkey`
        FOREIGN KEY (`thread_id`) REFERENCES `support_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `support_messages_author_user_id_fkey`
        FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `support_internal_notes`
    ADD CONSTRAINT `support_internal_notes_thread_id_fkey`
        FOREIGN KEY (`thread_id`) REFERENCES `support_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `support_internal_notes_author_user_id_fkey`
        FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
