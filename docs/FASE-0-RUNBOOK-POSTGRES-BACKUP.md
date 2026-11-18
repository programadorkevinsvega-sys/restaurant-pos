# Fase 0 — Runbook de inspección PostgreSQL y verificación de backup

> **Propósito:** capturar evidencia reproducible de producción sin modificar datos, roles, configuración ni infraestructura. La restauración de prueba se realiza únicamente en un entorno aislado.
>
> **Estado:** procedimiento preparado; todavía no ejecutado. No se afirma que producción esté inspeccionada ni que exista un backup restaurable.

## 1. Límites de seguridad

1. La inspección normal usa una cuenta PostgreSQL temporal/de solo lectura, sin SUPERUSER, CREATEDB, CREATEROLE ni BYPASSRLS. No usar la credencial de MIGRATIONS_DATABASE_URL para inspección.
2. La credencial se obtiene del gestor seguro o mecanismo de secretos aprobado; no se imprime, copia al historial, pega en el chat ni incorpora a logs o PR.
3. La captura inicial se hace desde una conexión TLS validada y dentro de una transacción READ ONLY.
4. No ejecutar INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, GRANT, REVOKE, VACUUM FULL, migraciones ni restauraciones sobre producción.
5. No hacer COUNT(*) de todas las tablas en horario de carga. Primero usar estimaciones de estadísticas; los conteos exactos se acuerdan para tablas críticas y ventanas de bajo impacto.
6. Los resultados completos pueden contener metadatos sensibles. Guardarlos en ubicación privada con permisos restrictivos; para el repositorio/PR solo compartir un resumen anonimizado.

La cuenta de inspección puede necesitar acceso de lectura a catálogos y vistas estadísticas. Si una consulta es denegada, no elevarla a superusuario: solicitar al DBA que ejecute esa consulta puntual y entregue el resultado sanitizado.

## 2. Preparación de la sesión

Ejecutar desde un shell autorizado con psql instalado. La variable INSPECTION_DATABASE_URL debe estar exportada desde el mecanismo seguro de secretos; nunca escribir la URI directamente en el comando.

    set -Eeuo pipefail
    umask 077
    test -n "$INSPECTION_DATABASE_URL" || { printf "Define INSPECTION_DATABASE_URL mediante el gestor seguro de secretos\n" >&2; exit 1; }

    psql "$INSPECTION_DATABASE_URL" \
      --no-psqlrc \
      --set=ON_ERROR_STOP=1 \
      --echo-errors \
      <<'SQL'
    BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

    SELECT
      current_database() AS database_name,
      current_user AS inspection_role,
      session_user AS session_role,
      inet_server_addr() AS server_address,
      inet_server_port() AS server_port,
      current_setting('server_version') AS postgres_version,
      pg_postmaster_start_time() AS server_started_at,
      now() AS inspected_at_utc,
      pg_size_pretty(pg_database_size(current_database())) AS database_size;

    SELECT extname AS extension_name, extversion AS extension_version
    FROM pg_extension ORDER BY extname;

    SELECT
      n.nspname AS schema_name,
      c.relname AS object_name,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'S' THEN 'sequence'
        ELSE c.relkind::text
      END AS object_type,
      pg_get_userbyid(c.relowner) AS owner_name,
      c.reltuples::bigint AS estimated_rows,
      CASE WHEN c.relkind IN ('r', 'p', 'm')
        THEN pg_size_pretty(pg_total_relation_size(c.oid))
        ELSE NULL
      END AS total_size,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    ORDER BY n.nspname, c.relkind, c.relname;

    SELECT
      schemaname AS schema_name,
      relname AS table_name,
      n_live_tup AS estimated_live_rows,
      n_dead_tup AS estimated_dead_rows,
      last_analyze,
      last_autoanalyze,
      last_vacuum,
      last_autovacuum
    FROM pg_stat_user_tables
    ORDER BY schemaname, relname;

    SELECT
      n.nspname AS schema_name,
      t.relname AS table_name,
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      con.convalidated AS is_validated,
      pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, t.relname, con.conname;

    SELECT
      schemaname AS schema_name,
      tablename AS table_name,
      indexname AS index_name,
      indexdef AS definition
    FROM pg_indexes
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schemaname, tablename, indexname;

    SELECT
      schemaname AS schema_name,
      tablename AS table_name,
      policyname AS policy_name,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    ORDER BY schemaname, tablename, policyname;

    SELECT
      rolname AS role_name,
      rolsuper AS is_superuser,
      rolinherit AS inherits_privileges,
      rolcreaterole AS can_create_roles,
      rolcreatedb AS can_create_databases,
      rolcanlogin AS can_login,
      rolreplication AS can_replicate,
      rolbypassrls AS bypasses_rls,
      rolconnlimit AS connection_limit,
      rolvaliduntil AS valid_until
    FROM pg_roles
    ORDER BY rolname;

    SELECT
      granted.rolname AS granted_role,
      member.rolname AS member_role,
      grantor.rolname AS grantor_role,
      m.admin_option
    FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid = m.roleid
    JOIN pg_roles member ON member.oid = m.member
    JOIN pg_roles grantor ON grantor.oid = m.grantor
    ORDER BY granted.rolname, member.rolname;

    SELECT
      table_schema,
      table_name,
      grantee,
      privilege_type,
      is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, grantee, privilege_type;

    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_userbyid(p.proowner) AS owner_name,
      p.prosecdef AS security_definer,
      p.proconfig AS function_settings
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, p.proname;

    SELECT to_regclass('public.schema_migrations') AS migration_history_table;

    COMMIT;
    SQL

