# Roadmap de ampliación — Chili POS

> **Estado:** propuesta planificada; todas las iniciativas de este documento comienzan como pendientes de implementación y validación.  
> **Alcance:** ampliaciones de seguridad y administración de cuentas, y capacidades financieras/contables.  
> **Regla:** este roadmap no declara funcionalidades como implementadas ni autoriza decisiones fiscales, contables o comerciales que todavía no hayan sido aprobadas.

## Objetivo

Ampliar Chili POS para cubrir el ciclo de vida de las cuentas de usuario y las operaciones financieras del restaurante, manteniendo el backend como autoridad de negocio, la persistencia en PostgreSQL y la interfaz como cliente de la API propia.

## Principios y límites

- Mantener la arquitectura existente y verificar los módulos, contratos, migraciones y convenciones actuales antes de diseñar cada fase.
- No introducir un proveedor externo de autenticación como sustituto del backend propio.
- Aplicar autorización en backend; ocultar controles en frontend no constituye seguridad.
- Preservar trazabilidad, integridad transaccional, aislamiento y auditoría de operaciones sensibles.
- No modificar registros contables, documentos emitidos ni movimientos conciliados de forma destructiva. Las correcciones deben conservar historial mediante reversos, notas o ajustes según las reglas aprobadas.
- No asumir tasas, impuestos, numeración fiscal, plazos de cartera, métodos de costeo, tolerancias de conciliación ni reglas de cierre. Documentar y aprobar las decisiones correspondientes antes de implementarlas.
- Separar claramente ventas/pagos de clientes, obligaciones con proveedores y movimientos de caja/banco.
- No marcar una fase como terminada por tener pantallas o endpoints: debe cumplir los criterios de aceptación y las evidencias indicadas aquí.

## Secuencia de fases

| Fase | Área | Resultado esperado | Estado |
|---|---|---|---|
| A1 | Recuperación y cambio de contraseña | Autoservicio seguro de credenciales | Pendiente |
| A2 | Administración de usuarios | Gestión desde la aplicación con permisos | Pendiente |
| A3 | Sesiones y dispositivos | Consulta y revocación de sesiones | Pendiente |
| A4 | Políticas de cuentas | Bloqueo, desbloqueo y controles administrativos | Pendiente |
| F1 | Fundamentos contables | Modelo contable, periodos y catálogo de cuentas | Pendiente |
| F2 | Gastos | Registro, aprobación y seguimiento de gastos | Pendiente |
| F3 | Cuentas por pagar | Obligaciones a proveedores y pagos | Pendiente |
| F4 | Cuentas por cobrar | Saldos pendientes y recaudos | Pendiente |
| F5 | Conciliación de pagos | Comparación de pagos internos con fuentes externas | Pendiente |
| F6 | Caja, cierres y arqueos | Control de efectivo y cierre de turnos/cajas | Pendiente |
| F7 | Libro contable | Asientos, mayor y reportes contables | Pendiente |
| F8 | Facturación electrónica | Emisión, seguimiento y contingencia fiscal | Pendiente |

Las fases A1–A4 pueden desarrollarse como una línea de seguridad. Las fases F1–F8 tienen dependencias financieras y deben respetar el orden indicado, aunque el diseño detallado puede dividirse en entregas pequeñas.

---

# Línea A — Seguridad y administración de cuentas

## A1. Recuperación y cambio de contraseña

**Incluye**
- Flujo de recuperación iniciado por el usuario mediante un canal verificado.
- Tokens de recuperación aleatorios, de un solo uso, con expiración y almacenamiento seguro (hash del token).
- Respuestas que no revelen si un correo está registrado.
- Invalidación del token al usarlo, expirar o emitir uno nuevo, según política aprobada.
- Cambio de contraseña para una sesión autenticada, solicitando verificación de la contraseña actual o un mecanismo de reautenticación aprobado.
- Revocación de sesiones existentes después de una recuperación; definir explícitamente el tratamiento de la sesión actual en el cambio voluntario.
- Notificación de seguridad y auditoría sin registrar contraseñas, tokens ni secretos.

**Criterios de aceptación**
- Un token válido permite una sola recuperación; token vencido, reutilizado, revocado o alterado es rechazado.
- El flujo no permite enumerar cuentas.
- La contraseña se almacena con el algoritmo y parámetros de hash aprobados para el proyecto; nunca en texto plano.
- Se aplican límites de frecuencia y protección contra abuso.
- Se prueban concurrencia, expiración, repetición, errores del canal de entrega y revocación de sesiones.
- La interfaz ofrece estados claros sin filtrar información sensible.

## A2. Administración de usuarios desde la aplicación

