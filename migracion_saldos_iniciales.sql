-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Saldo inicial por cuenta (Juan/Inés/Joaquín/Efectivo) — lo que cada uno
-- ya tenía antes de empezar a usar la app, para que "Balance de cuentas"
-- en Resumen no arranque como si el negocio le debiera a todos desde
-- cero. Se edita desde Configuración → Precios → "Saldo inicial de cada
-- cuenta" — un valor único por persona, no algo que cambie cada mes.
CREATE TABLE IF NOT EXISTS "saldos_iniciales" (
	"persona" text PRIMARY KEY,
	"monto" numeric NOT NULL DEFAULT 0,
	"ts" bigint NOT NULL
);
