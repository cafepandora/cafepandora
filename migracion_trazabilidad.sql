-- Ejecuta esto completo en el SQL Editor de Supabase.
-- Crea las tres tablas de la cadena: cosecha -> pergamino -> trilla -> tueste.

-- 1) Lo que se recoge en la finca (café en cereza).
CREATE TABLE "cosechas" (
	"id" serial PRIMARY KEY,
	"fecha" bigint NOT NULL,              -- día de la recolección
	"kilos_cereza" double precision NOT NULL,
	"proceso" text NOT NULL,              -- Lavado | Honey | Natural | Exotico
	"kilos_pergamino_real" double precision, -- se llena cuando ya se pesó el pergamino seco
	"notas" text,
	"usuario" text,
	"ts" bigint NOT NULL
);

-- 2) Café en pergamino comprado a terceros para la marca.
CREATE TABLE "compras_pergamino" (
	"id" serial PRIMARY KEY,
	"fecha" bigint NOT NULL,
	"proveedor" text NOT NULL,
	"kilos_pergamino" double precision NOT NULL,
	"proceso" text NOT NULL,
	"costo" integer DEFAULT 0 NOT NULL,
	"notas" text,
	"usuario" text,
	"ts" bigint NOT NULL
);

-- 3) Cada tanda de tueste. Al guardarla, los kilos tostados se SUMAN
--    automáticamente al inventario del lote correspondiente.
CREATE TABLE "lotes_tueste" (
	"id" serial PRIMARY KEY,
	"fecha" bigint NOT NULL,
	"lote" text NOT NULL,                 -- Lavado | Honey | Natural | Exotico
	"kilos_verde" double precision NOT NULL,
	"kilos_tostado" double precision NOT NULL,
	"origen" text,                        -- 'Finca' | 'Comprado' | texto libre
	"notas_cata" text,
	"usuario" text,
	"ts" bigint NOT NULL
);