**Incluye**
- Listado, búsqueda, filtros y detalle de usuarios.
- Alta, edición de datos permitidos, activación/desactivación y asignación de roles/permisos.
- Invitación o creación de cuenta con activación segura; no exponer contraseñas temporales.
- Confirmaciones para acciones de alto impacto.
- Registro de actor, objetivo, acción, fecha y resultado en auditoría.

**Criterios de aceptación**
- Solo roles autorizados pueden administrar usuarios y asignar permisos.
- Un usuario no puede elevar sus propios privilegios ni crear una vía para eludir el último administrador válido.
- Se impiden duplicados según las reglas de identidad aprobadas.
- La API valida cada operación independientemente de la interfaz.
- Se prueban permisos, estados, concurrencia, conflictos, usuarios desactivados y operaciones no autorizadas.

## A3. Gestión de sesiones y dispositivos

**Incluye**
- Ver sesiones activas con datos mínimos útiles: fecha de creación, última actividad, dispositivo/navegador y ubicación aproximada solo si existe una fuente fiable y está aprobada.
- Revocar una sesión concreta y cerrar todas las demás sesiones.
- Revocación inmediata en backend y rechazo de refresh tokens/sesiones revocados.
- Identificar la sesión actual sin exponer identificadores secretos.

**Criterios de aceptación**
- Una sesión revocada no puede renovar ni recuperar acceso.
- Un usuario solo administra sus propias sesiones; administradores siguen permisos explícitos y auditoría.
- La revocación masiva y por dispositivo es consistente bajo concurrencia.
- No se almacenan ni muestran tokens completos ni secretos de sesión.

## A4. Políticas avanzadas de bloqueo y administración de cuentas

**Decisiones previas**
- Umbrales y ventanas de intentos fallidos, duración de bloqueos y criterios de desbloqueo.
- Diferencia entre bloqueo temporal, suspensión administrativa y cuenta desactivada.
- Reglas de desbloqueo automático/manual, alertas y tratamiento de cuentas privilegiadas.
- Política de sesiones ante bloqueo, suspensión o cambio de permisos.

**Incluye**
- Estado de cuenta explícito y transiciones auditables.
- Controles administrativos de bloqueo/desbloqueo con motivo.
- Protección contra fuerza bruta y abuso distribuido, sin convertir errores transitorios en bloqueos permanentes.
- Auditoría y métricas de eventos de seguridad.

**Criterios de aceptación**
- Las transiciones inválidas se rechazan en backend.
- Los bloqueos se aplican de forma consistente entre instancias.
- Los administradores no pueden borrar el historial de seguridad mediante la interfaz.
- Se prueban umbrales, ventanas, expiración, desbloqueo, concurrencia, escalamiento de privilegios y fallos de almacenamiento.

---

# Línea F — Finanzas y contabilidad

## F1. Fundamentos contables y periodos

**Objetivo:** establecer la base común antes de registrar operaciones contables.

**Incluye**
- Definición del modelo contable y del catálogo de cuentas.
- Configuración de moneda funcional, precisión, periodos y fechas de corte.
- Reglas de débito/crédito, cuentas de control y dimensiones analíticas necesarias.
- Identificadores y vínculos entre ventas, pagos, gastos, cartera, proveedores, caja y asientos.
- Política de apertura, cierre y reapertura de periodos, con permisos y auditoría.

**Decisiones previas**
- Marco contable aplicable y asesoría contable responsable.
- Plan de cuentas, centros de costo y tratamiento de impuestos.
- Si habrá una sola entidad legal por instalación o más de una.
- Reglas de redondeo, fecha contable y reconocimiento de ingresos/gastos.

**Criterios de aceptación**
- Las reglas contables están documentadas y aprobadas antes de generar asientos.
- Importes usan tipos decimales exactos; no se usa punto flotante para dinero.
- Las operaciones contabilizadas mantienen trazabilidad a su documento de origen.
- Los periodos cerrados impiden contabilizaciones no autorizadas.

## F2. Gastos

**Incluye**
- Registro de gastos con tercero/proveedor, categoría, fecha, descripción, importes, impuestos, medio de pago y soportes adjuntos.
- Estados de borrador, pendiente de aprobación, aprobado, rechazado, pagado y anulado, ajustados al flujo aprobado.
- Aprobaciones por rol y límites configurables solo después de aprobación del negocio.
- Relación con caja/banco, cuentas por pagar y asiento contable cuando corresponda.

**Criterios de aceptación**
- No se registra un gasto pagado sin el movimiento de pago relacionado.
- Se previenen duplicados según reglas definidas (referencia, tercero, fecha e importe).
- Cambios y aprobaciones quedan auditados.
- Los documentos adjuntos tienen controles de acceso y validación.
- Se prueban impuestos, redondeos, duplicados, reversos, permisos y fallos transaccionales.

## F3. Cuentas por pagar

