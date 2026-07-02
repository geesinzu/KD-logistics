CREATE TABLE IF NOT EXISTS notifications (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id bigint unsigned DEFAULT NULL,
  tpl_user_id bigint unsigned DEFAULT NULL,
  shipment_id bigint unsigned DEFAULT NULL,
  tracking_id varchar(20) DEFAULT NULL,
  type varchar(30) NOT NULL,
  title varchar(100) NOT NULL,
  message text NOT NULL,
  `read` int NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_id (user_id),
  KEY idx_tpl_user_id (tpl_user_id),
  KEY idx_shipment_id (shipment_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
