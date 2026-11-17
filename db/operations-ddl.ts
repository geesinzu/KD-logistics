// Additive, repeatable setup only. Never alters or deletes an existing app table.
export const OPERATIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS branch_transfers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, client_key VARCHAR(36) NOT NULL UNIQUE, request_hash VARCHAR(64) NOT NULL,
 source_branch_id BIGINT UNSIGNED NOT NULL, destination_branch_id BIGINT UNSIGNED NOT NULL, description TEXT NOT NULL, quantity INT NOT NULL, unit VARCHAR(30) NOT NULL, reason TEXT NOT NULL,
 status ENUM('requested','approved','rejected','cancelled','dispatched','partially_received','received') NOT NULL DEFAULT 'requested', received_qty INT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1,
 company_name VARCHAR(150) NOT NULL, contact_name VARCHAR(100) NOT NULL, contact_phone VARCHAR(30) NOT NULL, delivery_mode ENUM('door_to_door','pickup') NOT NULL, pickup_location VARCHAR(500),
 requested_by BIGINT UNSIGNED NOT NULL, approved_by BIGINT UNSIGNED, dispatched_by BIGINT UNSIGNED,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at DATETIME NULL, dispatched_at DATETIME NULL, received_at DATETIME NULL,
 INDEX transfer_source(source_branch_id,created_at), INDEX transfer_destination(destination_branch_id,created_at), INDEX transfer_status(status,created_at)
) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS branch_transfer_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, transfer_id BIGINT UNSIGNED NOT NULL, client_key VARCHAR(36) NOT NULL UNIQUE, request_hash VARCHAR(64) NOT NULL, action VARCHAR(30) NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL, actor_name VARCHAR(100) NOT NULL, actor_role VARCHAR(30) NOT NULL, quantity INT NULL, note TEXT, status_after VARCHAR(30) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX transfer_event_parent(transfer_id,id)
) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS operation_files (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, parent_type ENUM('shipment','transfer') NOT NULL, parent_id BIGINT UNSIGNED NOT NULL, stage VARCHAR(30) NOT NULL, kind VARCHAR(30) NOT NULL, event_id BIGINT UNSIGNED NULL,
 name VARCHAR(180) NOT NULL, mime VARCHAR(50) NOT NULL, size INT NOT NULL, sha256 VARCHAR(64) NOT NULL, client_key VARCHAR(36) NULL UNIQUE, content LONGBLOB NULL,
 uploaded_by BIGINT UNSIGNED NOT NULL, uploader_name VARCHAR(100) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 removed_at DATETIME NULL, removed_by BIGINT UNSIGNED NULL, removal_reason VARCHAR(1000) NULL,
 INDEX operation_file_parent(parent_type,parent_id,removed_at)
) ENGINE=InnoDB`,
];
