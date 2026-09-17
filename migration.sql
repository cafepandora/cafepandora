-- Ejecuta esto completo en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- No necesitas activar Row Level Security en estas tablas: las funciones de
-- Cloudflare usan la "service role key", que siempre tiene acceso total.

CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY,
	"nombre" text NOT NULL UNIQUE,
	"tipo_cliente" text DEFAULT 'Cliente normal' NOT NULL,
	"ts" bigint NOT NULL
);

CREATE TABLE "gastos" (
	"id" serial PRIMARY KEY,
	"usuario" text NOT NULL,
	"concepto" text NOT NULL,
	"monto" integer NOT NULL,
	"categoria" text NOT NULL,
	"estado" text DEFAULT 'Pagado' NOT NULL,
	"ts" bigint NOT NULL
);

CREATE TABLE "ventas" (
	"id" serial PRIMARY KEY,
	"usuario" text NOT NULL,
	"cliente" text NOT NULL,
	"tipo_cliente" text NOT NULL,
	"tipo_venta" text DEFAULT 'cafe' NOT NULL,
	"lote" text,
	"presentacion" text,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"servicios" jsonb,
	"items" jsonb DEFAULT '[]' NOT NULL,
	"valor" integer NOT NULL,
	"estado" text NOT NULL,
	"metodo" text DEFAULT '' NOT NULL,
	"ts" bigint NOT NULL
);

CREATE TABLE "inventario" (
	"id" serial PRIMARY KEY,
	"lote" text NOT NULL UNIQUE,
	"stock_lb" double precision DEFAULT 0 NOT NULL,
	"ts" bigint NOT NULL
);

CREATE TABLE "maquila_tarifas" (
	"id" serial PRIMARY KEY,
	"servicio" text NOT NULL UNIQUE,
	"precio_por_kg" integer DEFAULT 0 NOT NULL,
	"ts" bigint NOT NULL
);

CREATE TABLE "finca" (
	"id" serial PRIMARY KEY,
	"concepto" text NOT NULL,
	"categoria" text NOT NULL,
	"monto" integer NOT NULL,
	"estado" text DEFAULT 'Pagado' NOT NULL,
	"ts" bigint NOT NULL
);

-- Datos semilla: sin esto las pestañas de Inventario y Maquila arrancan vacías.
-- Ajusta las cantidades de stock y tarifas a tus valores reales cuando quieras
-- desde la app misma (Configuración/Maquila e Inventario Tostado son editables).
INSERT INTO "inventario" ("lote", "stock_lb", "ts") VALUES
	('Lavado', 0, extract(epoch from now()) * 1000),
	('Honey', 0, extract(epoch from now()) * 1000),
	('Natural', 0, extract(epoch from now()) * 1000),
	('Exotico', 0, extract(epoch from now()) * 1000);

INSERT INTO "maquila_tarifas" ("servicio", "precio_por_kg", "ts") VALUES
	('Trilla', 0, extract(epoch from now()) * 1000),
	('Tostión', 0, extract(epoch from now()) * 1000),
	('Molienda', 0, extract(epoch from now()) * 1000),
	('Empaque', 0, extract(epoch from now()) * 1000),
	('Selección', 0, extract(epoch from now()) * 1000);