La consulta de roles evita deliberadamente leer pg_authid, hashes de contraseñas o secretos. Las vistas de permisos pueden devolver datos incompletos si la cuenta de inspección no tiene privilegios de monitorización; registrar esa limitación en vez de inferir ausencia de roles o sesiones.

## 3. Consultas complementarias de estado

Ejecutar individualmente solo si el rol de inspección tiene permisos correspondientes:

    -- Estado de archivado WAL, si el servidor tiene archivado configurado.
    SELECT archived_count, last_archived_wal, last_archived_time,
           failed_count, last_failed_wal, last_failed_time, stats_reset
    FROM pg_stat_archiver;

    -- Conexiones y transacciones; no seleccionar query completa si pudiera contener PII.
    SELECT datname, usename, application_name, client_addr, state,
           wait_event_type, wait_event, now() - xact_start AS transaction_age
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
    ORDER BY xact_start NULLS LAST;

    -- Estado RLS por tabla.
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, c.relname;

No consultar ni compartir archive_command, variables de entorno del proceso, cadenas de conexión, argumentos de procesos o contenido de archivos .env: pueden contener credenciales. Para funciones SECURITY DEFINER se revisan además sus definiciones, search_path, owner y grants en una revisión DBA separada y controlada.

## 4. Historial de migraciones y reconciliación con Git

Después de confirmar que public.schema_migrations existe, consultar:

    SELECT version, applied_at
    FROM public.schema_migrations
    ORDER BY version;