**Incluye**
- Registro de facturas/documentos de proveedores, vencimientos, saldo pendiente y estado.
- Pagos totales y parciales, anticipos, notas/ajustes y saldo restante.
- Enlace con gastos, proveedores, caja/banco y libro contable.
- Reportes de vencimientos y obligaciones.

**Criterios de aceptación**
- La suma de aplicaciones de pago no supera el saldo disponible, salvo anticipos/créditos explícitamente modelados.
- Los pagos parciales mantienen el saldo correcto.
- No se eliminan obligaciones con movimientos aplicados; se usan anulaciones o reversos auditados.
- Se prueban concurrencia de pagos, duplicados, vencimientos, reversos y permisos.

## F4. Cuentas por cobrar

**Incluye**
- Registro de saldos exigibles originados por ventas a crédito u otros documentos autorizados.
- Clientes/deudores, vencimientos, pagos parciales, anticipos, notas/ajustes y saldo pendiente.
- Estados y reportes de cartera, antigüedad y recaudos.
- Integración con pedidos/ventas, pagos, caja/banco y libro contable.

**Criterios de aceptación**
- No se crea cartera automáticamente para ventas de contado sin una regla aprobada.
- Los recaudos se aplican una sola vez y conservan el documento de origen.
- El saldo no puede quedar negativo por concurrencia o duplicación, excepto créditos/anticipos modelados.
- Se prueban pagos parciales, múltiples medios, reversos, notas, duplicados y permisos.

## F5. Conciliación de pagos

**Incluye**
- Importación o recepción controlada de movimientos de pasarelas, bancos y otros medios aprobados.
- Normalización de referencias, fechas, importes, moneda, comisiones y estados.
- Reglas de coincidencia exacta y casos para revisión manual.
- Detección de pagos faltantes, duplicados, diferencias, contracargos y devoluciones cuando el proveedor exponga esos eventos.
- Trazabilidad de cada movimiento externo a pagos/ventas internos.

**Decisiones previas**
- Proveedores y formatos/fuentes de conciliación.
- Autoridad de cada fuente para confirmar el estado final.
- Tolerancias de fecha e importe, tratamiento de comisiones y política de resolución de diferencias.

**Criterios de aceptación**
- La importación es idempotente y conserva el dato externo original necesario para auditoría.
- Una coincidencia no puede aplicarse a más de una operación.
- Las coincidencias automáticas y manuales quedan diferenciadas y auditadas.
- Ningún movimiento ambiguo se marca como conciliado automáticamente.
- Se prueban duplicados, retrasos, eventos fuera de orden, diferencias, reintentos y concurrencia.

## F6. Caja, cierres y arqueos

**Incluye**
- Apertura de caja/turno con responsable y fondo inicial.
- Registro de entradas, salidas, retiros, ingresos y pagos asociados.
- Cierre con saldo esperado por medio de pago, conteo declarado y diferencia.
- Arqueos parciales y finales, observaciones, aprobación y ajustes/reversos auditados.
- Reportes por caja, responsable, turno, fecha y medio de pago.

**Decisiones previas**
- Modelo de cajas y turnos (una caja por local, varias cajas o cajas por terminal).
- Quién puede abrir, cerrar, reabrir y aprobar diferencias.
- Tratamiento de ventas sin efectivo, propinas, retiros y gastos menores.

**Criterios de aceptación**
- No se permiten movimientos en una caja cerrada salvo flujo explícito de reapertura.
- El saldo esperado se calcula desde movimientos persistidos, no desde valores enviados por el frontend.
- Los cierres conservan saldo esperado, saldo contado y diferencia.
- Reaperturas y ajustes requieren permiso y motivo.
- Se prueban cierres concurrentes, movimientos simultáneos, diferencias, pagos mixtos, reintentos y recuperación ante fallos.

## F7. Libro contable

**Incluye**
- Generación de asientos balanceados desde eventos/documentos de negocio aprobados.
- Diario, mayor, balance de comprobación y consulta por periodo/cuenta/dimensión.
- Asientos manuales controlados, reversos y ajustes con autorización.
- Cierre de periodos y trazabilidad hasta el documento origen.
- Exportación de reportes según formatos aprobados.

**Criterios de aceptación**
- Todo asiento contabilizado cumple débitos = créditos.
- Los asientos contabilizados son inmutables; las correcciones se realizan mediante reversos/ajustes.
- La contabilización es idempotente y no duplica asientos ante reintentos.
- Los reportes cuadran con los movimientos y saldos de las cuentas.
- Se prueban límites de periodo, concurrencia, reversos, redondeos, integridad referencial y recuperación.

## F8. Facturación electrónica

**Objetivo:** emitir documentos electrónicos válidos para la jurisdicción y el régimen fiscal aplicables.

