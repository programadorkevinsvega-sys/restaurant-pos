# Fase 0 — Protección de la rama main

> **Objetivo:** impedir cambios directos y merges sin validaciones completas, sin permitir bypass ordinario a administradores.
>
> **Estado de ejecución:** política diseñada; la configuración de Branch Protection de GitHub no pudo leerse ni actualizarse desde la sesión conectada. No declarar esta regla activa hasta verificarla en Settings.

## 1. Rama objetivo

- Patrón exacto: \`main\`.
- Aplicación: todas las personas y automatizaciones que puedan escribir en la rama.
- Excepciones/bypass: lista vacía como política base. Los administradores también deben quedar sujetos a las reglas.
- No restringir pushes legítimos a ramas de trabajo. El código llega a main mediante PR.

## 2. Reglas obligatorias

| Ajuste | Valor |
|---|---|
| Require a pull request before merging | Activado |
| Required approvals | 1 aprobación independiente cuando exista un segundo revisor. Si el repositorio opera temporalmente con una sola persona, registrar excepción temporal y no simular una aprobación propia |
| Dismiss stale pull request approvals | Activado |
| Require approval of the most recent reviewable push | Activado cuando se exija aprobación |
| Require status checks to pass before merging | Activado |
| Require branches to be up to date before merging | Activado (strict) |
| Require conversation resolution before merging | Activado |
| Include administrators / Do not allow bypassing | Activado |
| Allow force pushes | Desactivado |
| Allow deletions | Desactivado |
| Restrict who can dismiss reviews | Solo mantenedores/admins designados, cuando el plan lo soporte |
| Require signed commits | No requerido en esta etapa; adoptar solo con política de firma y gestión de claves |
| Require linear history | No requerido mientras el repositorio permita merge commits |

No activar CODEOWNERS approval hasta mantener un archivo \`.github/CODEOWNERS\` revisado que refleje responsables reales.

## 3. Checks requeridos

Seleccionar los tres checks generados por el workflow \`.github/workflows/ci-pr.yml\`:

1. \`Pull Request CI / Backend, frontend and build checks\`
2. \`Pull Request CI / PostgreSQL migrations and runtime integration (PG 16)\`
3. \`Pull Request CI / PostgreSQL migrations and runtime integration (PG 17)\`

Si el selector de GitHub muestra solo el nombre del job, seleccionar el mismo nombre sin el prefijo del workflow. No seleccionar checks históricos, estados de despliegue ni un check genérico que no corresponda a estos jobs.

Al agregar una matriz de PostgreSQL o renombrar jobs, actualizar la lista de checks obligatorios y verificarla con un PR de prueba antes de retirar los checks anteriores.

## 4. Configuración desde GitHub

1. Abrir el repositorio \`programadorkevinsvega-sys/restaurant-pos\`.
2. Ir a **Settings → Branches → Add branch protection rule** (o crear un Ruleset dirigido a branches si la interfaz del repositorio usa Rulesets).
3. Definir el patrón \`main\`.
4. Activar los requisitos de PR, checks, rama actualizada, resolución de conversaciones y restricciones de force push/eliminación descritos arriba.
5. Añadir los tres checks exactos de la sección 3.
6. Activar la aplicación a administradores y dejar vacía la lista de bypass.
7. Guardar y comprobar la regla reabriendo la configuración de \`main\`.

## 5. CD y entorno de producción

El workflow de despliegue existente se activa en push a \`main\` y aplica migraciones desde la VM antes de activar el release. La protección de rama garantiza que el push normal provenga de un PR validado, pero no sustituye una política de despliegue.

Como endurecimiento adicional, revisar en **Settings → Environments → production**:
- limitar deployment branches a \`main\`;
- mantener los secretos de despliegue únicamente en el environment;
- requerir aprobación manual de un responsable distinto del autor para migraciones destructivas, backfills o cambios de alto impacto;
- no configurar una espera manual para cada release ordinario sin decidir primero el cambio operativo.

El environment \`production\` no debe exponerse al workflow de Pull Request.

## 6. Verificación y evidencia de activación

La protección queda **Activa** solo cuando se adjunta:
- captura o exportación de la regla asociada a \`main\`, sin datos sensibles;
- lista de checks requeridos;
- evidencia de que un PR sin un check aprobado no puede fusionarse;
- evidencia de que los administradores no tienen bypass ordinario;
- fecha y responsable que realizó la configuración.

Hasta recopilar esa evidencia, el estado es **Pendiente de configuración/verificación**.