Comparar esa lista con los archivos backend/src/migrations/*.sql del commit productivo exacto. Registrar:
- Migraciones versionadas aún no aplicadas.
- Versiones registradas sin archivo correspondiente.
- Diferencias de checksum si el mecanismo de despliegue conserva esa información.
- Objetos creados manualmente o desviaciones de esquema no representadas por migraciones.

El runner actual registra versión y fecha, ejecuta cada archivo en transacción y usa advisory lock; no registra checksum del contenido en el esquema revisado. No modificar la tabla histórica para "hacerla coincidir" sin un plan aprobado.

## 5. Objetivos de recuperación recomendados (propuesta para aprobar)

Estos son valores de partida recomendados para un POS transaccional de operación diaria; **no describen la capacidad actual ni se consideran objetivos aprobados** hasta que el negocio confirme presupuesto, criticidad y horarios de soporte.

| Objetivo | Valor de partida propuesto | Cómo se demuestra |
|---|---:|---|
| RPO de base productiva | ≤ 15 minutos | Recuperación PITR y comparación del último commit transaccional incluido |
| RTO de servicio de base de datos | ≤ 2 horas | Tiempo desde declaración del incidente hasta conexión validada de la base restaurada |
| Punto de recuperación (PITR) | Mínimo 14 días | Base backup válida y cadena WAL completa para los puntos solicitados |
| Backups base | Al menos uno diario | Catálogo con ejecuciones completas verificables |
| Protección de copia | Cifrado, destino independiente y copia no borrable por el usuario de runtime | Prueba de acceso, retención y protección frente a borrado |
| Prueba de restauración | Mensual automatizada/operativa; simulacro integral trimestral | Evidencia con duración, checks de integridad y desviaciones |

Criterios:
- Si la base está alojada en un servicio gestionado que ofrece PITR, comprobar retención, SLA, límites, regiones y costo; la existencia de PITR no sustituye el restore drill.
- Si se usa PostgreSQL autogestionado, preferir backups base más archivado continuo de WAL mediante la herramienta que ya opere el equipo. No asumir que basta con copiar el directorio de datos mientras PostgreSQL está activo.
- Los backups deben almacenarse fuera del mismo volumen/VM que aloja la base; idealmente en una cuenta/proyecto de almacenamiento separado con retención protegida.
- Las credenciales del backup no deben ser las del runtime y no deben residir dentro del dump.
- Revisar objetivos por crecimiento, volumen de transacciones y jurisdicción. Cifrado, retención legal y eliminación de copias deben cumplir las obligaciones de cada país.
- Si no se pueden cumplir RPO/RTO con el mecanismo actual, documentar la brecha, el costo y el plan correctivo antes de declarar continuidad operativa aprobada.

## 6. Inventario del mecanismo de backup

Primero identificar el mecanismo realmente utilizado, sin asumir que una herramienta concreta está instalada:

    for tool in pgbackrest barman wal-g restic rclone pg_dump pg_restore pg_verifybackup; do
      if command -v "$tool" >/dev/null 2>&1; then
        printf '%s: ' "$tool"
        "$tool" --version 2>/dev/null | head -n 1 || true
      else
        printf '%s: not installed in PATH\n' "$tool"
      fi
    done

    date -u
    systemctl list-timers --all --no-pager 2>/dev/null \
      | grep -Ei 'postgres|backup|pgbackrest|barman|wal|restic' || true

La salida anterior solo indica herramientas/timers visibles; no demuestra que un backup haya terminado correctamente. Completar la verificación con el sistema real (panel del proveedor, catálogo de backups, repositorio de backup o logs protegidos):

| Evidencia | Qué registrar |
|---|---|
| Identificador de backup | ID inmutable o nombre del conjunto |
| Cobertura | Base, roles/globales, extensiones, configuración necesaria y WAL/PITR si aplica |
| Hora | Inicio y fin UTC, antigüedad al momento de inspección |
| Integridad | Checksum/manifiesto y validación propia de la herramienta |
| Protección | Cifrado, acceso, destino, retención y protección frente a borrado |
| Resultado | Éxito/error y logs sanitizados |
| Recuperación | Punto temporal al que es posible recuperar y dependencias disponibles |

Si el mecanismo es administrado por un proveedor, conservar evidencia/exportación del proveedor y ejecutar una restauración real. Si es físico, revisar la verificación propia del base backup y la continuidad WAL. Si es lógico (pg_dump), validar el archivo y realizar pg_restore completo en un entorno aislado. Los roles/globales requieren tratamiento protegido separado: sus hashes y nombres internos no se publican en el PR.

## 7. Restauración de prueba — procedimiento obligatorio

1. Elegir un backup de producción con fecha, ID y cobertura conocidos.
2. Aprovisionar una instancia o VM temporal aislada. Bloquear acceso entrante no necesario y bloquear conexiones salientes a pasarelas, SMTP, webhooks, servicios de mensajería y producción.
3. Usar versión mayor compatible de PostgreSQL y las mismas extensiones requeridas. Documentar diferencias.
4. Restaurar datos y metadatos necesarios usando el procedimiento oficial de la herramienta. No restaurar sobre producción ni reutilizar su DATABASE_URL.
5. Ejecutar comprobaciones de catálogo, esquema, migraciones, owners/grants, extensiones, índices, constraints, secuencias, funciones y políticas.
6. Comparar conteos exactos y agregados críticos con un snapshot de referencia temporalmente coherente. Verificar relaciones huérfanas, integridad de órdenes/partidas, usuarios/sesiones y agregados de ventas/inventario sin publicar datos personales.
7. Ejecutar health check y consultas de lectura contra la restauración con configuración de aplicación de prueba. Deshabilitar procesos programados y cualquier efecto externo.
8. Medir tiempo de restauración y validación; comparar RPO/RTO observados con objetivos aprobados por negocio.
9. Guardar logs sanitizados, resultados, discrepancias, responsable y aprobación. Eliminar el entorno temporal mediante el procedimiento de destrucción segura después de conservar la evidencia permitida.

Un pg_restore --list o pg_verifybackup es evidencia complementaria, no el cierre. La prueba se considera aprobada solo después de restauración completa y verificaciones funcionales/de integridad.

## 8. Registro de evidencia de restauración

Completar sin incluir secretos ni PII:

| Campo | Resultado |
|---|---|
| Backup ID / punto de recuperación UTC | Pendiente |
| Mecanismo y versión de herramienta | Pendiente |
| PostgreSQL origen/destino y extensiones | Pendiente |
| Tamaño / checksum o manifiesto | Pendiente |
| Inicio / fin / duración de restore | Pendiente |
| Validación de esquema y migraciones | Pendiente |
| Conteos y agregados comparados | Pendiente |
| Constraints/relaciones inválidas | Pendiente |
| Health checks y consultas de lectura | Pendiente |
| RPO observado / objetivo aprobado | Pendiente |
| RTO observado / objetivo aprobado | Pendiente |
| Desviaciones y acciones correctivas | Pendiente |
| Responsable, fecha y aprobación | Pendiente |

## 9. Criterios de aceptación

La inspección productiva se aprueba cuando el inventario está completo, se sabe qué rol ejecutó cada consulta, todas las limitaciones de permisos se documentan y el informe está vinculado al commit/versión productiva.

La recuperación se aprueba cuando existe evidencia de una restauración integral aislada, con integridad verificada y tiempos observados comparados con RPO/RTO aprobados. No basta con un archivo, un estado "success" del scheduler o una lista de objetos.

Hasta ese momento, el estado de ambos entregables es **Pendiente**. No ejecutar migraciones multisucursal ni backfill productivo.