**Incluye**
- Levantamiento de requisitos fiscales, documentos soportados y responsabilidades del emisor.
- Configuración segura de identificación fiscal, resolución/rangos, certificados/credenciales y ambientes.
- Generación, validación, transmisión, respuesta, almacenamiento y consulta del documento y sus eventos.
- Representación imprimible/descargable y entrega al cliente.
- Notas crédito/débito, contingencia, reintentos y trazabilidad cuando apliquen.
- Integración con ventas, pagos, clientes, impuestos y contabilidad sin duplicar reconocimiento financiero.

**Decisiones previas obligatorias**
- Confirmar país, entidad emisora, régimen y obligaciones aplicables con asesoría tributaria.
- Para Colombia, validar los requisitos vigentes de DIAN, proveedor tecnológico si corresponde, resolución de numeración, firma/certificado, CUFE/CUDE y documentos/eventos exigibles antes de diseñar el flujo.
- Definir proveedor/integración, ambientes de pruebas y producción, custodia/rotación de secretos y política de contingencia.

**Criterios de aceptación**
- No se emite en producción sin validación fiscal y pruebas de certificación requeridas.
- Cada documento conserva XML/representación y respuestas oficiales, con integridad y acceso controlado.
- Reintentos no generan documentos duplicados ni consumen numeración indebidamente.
- Rechazos, contingencias, notas y eventos se gestionan con estados explícitos y auditables.
- Se prueban numeración, firma, validación, aceptación/rechazo, indisponibilidad del proveedor/autoridad, reintentos y recuperación.

---

## Dependencias principales

1. A1 debe preceder a la habilitación de autoservicio de credenciales; A2–A4 requieren autorización y auditoría coherentes.
2. F1 precede a la contabilización formal de gastos, cartera, pagos, caja y facturación.
3. F2 alimenta F3 cuando un gasto genera una obligación con proveedor.
4. F3 y F4 requieren reglas claras de pagos, anticipos, notas y saldos.
5. F5 necesita contratos e identificadores estables de pagos y fuentes externas; puede diseñarse en paralelo, pero su conciliación productiva depende de esos contratos.
6. F6 necesita movimientos de caja y medios de pago definidos; sus cierres deben alimentar la contabilidad.
7. F7 consolida los sublibros y operaciones de F2–F6.
8. F8 depende de decisiones fiscales y debe integrarse con ventas y contabilidad; no debe convertirse en el único registro de pagos ni reemplazar el libro contable.

## Definición de terminado para cada fase

Una fase solo puede marcarse como **completada** cuando cumple todo lo siguiente:

- Requisitos funcionales y reglas de negocio documentados, incluyendo decisiones pendientes resueltas.
- Diseño de dominio, contratos API, permisos, persistencia y migraciones revisados.
- Implementación real en backend y frontend; sin mocks, stubs, TODOs ni rutas ficticias en producción.
- Validaciones de entrada, autorización, aislamiento, auditoría, idempotencia y manejo seguro de errores.
- Pruebas unitarias, integración con PostgreSQL/Redis/proveedores reales o entornos oficiales de prueba, concurrencia y casos negativos.
- Pruebas de regresión y E2E de los flujos afectados.
- Formato, lint, typecheck, build y suite de pruebas del repositorio aprobados.
- Documentación operativa, configuración, secretos, despliegue, rollback y observabilidad actualizados.
- Evidencia de CI y verificación en el entorno objetivo.
- Roadmap y documento de aceptación actualizados con enlaces a PR, commits y ejecuciones verificables.

## Riesgos y decisiones que bloquean implementación

| Tema | Decisión requerida |
|---|---|
| Recuperación de contraseña | Canal de entrega, verificación de identidad, expiración y revocación |
| Administración de usuarios | Matriz de roles/permisos y protección del último administrador |
| Bloqueos | Umbrales, ventanas, duración, desbloqueo y tratamiento de administradores |
| Contabilidad | Marco aplicable, plan de cuentas, periodos, moneda y reconocimiento |
| Gastos y cartera | Aprobaciones, vencimientos, anticipos, notas y reglas de saldo |
| Conciliación | Fuentes, referencias, tolerancias, comisiones y autoridad de estados |
| Caja | Modelo de turnos/cajas, responsables y autorización de diferencias |
| Facturación electrónica | Jurisdicción, régimen, documentos, proveedor y requisitos fiscales vigentes |

## Seguimiento

- Mantener las fases en **Pendiente** hasta que exista implementación y evidencia verificable.
- Dividir cada fase en PRs pequeños y coherentes sin romper sus criterios de aceptación.
- Actualizar este documento en el mismo PR que cierre cada fase.
- No asignar fechas ni estimaciones hasta completar el descubrimiento técnico y resolver las decisiones bloqueantes.
