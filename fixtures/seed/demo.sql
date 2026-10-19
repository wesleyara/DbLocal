-- DbLocal demo dataset (SQLite): the dev model of sqlite.sql, smaller so it builds in a blink.
-- Built into <data dir>/demo.sqlite by server/demo/demo-service.ts. Keep the tables in step with sqlite.sql.
PRAGMA foreign_keys = OFF;
DROP VIEW IF EXISTS order_summaries;
DROP TABLE IF EXISTS audit_logs; DROP TABLE IF EXISTS order_items; DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS orders; DROP TABLE IF EXISTS product_tags; DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS products; DROP TABLE IF EXISTS categories; DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS _seq;
PRAGMA foreign_keys = ON;

CREATE TABLE _seq (g INTEGER PRIMARY KEY);
WITH RECURSIVE s(g) AS (SELECT 1 UNION ALL SELECT g + 1 FROM s WHERE g < 4000)
INSERT INTO _seq SELECT g FROM s;

CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  role        VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','guest')),
  is_active   BOOLEAN NOT NULL DEFAULT 1,
  metadata    JSON,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
  user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio      TEXT,
  avatar   BLOB
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id  INTEGER REFERENCES categories(id),
  name       VARCHAR(120) NOT NULL
);

CREATE TABLE products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER REFERENCES categories(id),
  sku          VARCHAR(40) NOT NULL UNIQUE,
  name         VARCHAR(160) NOT NULL,
  price        DECIMAL(10,2) NOT NULL,
  attrs        JSON,
  released_on  DATE
);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE product_tags (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  status     VARCHAR(20) NOT NULL,
  total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  placed_at  DATETIME NOT NULL
);

CREATE TABLE shipments (
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_no  INTEGER NOT NULL,
  carrier      VARCHAR(40) NOT NULL,
  shipped_at   DATETIME,
  PRIMARY KEY (order_id, shipment_no)
);

CREATE TABLE order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL,
  shipment_no  INTEGER,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  quantity     INTEGER NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id, shipment_no) REFERENCES shipments(order_id, shipment_no)
);

-- No FK on purpose: exercises virtual relations.
CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  VARCHAR(40) NOT NULL,
  entity_id    INTEGER NOT NULL,
  action       VARCHAR(40) NOT NULL,
  payload      JSON,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (email, name, role, is_active, metadata, created_at)
SELECT 'user' || g || '@example.com', 'User ' || g,
       CASE g % 3 WHEN 0 THEN 'guest' WHEN 1 THEN 'admin' ELSE 'member' END,
       g % 7 <> 0,
       json_object('plan', CASE WHEN g % 2 = 0 THEN 'pro' ELSE 'free' END, 'seq', g),
       datetime('now', '-' || g || ' hours')
FROM _seq WHERE g <= 200;

INSERT INTO profiles (user_id, bio, avatar)
SELECT g, CASE WHEN g % 4 = 0 THEN NULL ELSE 'Bio of user ' || g END, unhex(printf('%08x', g))
FROM _seq WHERE g <= 200 AND g % 3 <> 0;

INSERT INTO categories (id, parent_id, name)
SELECT g, CASE WHEN g <= 5 THEN NULL ELSE 1 + g % 5 END, 'Category ' || g FROM _seq WHERE g <= 20;

INSERT INTO products (category_id, sku, name, price, attrs, released_on)
SELECT 1 + g % 20, 'SKU-' || printf('%05d', g), 'Product ' || g, round(g * 3.17, 2),
       json_object('color', CASE g % 3 WHEN 0 THEN 'green' WHEN 1 THEN 'red' ELSE 'blue' END, 'weight', g % 50),
       date('2024-01-01', '+' || g || ' days')
FROM _seq WHERE g <= 100;

INSERT INTO tags (name) SELECT 'tag-' || g FROM _seq WHERE g <= 15;

INSERT OR IGNORE INTO product_tags (product_id, tag_id)
SELECT p.g, 1 + (p.g + k.g - 1) % 15 FROM _seq p JOIN _seq k ON k.g <= 3 WHERE p.g <= 100;

INSERT INTO orders (user_id, status, total, placed_at)
SELECT 1 + g % 200,
       CASE g % 4 WHEN 0 THEN 'cancelled' WHEN 1 THEN 'pending' WHEN 2 THEN 'paid' ELSE 'shipped' END,
       0, datetime('2025-01-01', '+' || g || ' minutes')
FROM _seq WHERE g <= 400;

INSERT INTO shipments (order_id, shipment_no, carrier, shipped_at)
SELECT id, 1, CASE id % 3 WHEN 0 THEN 'UPS' WHEN 1 THEN 'FedEx' ELSE 'DHL' END,
       CASE WHEN status = 'shipped' THEN datetime(placed_at, '+1 day') END
FROM orders;

INSERT INTO order_items (order_id, shipment_no, product_id, quantity, unit_price)
SELECT 1 + (g - 1) / 10, CASE WHEN g % 2 = 0 THEN 1 END, 1 + g % 100, 1 + g % 5, round((1 + g % 100) * 3.17, 2)
FROM _seq WHERE g <= 4000;

CREATE INDEX idx_order_items_order ON order_items(order_id);
UPDATE orders SET total = (SELECT sum(quantity * unit_price) FROM order_items WHERE order_id = orders.id);

INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
SELECT CASE WHEN g % 2 = 0 THEN 'user' ELSE 'order' END,
       1 + g % (CASE WHEN g % 2 = 0 THEN 200 ELSE 400 END),
       CASE g % 3 WHEN 0 THEN 'delete' WHEN 1 THEN 'create' ELSE 'update' END,
       json_object('n', g), datetime('now', '-' || g || ' minutes')
FROM _seq WHERE g <= 2000;

CREATE VIEW order_summaries AS
SELECT o.id AS order_id, u.email, o.status, o.total, count(i.id) AS item_count
FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN order_items i ON i.order_id = o.id
GROUP BY o.id, u.email, o.status, o.total;

CREATE TRIGGER trg_users_audit_insert AFTER INSERT ON users
BEGIN
  INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
  VALUES ('user', NEW.id, 'create', json_object('email', NEW.email), datetime('now'));
END;

CREATE TRIGGER trg_orders_audit_status AFTER UPDATE OF status ON orders
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
  VALUES ('order', NEW.id, 'update', json_object('from', OLD.status, 'to', NEW.status), datetime('now'));
END;

DROP TABLE _seq;
