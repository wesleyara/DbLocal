-- DbLocal dev dataset (PostgreSQL). Same model as mysql.sql / sqlite.sql.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE TYPE user_role AS ENUM ('admin', 'member', 'guest');

CREATE TABLE users (
  id          serial PRIMARY KEY,
  email       varchar(255) NOT NULL UNIQUE,
  name        varchar(120) NOT NULL,
  role        user_role NOT NULL DEFAULT 'member',
  is_active   boolean NOT NULL DEFAULT true,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id  integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio      text,
  avatar   bytea
);

CREATE TABLE categories (
  id         serial PRIMARY KEY,
  parent_id  integer REFERENCES categories(id),
  name       varchar(120) NOT NULL
);

CREATE TABLE products (
  id           serial PRIMARY KEY,
  category_id  integer REFERENCES categories(id),
  sku          varchar(40) NOT NULL UNIQUE,
  name         varchar(160) NOT NULL,
  price        numeric(10,2) NOT NULL,
  attrs        json,
  released_on  date
);

CREATE TABLE tags (
  id    serial PRIMARY KEY,
  name  varchar(60) NOT NULL UNIQUE
);

CREATE TABLE product_tags (
  product_id  integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id      integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE orders (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id),
  status     varchar(20) NOT NULL,
  total      numeric(12,2) NOT NULL DEFAULT 0,
  placed_at  timestamp NOT NULL
);

CREATE TABLE shipments (
  order_id     integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_no  integer NOT NULL,
  carrier      varchar(40) NOT NULL,
  shipped_at   timestamptz,
  PRIMARY KEY (order_id, shipment_no)
);

CREATE TABLE order_items (
  id           serial PRIMARY KEY,
  order_id     integer NOT NULL,
  shipment_no  integer,
  product_id   integer NOT NULL REFERENCES products(id),
  quantity     integer NOT NULL,
  unit_price   numeric(10,2) NOT NULL,
  FOREIGN KEY (order_id, shipment_no) REFERENCES shipments(order_id, shipment_no)
);

-- No FK on purpose: exercises virtual relations (entity_id -> users.id / orders.id).
CREATE TABLE audit_logs (
  id           serial PRIMARY KEY,
  entity_type  varchar(40) NOT NULL,
  entity_id    integer NOT NULL,
  action       varchar(40) NOT NULL,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (email, name, role, is_active, metadata, created_at)
SELECT 'user' || g || '@example.com', 'User ' || g,
       (ARRAY['admin','member','guest'])[1 + g % 3]::user_role,
       g % 7 <> 0,
       jsonb_build_object('plan', CASE WHEN g % 2 = 0 THEN 'pro' ELSE 'free' END, 'seq', g),
       now() - (g || ' hours')::interval
FROM generate_series(1, 200) g;

INSERT INTO profiles (user_id, bio, avatar)
SELECT g, CASE WHEN g % 4 = 0 THEN NULL ELSE 'Bio of user ' || g END, decode(lpad(to_hex(g), 8, '0'), 'hex')
FROM generate_series(1, 200) g WHERE g % 3 <> 0;

INSERT INTO categories (id, parent_id, name)
SELECT g, CASE WHEN g <= 5 THEN NULL ELSE 1 + g % 5 END, 'Category ' || g
FROM generate_series(1, 20) g;
SELECT setval('categories_id_seq', 20);

INSERT INTO products (category_id, sku, name, price, attrs, released_on)
SELECT 1 + g % 20, 'SKU-' || lpad(g::text, 5, '0'), 'Product ' || g, (g * 3.17)::numeric(10,2),
       json_build_object('color', (ARRAY['red','green','blue'])[1 + g % 3], 'weight', g % 50),
       date '2024-01-01' + g
FROM generate_series(1, 100) g;

INSERT INTO tags (name) SELECT 'tag-' || g FROM generate_series(1, 15) g;

INSERT INTO product_tags (product_id, tag_id)
SELECT p, 1 + (p + k) % 15 FROM generate_series(1, 100) p, generate_series(0, 2) k
GROUP BY p, 1 + (p + k) % 15;

INSERT INTO orders (user_id, status, total, placed_at)
SELECT 1 + g % 200, (ARRAY['pending','paid','shipped','cancelled'])[1 + g % 4], 0,
       timestamp '2025-01-01' + (g || ' minutes')::interval
FROM generate_series(1, 5000) g;

INSERT INTO shipments (order_id, shipment_no, carrier, shipped_at)
SELECT id, 1, (ARRAY['DHL','UPS','FedEx'])[1 + id % 3], CASE WHEN status = 'shipped' THEN placed_at + interval '1 day' END
FROM orders;

INSERT INTO order_items (order_id, shipment_no, product_id, quantity, unit_price)
SELECT 1 + (g - 1) / 10, CASE WHEN g % 2 = 0 THEN 1 END, 1 + g % 100, 1 + g % 5, ((1 + g % 100) * 3.17)::numeric(10,2)
FROM generate_series(1, 50000) g;

UPDATE orders o SET total = s.t FROM (
  SELECT order_id, sum(quantity * unit_price) AS t FROM order_items GROUP BY order_id
) s WHERE s.order_id = o.id;

INSERT INTO audit_logs (entity_type, entity_id, action, payload, created_at)
SELECT CASE WHEN g % 2 = 0 THEN 'user' ELSE 'order' END,
       1 + g % (CASE WHEN g % 2 = 0 THEN 200 ELSE 5000 END),
       (ARRAY['create','update','delete'])[1 + g % 3],
       jsonb_build_object('n', g), now() - (g || ' minutes')::interval
FROM generate_series(1, 2000) g;

CREATE VIEW order_summaries AS
SELECT o.id AS order_id, u.email, o.status, o.total, count(i.id) AS item_count
FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN order_items i ON i.order_id = o.id
GROUP BY o.id, u.email, o.status, o.total;

-- Stored logic, for the functions & triggers view.
CREATE FUNCTION order_total(p_order_id integer) RETURNS numeric
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(sum(quantity * unit_price), 0) FROM order_items WHERE order_id = p_order_id
$$;
COMMENT ON FUNCTION order_total(integer) IS 'Sum of the items of an order';

CREATE PROCEDURE archive_audit_logs(p_before timestamptz)
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM audit_logs WHERE created_at < p_before;
END;
$$;

CREATE FUNCTION products_price_check() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.price < 0 THEN
    RAISE EXCEPTION 'price cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_price_check
BEFORE INSERT OR UPDATE OF price ON products
FOR EACH ROW EXECUTE FUNCTION products_price_check();
