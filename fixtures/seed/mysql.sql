-- DbLocal dev dataset (MySQL 8). Same model as postgres.sql / sqlite.sql.
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS order_summaries;
DROP TABLE IF EXISTS audit_logs, order_items, shipments, orders, product_tags, tags, products, categories, profiles, users, _seq;
SET FOREIGN_KEY_CHECKS = 1;
SET SESSION cte_max_recursion_depth = 100000;
SET time_zone = '+00:00';

CREATE TABLE _seq (g INT PRIMARY KEY);
INSERT INTO _seq WITH RECURSIVE s(g) AS (SELECT 1 UNION ALL SELECT g + 1 FROM s WHERE g < 50000) SELECT g FROM s;

CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  role        ENUM('admin','member','guest') NOT NULL DEFAULT 'member',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  metadata    JSON,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
  user_id  INT PRIMARY KEY,
  bio      TEXT,
  avatar   BLOB,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  parent_id  INT NULL,
  name       VARCHAR(120) NOT NULL,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  category_id  INT NULL,
  sku          VARCHAR(40) NOT NULL UNIQUE,
  name         VARCHAR(160) NOT NULL,
  price        DECIMAL(10,2) NOT NULL,
  attrs        JSON,
  released_on  DATE,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE tags (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE product_tags (
  product_id  INT NOT NULL,
  tag_id      INT NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE orders (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  status     VARCHAR(20) NOT NULL,
  total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  placed_at  DATETIME NOT NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE shipments (
  order_id     INT NOT NULL,
  shipment_no  INT NOT NULL,
  carrier      VARCHAR(40) NOT NULL,
  shipped_at   TIMESTAMP NULL,
  PRIMARY KEY (order_id, shipment_no),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  shipment_no  INT NULL,
  product_id   INT NOT NULL,
  quantity     INT NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_shipment FOREIGN KEY (order_id, shipment_no) REFERENCES shipments(order_id, shipment_no),
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

-- No FK on purpose: exercises virtual relations.
CREATE TABLE audit_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  entity_type  VARCHAR(40) NOT NULL,
  entity_id    INT NOT NULL,
  action       VARCHAR(40) NOT NULL,
  payload      JSON,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (email, name, role, is_active, metadata, created_at)
SELECT CONCAT('user', g, '@example.com'), CONCAT('User ', g),
       ELT(1 + g % 3, 'admin', 'member', 'guest'),
       g % 7 <> 0,
       JSON_OBJECT('plan', IF(g % 2 = 0, 'pro', 'free'), 'seq', g),
       NOW() - INTERVAL g HOUR
FROM _seq WHERE g <= 200;

INSERT INTO profiles (user_id, bio, avatar)
SELECT g, IF(g % 4 = 0, NULL, CONCAT('Bio of user ', g)), UNHEX(LPAD(HEX(g), 8, '0'))
FROM _seq WHERE g <= 200 AND g % 3 <> 0;

INSERT INTO categories (id, parent_id, name)
SELECT g, IF(g <= 5, NULL, 1 + g % 5), CONCAT('Category ', g) FROM _seq WHERE g <= 20;

INSERT INTO products (category_id, sku, name, price, attrs, released_on)
SELECT 1 + g % 20, CONCAT('SKU-', LPAD(g, 5, '0')), CONCAT('Product ', g), ROUND(g * 3.17, 2),
       JSON_OBJECT('color', ELT(1 + g % 3, 'red', 'green', 'blue'), 'weight', g % 50),
       DATE_ADD('2024-01-01', INTERVAL g DAY)
FROM _seq WHERE g <= 100;

INSERT INTO tags (name) SELECT CONCAT('tag-', g) FROM _seq WHERE g <= 15;

INSERT IGNORE INTO product_tags (product_id, tag_id)
SELECT p.g, 1 + (p.g + k.g - 1) % 15 FROM _seq p JOIN _seq k ON k.g <= 3 WHERE p.g <= 100;

INSERT INTO orders (user_id, status, total, placed_at)
SELECT 1 + g % 200, ELT(1 + g % 4, 'pending', 'paid', 'shipped', 'cancelled'), 0,
       TIMESTAMP('2025-01-01') + INTERVAL g MINUTE
FROM _seq WHERE g <= 5000;

INSERT INTO shipments (order_id, shipment_no, carrier, shipped_at)
SELECT id, 1, ELT(1 + id % 3, 'DHL', 'UPS', 'FedEx'), IF(status = 'shipped', placed_at + INTERVAL 1 DAY, NULL)
FROM orders;

INSERT INTO order_items (order_id, shipment_no, product_id, quantity, unit_price)
SELECT 1 + (g - 1) DIV 10, IF(g % 2 = 0, 1, NULL), 1 + g % 100, 1 + g % 5, ROUND((1 + g % 100) * 3.17, 2)
FROM _seq WHERE g <= 50000;

UPDATE orders o JOIN (
  SELECT order_id, SUM(quantity * unit_price) AS t FROM order_items GROUP BY order_id
) s ON s.order_id = o.id SET o.total = s.t;

INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
SELECT IF(g % 2 = 0, 'user', 'order'),
       1 + g % IF(g % 2 = 0, 200, 5000),
       ELT(1 + g % 3, 'create', 'update', 'delete'),
       JSON_OBJECT('n', g), NOW() - INTERVAL g MINUTE
FROM _seq WHERE g <= 2000;

CREATE VIEW order_summaries AS
SELECT o.id AS order_id, u.email, o.status, o.total, COUNT(i.id) AS item_count
FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN order_items i ON i.order_id = o.id
GROUP BY o.id, u.email, o.status, o.total;

DROP TABLE _seq;
