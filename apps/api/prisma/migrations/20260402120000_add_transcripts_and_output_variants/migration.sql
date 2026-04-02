-- Alter transcription_jobs
ALTER TABLE `transcription_jobs`
    ADD COLUMN `translation_target_language` VARCHAR(191) NULL,
    ADD COLUMN `diarization_enabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `generate_pdf` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `original_transcript_status` ENUM('pending', 'processing', 'ready', 'failed', 'regenerating') NOT NULL DEFAULT 'pending',
    ADD COLUMN `translated_transcript_status` ENUM('pending', 'processing', 'ready', 'failed', 'regenerating') NULL;

-- Alter job_outputs
ALTER TABLE `job_outputs`
    DROP INDEX `job_outputs_job_id_format_key`,
    ADD COLUMN `variant` ENUM('original', 'translated') NOT NULL DEFAULT 'original',
    ADD COLUMN `language` VARCHAR(191) NULL,
    MODIFY `format` ENUM('txt', 'srt', 'pdf') NOT NULL,
    ADD UNIQUE INDEX `job_outputs_job_id_variant_format_key`(`job_id`, `variant`, `format`);

-- Create transcription_transcripts
CREATE TABLE `transcription_transcripts` (
    `id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `variant` ENUM('original', 'translated') NOT NULL,
    `kind` ENUM('transcript', 'translation') NOT NULL,
    `language` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'processing', 'ready', 'failed', 'regenerating') NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `source_revision` INTEGER NULL,
    `error_code` VARCHAR(191) NULL,
    `error_message` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transcription_transcripts_job_id_variant_key`(`job_id`, `variant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create transcript_segments
CREATE TABLE `transcript_segments` (
    `id` VARCHAR(191) NOT NULL,
    `transcript_id` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `segment_index` INTEGER NOT NULL,
    `start_sec` DECIMAL(12, 3) NULL,
    `end_sec` DECIMAL(12, 3) NULL,
    `text` TEXT NOT NULL,
    `speaker_label` VARCHAR(191) NULL,
    `speaker_confidence` DECIMAL(5, 4) NULL,
    `language` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'speech',
    `status` ENUM('active') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transcript_segments_transcript_id_revision_segment_index_key`(`transcript_id`, `revision`, `segment_index`),
    INDEX `transcript_segments_transcript_id_revision_segment_index_idx`(`transcript_id`, `revision`, `segment_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transcription_transcripts` ADD CONSTRAINT `transcription_transcripts_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `transcription_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcript_segments` ADD CONSTRAINT `transcript_segments_transcript_id_fkey` FOREIGN KEY (`transcript_id`) REFERENCES `transcription_transcripts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
