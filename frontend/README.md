# Restaurant POS - Frontend

Frontend Next.js independiente. No consulta Supabase directamente: la interfaz invoca casos de uso; estos dependen de puertos de repositorio, implementados por adaptadores HTTP que consumen el backend.

## Arquitectura

- `src/modules/*/domain`: modelos de negocio y contratos (puertos).
- `src/modules/*/application`: casos de uso y validaciones.
- `src/modules/*/infrastructure`: adaptadores HTTP y composición de dependencias.
- `src/components`: presentación de los flujos, apoyada en `src/components/ui`.
- `src/app`: composición de interfaz y coordinación de estado.
- `src/shared/infrastructure`: cliente HTTP transversal.

Los módulos actuales cubren catálogo, pedidos, mesas, reservaciones, entregas, contabilidad y configuración. Los adaptadores usan los endpoints existentes del backend; sus contratos deben mantenerse al implementar los cambios del backend.

## Ejecutar en local

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Configura `NEXT_PUBLIC_API_URL` en `.env.local` con la URL base de la API terminada en `/api`. No hay una URL predeterminada en el código.

## Validar

```bash
pnpm typecheck
pnpm lint
pnpm build
```
