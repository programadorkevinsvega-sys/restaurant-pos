# Roadmap maestro de ampliación — Chili POS

> **Estado general:** propuesta aprobada para planificación; las fases y subfases de este documento permanecen **Pendientes** hasta su implementación y verificación.
> **Modelo comercial confirmado:** una cadena de restaurantes perteneciente a una organización empresarial, con múltiples sucursales y una o varias entidades legales (NIT). Cada sucursal puede operar con una sola entidad legal o con varias; la relación es N:M.
> **Alcance:** evolución del POS actual hacia un sistema integral de gestión de restaurantes (Restaurant Management System, RMS).
> **Importante:** este documento define alcance futuro. No declara implementadas capacidades que no hayan sido verificadas en código, pruebas y entorno objetivo.

## 1. Objetivo y alcance del producto

Chili POS debe permitir administrar de forma integrada la operación de una cadena de restaurantes: catálogo, ventas, cocina, inventario, recetas, compras, personal, clientes, delivery, finanzas, contabilidad, analítica, sucursales, autoservicio y administración de plataforma.

La organización empresarial es el límite de propiedad de los datos. Las sucursales son unidades operativas subordinadas a esa organización. No se está diseñando un SaaS multi-tenant para que empresas de restaurantes independientes compartan la misma instalación.

### 1.1 Modelo organizacional objetivo

- **Organización/Grupo:** propietaria de la instalación, políticas y configuración corporativa.
- **Entidad legal:** entidad que contrata, factura, declara impuestos y mantiene libros contables. Una organización puede tener varias, cada una con su propio NIT y configuración propia de moneda y zona horaria.
- **Sucursal:** local operativo con dirección, configuración propia de moneda y zona horaria, horarios, mesas, cajas, personal y existencias. Puede estar vinculada a una o varias entidades legales mediante asignaciones explícitas.
- **Almacén:** coexistirán almacenes centrales propiedad de la organización y almacenes locales propiedad de cada sucursal. El inventario se controlará tanto por el total consolidado de cada almacén como por ubicaciones físicas internas (zonas, estanterías, cámaras, congeladores o áreas de preparación). El total del almacén se consolidará desde las ubicaciones para evitar duplicar existencias.
- **Usuario:** identidad única con asignaciones explícitas de organización, entidad legal y una o varias sucursales. Puede seleccionar la sucursal activa al iniciar sesión o cambiarla desde la aplicación; sus roles y permisos se validan para cada ámbito en backend. Se combinarán roles corporativos (propietario, administrador general, director de operaciones y responsable financiero) y roles operativos por sucursal (gerente, administrador de sucursal, cajero, mesero, cocinero y responsable de inventario), con permisos configurables por ámbito.
- **Configuración:** valores base corporativos con ajustes por entidad legal y sucursal; la precedencia cuando existan valores distintos se define según el tipo de parámetro.
- **Proveedores:** catálogo maestro corporativo compartido, con habilitación/relación operativa por entidad legal o sucursal; no se duplicará la identidad del proveedor por local.
- **Clientes:** identidad compartida en toda la cadena; las ventas, visitas e historial conservarán la sucursal de origen y, cuando corresponda, la entidad legal de la operación.
- **Promociones:** podrán ser corporativas para las sucursales designadas o locales para una sucursal específica; su ámbito y vigencia serán explícitos.
- **Otros recursos compartidos:** catálogo de productos, recetas, listas de precios y políticas declararán su ámbito corporativo, por entidad legal o por sucursal. Cada recurso conservará una identidad maestra cuando aplique y sus excepciones locales se modelarán como configuración relacionada, no como duplicados.

### 1.2 Reglas de aislamiento y operación multisucursal

1. Toda operación debe resolver y validar su organización y sucursal en backend; nunca confiar en identificadores de sucursal enviados por el cliente sin autorización.
2. Los permisos deben distinguir alcance corporativo, entidad legal, sucursal y recurso.
3. Un usuario de sucursal no puede consultar ni modificar información de otra sucursal salvo permiso explícito.
4. Los datos corporativos compartidos deben distinguirse de las configuraciones y excepciones locales.
5. Inventario, caja, turnos, comandas, reservas y métricas operativas pertenecen a una sucursal y, cuando aplique, a una ubicación concreta.
6. Los traslados entre sucursales son movimientos trazables con despacho, tránsito, recepción, diferencias y autorización.
7. Los informes consolidados deben conservar el detalle de origen y no mezclar monedas, entidades legales o periodos incompatibles.
8. La facturación y la contabilidad se asignan a la entidad legal correspondiente; una sucursal puede operar para una o varias entidades legales, pero cada operación fiscal/financiera debe identificar la entidad legal responsable. La sucursal es una dimensión operativa, no necesariamente un emisor fiscal.
9. Cada entidad legal y cada sucursal puede configurar su propia zona horaria. Las fechas se almacenan de forma consistente y se presentan según el ámbito temporal explícito de cada operación; los cierres deben usar reglas de corte aprobadas. La precedencia cuando ambos ámbitos tengan zonas horarias distintas queda pendiente.
10. No se introducirán tablas, APIs o filtros multi-tenant genéricos para terceros independientes sin una decisión futura que cambie formalmente el modelo comercial.
11. Un usuario puede tener asignaciones a varias sucursales y cambiar la sucursal activa al iniciar sesión o desde la aplicación; el cambio no amplía permisos y el backend valida la asignación vigente y los permisos en cada petición.
12. Los roles corporativos y los roles operativos por sucursal son ámbitos distintos. Un rol local no se propaga a otras sucursales y los permisos efectivos dependen de la asignación y configuración autorizada del ámbito.

## 2. Principios no negociables

- Backend propio como autoridad de negocio, autorización, validación y cálculo; frontend como cliente de contratos.
- PostgreSQL como persistencia transaccional principal; Redis solo para los usos justificados y sin convertir caché en fuente de verdad.
- Verificar arquitectura, módulos, migraciones, contratos, convenciones y pruebas existentes antes de implementar cada fase.
- Mantener límites organizacionales y de sucursal en consultas, comandos, trabajos asíncronos, exportaciones, cachés y auditoría.
- Aplicar DDD y separación de responsabilidades siguiendo la arquitectura real del repositorio, sin crear capas ceremoniales ni duplicar dominios.
- Dinero con tipos decimales exactos y moneda explícita por operación; nunca usar punto flotante para importes. Cada entidad legal y sucursal podrá configurar su moneda; la moneda funcional, las conversiones y la precedencia entre ámbitos requieren reglas aprobadas.
- Operaciones críticas transaccionales, idempotentes cuando corresponda y seguras ante reintentos y concurrencia.
- Auditoría de acciones sensibles: actor, alcance, recurso, acción, fecha, resultado y motivo, sin registrar contraseñas, tokens ni secretos.
- Los registros financieros, fiscales, inventarios y movimientos confirmados no se eliminan destructivamente; se corrigen mediante reversos, notas o ajustes auditables.
- No inventar políticas fiscales, contables, laborales, comerciales, de inventario ni de aprobación. Documentar las decisiones y obtener aprobación antes de codificarlas.
- No marcar una fase como completada por tener pantallas, endpoints, mocks o migraciones aisladas.
- No agregar dependencias, cambiar scripts ni alterar el proceso de despliegue fuera del alcance aprobado de la fase.

## 3. Estado y nomenclatura

Todos los elementos nuevos de este roadmap comienzan en **Pendiente**. Cuando una fase se trabaje, usar estos estados:

- **Pendiente:** no iniciada.
- **En análisis:** descubrimiento y decisiones en curso.
- **En desarrollo:** implementación activa.
- **En validación:** implementación terminada, falta evidencia de aceptación.
- **Bloqueada:** depende de una decisión, proveedor, requisito externo o fase previa.
- **Completada:** todos los criterios de terminado y evidencias están verificados.

Los módulos se identifican con códigos estables. Cada fase contiene subfases numeradas. Los PR pueden dividir el trabajo, pero no alteran la definición de terminado.

## 4. Catálogo maestro de módulos

### 4.1 Diez módulos nuevos

| Código | Módulo | Resultado |
|---|---|---|
| N01 | Inventario avanzado | Existencias confiables por almacén/sucursal, movimientos, lotes, conteos y trazabilidad |
| N02 | Recetas, ingredientes y costos | Fichas técnicas, rendimiento, consumo teórico y costo de preparación |
| N03 | Compras y proveedores | Abastecimiento, órdenes, recepción, devoluciones y evaluación |
| N04 | KDS y gestión de cocina | Producción coordinada por estaciones, prioridades y tiempos |
| N05 | Recursos humanos y personal | Expediente operativo, asignaciones, turnos, asistencia y permisos |
| N06 | CRM y fidelización | Clientes, historial, segmentos, puntos, recompensas y campañas |
| N07 | Logística y distribución | Despacho, repartidores, rutas, seguimiento y prueba de entrega |
| N08 | BI e inteligencia de negocio | Indicadores, análisis, tendencias, comparativas y pronósticos explicables |
| N09 | Gestión multisucursal | Gobierno corporativo, sucursales, recursos compartidos y consolidación |
| N10 | Atención y reservas avanzada | Reservas, lista de espera, asignación de mesas y experiencia del cliente |

### 4.2 Módulos existentes que se ampliarán

| Código | Módulo | Ampliación planificada |
|---|---|---|
| E01 | Operaciones | Plano de mesas, lista de espera, KDS, estaciones, turnos y control de tiempos |
| E02 | Contabilidad y finanzas | Cuentas por cobrar/pagar, gastos, libro contable, conciliación, impuestos y cierres |
| E03 | Informes | Rentabilidad, costos, inventario, productividad, tendencias y análisis comparativo |
| E04 | Delivery | Zonas, despacho inteligente, asignación, seguimiento y control de tiempos |
| E05 | Notificaciones | Alertas de inventario, pedidos retrasados, cierres pendientes y eventos críticos |
| E06 | Portal de autoservicio | Menú público, QR, pedidos web y seguimiento del pedido |
| E07 | Administración del sistema | Configuración global, auditoría, parámetros, integraciones y monitoreo |

### 4.3 Línea transversal de seguridad existente en el roadmap

| Código | Capacidad | Resultado |
|---|---|---|
| A1 | Recuperación y cambio de contraseña | Autoservicio seguro de credenciales |
| A2 | Administración de usuarios | Gestión desde la aplicación y permisos |
| A3 | Sesiones y dispositivos | Consulta y revocación de sesiones |
| A4 | Políticas de cuentas | Bloqueo, desbloqueo y controles administrativos |

### 4.4 Línea transversal financiera y contable

| Código | Capacidad | Resultado |
|---|---|---|
| F1 | Fundamentos contables y periodos | Modelo contable, moneda, cuentas y periodos |
| F2 | Gastos | Registro, aprobación y seguimiento |
| F3 | Cuentas por pagar | Obligaciones, vencimientos y pagos |
| F4 | Cuentas por cobrar | Cartera, recaudos y saldos |
| F5 | Conciliación de pagos | Correspondencia entre fuentes externas y operaciones internas |
| F6 | Caja, cierres y arqueos | Control de efectivo, medios de pago y turnos |
| F7 | Libro contable | Asientos, diario, mayor y balances |
| F8 | Facturación electrónica | Emisión y ciclo fiscal según jurisdicción |

## 5. Roadmap detallado de los diez módulos nuevos

# N01 — Inventario avanzado

**Objetivo:** controlar existencias reales y comprometidas por organización, sucursal, almacén y ubicación, con trazabilidad desde recepción hasta consumo, venta, transferencia, merma o ajuste.

### N01-F1 — Modelo y configuración de inventario
- N01-F1.1: definir artículos inventariables, materias primas, productos terminados, empaques y consumibles.
- N01-F1.2: unidades de medida, conversiones, precisión y unidades de compra/consumo.
- N01-F1.3: almacenes, ubicaciones, almacén central y almacenes por sucursal.
- N01-F1.4: políticas de inventario por artículo y alcance corporativo/sucursal.
  - Política comercial configurable por producto o sucursal por un administrador autorizado: bloquear la venta si el stock es insuficiente, permitir la venta aun sin stock suficiente o controlar manualmente la disponibilidad para desactivar un producto aunque tenga existencias. Los cambios deben quedar auditados; permisos exactos, precedencia y tratamiento operativo/contable del faltante se definirán antes de implementar.
- N01-F1.5: saldos iniciales, migración controlada y conciliación de apertura.

### N01-F2 — Libro de movimientos y existencias
- N01-F2.1: entradas, salidas, reservas y liberación de reservas.
- N01-F2.2: kardex inmutable y trazabilidad de origen, actor y documento.
- N01-F2.3: cálculo transaccional de existencias disponibles, físicas y comprometidas.
- N01-F2.4: idempotencia de movimientos y protección ante doble registro.
- N01-F2.5: consultas por artículo, almacén, sucursal, periodo y documento.

### N01-F3 — Conteos, ajustes y pérdidas
- N01-F3.1: conteos cíclicos y generales con captura por ubicación.
- N01-F3.2: comparación entre existencia teórica y conteo físico.
- N01-F3.3: aprobación de diferencias y ajustes con motivo.
- N01-F3.4: registro de mermas, desperdicio, daño, vencimiento y consumo interno.
- N01-F3.5: reversos y auditoría sin borrar movimientos confirmados.

### N01-F4 — Lotes, vencimientos y trazabilidad
- N01-F4.1: lotes, fechas de recepción, fabricación y vencimiento cuando apliquen.
- N01-F4.2: políticas FEFO/FIFO u otra política aprobada por tipo de artículo.
- N01-F4.3: alertas de vencimiento, cuarentena y bloqueo de lotes.
- N01-F4.4: trazabilidad hacia atrás y adelante de lotes y productos afectados.
- N01-F4.5: retiro/recall y registro de disposición final cuando aplique.

### N01-F5 — Reposición y transferencias multisucursal
- N01-F5.1: mínimos, máximos, punto de reposición y stock de seguridad.
- N01-F5.2: sugerencias de reposición basadas en consumo y plazos configurados.
- N01-F5.3: solicitud, autorización y despacho de transferencia entre sucursales.
- N01-F5.4: recepción total/parcial, diferencias, daños y rechazo.
- N01-F5.5: tránsito entre almacenes y conciliación de transferencia.

### N01-F6 — Integraciones y cierre
- N01-F6.1: consumo por recetas y producción.
- N01-F6.2: recepción desde compras y devoluciones a proveedores.
- N01-F6.3: afectación desde ventas, cancelaciones y devoluciones.
- N01-F6.4: valoración de inventario según método aprobado.
- N01-F6.5: pruebas de concurrencia, aislamiento entre sucursales, integridad y rendimiento.

**Cierre N01:** ningún flujo puede modificar existencias sin movimiento trazable; los saldos deben poder reconstruirse o verificarse contra el libro de movimientos; las transferencias no pueden crear ni perder unidades silenciosamente.

# N02 — Recetas, ingredientes y costos

**Objetivo:** definir cómo se prepara cada producto, qué consume, cuánto rinde y cuál es su costo calculado, sin confundir precio de venta con costo.

### N02-F1 — Catálogo técnico y unidades
- N02-F1.1: ingredientes, subrecetas, productos preparados y materiales auxiliares.
- N02-F1.2: unidades, conversiones, densidades y rendimientos cuando sean necesarios.
- N02-F1.3: alérgenos, restricciones y advertencias alimentarias con fuente verificable.
- N02-F1.4: versiones de receta y vigencia temporal.
- N02-F1.5: alcance corporativo o variación autorizada por sucursal.

### N02-F2 — Fichas técnicas y preparación
- N02-F2.1: composición, cantidades, pasos, tiempos y equipos.
- N02-F2.2: subrecetas, ingredientes opcionales y sustituciones permitidas.
- N02-F2.3: tamaños, variantes, modificadores y porciones.
- N02-F2.4: rendimiento esperado, merma técnica y rendimiento real.
- N02-F2.5: publicación y versionado sin alterar pedidos históricos.

### N02-F3 — Costeo
- N02-F3.1: costo de ingrediente desde compras e inventario.
- N02-F3.2: costo por receta, porción, variante y modificador.
- N02-F3.3: costos adicionales configurables (empaque u otros insumos).
- N02-F3.4: historial de costo y comparación entre costo estándar y real.
- N02-F3.5: margen y precio sugerido como información; no modificar precios automáticamente sin política aprobada.

### N02-F4 — Consumo y producción
- N02-F4.1: descuento teórico de ingredientes al confirmar los eventos de venta definidos.
- N02-F4.2: órdenes de preparación/lotes de producción cuando aplique.
- N02-F4.3: consumo real, desperdicio y desviaciones de receta.
- N02-F4.4: sustituciones controladas y registro de quién las autorizó.
- N02-F4.5: reversión correcta ante cancelaciones, devoluciones y fallos.

### N02-F5 — Calidad e integración
- N02-F5.1: validación de disponibilidad de ingredientes y alternativas autorizadas.
- N02-F5.2: consistencia de versiones de receta en pedidos históricos.
- N02-F5.3: integración con inventario, compras, catálogo, KDS e informes.
- N02-F5.4: pruebas de conversiones, precisión, lotes, concurrencia y aislamiento.
- N02-F5.5: auditoría de cambios y reportes de desviación.

**Cierre N02:** todo costo debe poder explicarse por sus componentes, cantidades, unidades, fuente de precio y versión de receta.

# N03 — Compras y proveedores

**Objetivo:** gestionar abastecimiento desde la solicitud hasta la recepción, factura/obligación y evaluación del proveedor.

### N03-F1 — Proveedores y condiciones
- N03-F1.1: ficha, identificación, contactos y estado del proveedor.
- N03-F1.2: productos, referencias, unidades y equivalencias por proveedor.
- N03-F1.3: listas de precios, vigencia, moneda y condiciones.
- N03-F1.4: plazos, mínimos, días de entrega y condiciones de pago.
- N03-F1.5: documentación, vencimientos y auditoría del proveedor.

### N03-F2 — Solicitudes y órdenes de compra
- N03-F2.1: solicitud de compra desde sucursal o almacén central.
- N03-F2.2: consolidación de necesidades entre sucursales.
- N03-F2.3: cotizaciones y comparación de ofertas.
- N03-F2.4: orden de compra, aprobación por límites y envío al proveedor.
- N03-F2.5: cambios, cancelaciones y cierre de orden con historial.

### N03-F3 — Recepción y devoluciones
- N03-F3.1: recepción parcial o total contra orden.
- N03-F3.2: verificación de cantidades, calidad, lote y vencimiento.
- N03-F3.3: diferencias, faltantes, sustituciones y recepción rechazada.
- N03-F3.4: entrada a almacén e inventario con referencia a la recepción.
- N03-F3.5: devolución al proveedor, nota y ajuste de existencias.

### N03-F4 — Facturas y cuentas por pagar
- N03-F4.1: captura y validación de documento del proveedor.
- N03-F4.2: cotejo orden-recepción-factura cuando aplique.
- N03-F4.3: diferencias de precio, cantidad, impuesto y cargos.
- N03-F4.4: creación/enlace de obligación en cuentas por pagar.
- N03-F4.5: pagos, anticipos, notas y conciliación sin duplicar registros.

### N03-F5 — Desempeño y cierre
- N03-F5.1: puntualidad, calidad, diferencias y cumplimiento.
- N03-F5.2: historial de precios y variaciones.
- N03-F5.3: indicadores por proveedor, producto y sucursal.
- N03-F5.4: permisos, aprobaciones, segregación de funciones y auditoría.
- N03-F5.5: pruebas de duplicados, recepción concurrente, devoluciones e integridad.

**Cierre N03:** cada entrada de inventario debe tener origen documentado y cada obligación debe reconciliarse con sus documentos fuente.

# N04 — KDS y gestión de cocina

**Objetivo:** coordinar la producción de pedidos por estaciones, prioridades y tiempos, con sincronización confiable entre salón, caja, delivery y cocina.

### N04-F1 — Modelo de producción
- N04-F1.1: estaciones, áreas, dispositivos y sucursal.
- N04-F1.2: reglas de enrutamiento de productos/variantes a estaciones.
- N04-F1.3: tickets, partidas, modificadores, notas y restricciones.
- N04-F1.4: estados de preparación y transiciones válidas.
- N04-F1.5: configuración de tiempos objetivo por producto/estación.

### N04-F2 — Pantalla de cocina
- N04-F2.1: cola de comandas en tiempo real.
- N04-F2.2: agrupación por pedido, estación, prioridad y hora.
- N04-F2.3: iniciar, pausar, terminar y marcar incidencia.
- N04-F2.4: identificación visual de retrasos sin depender solo del color.
- N04-F2.5: vistas por estación, cocina completa y expedición.

### N04-F3 — Coordinación de preparación
- N04-F3.1: envío automático/manual de partidas según evento del pedido.
- N04-F3.2: sincronización de preparación paralela entre estaciones.
- N04-F3.3: cursos, tiempos de salida y liberación coordinada.
- N04-F3.4: modificaciones, cancelaciones y cambios posteriores al envío.
- N04-F3.5: recuperación de conexión y reconciliación del estado.

### N04-F4 — Expedición y calidad
- N04-F4.1: validación de pedido completo antes de entregar.
- N04-F4.2: control de empaquetado y correspondencia de partidas.
- N04-F4.3: incidencias, rehacer producto y motivos.
- N04-F4.4: tiempos de preparación, espera y expedición.
- N04-F4.5: trazabilidad de quién realizó cada transición.

### N04-F5 — Integración y cierre
- N04-F5.1: integración con pedidos, operaciones, delivery y autoservicio.
- N04-F5.2: notificaciones de pedido listo y pedido retrasado.
- N04-F5.3: pruebas de eventos duplicados/fuera de orden, desconexión y concurrencia.
- N04-F5.4: pruebas reales en dispositivos y sucursales representativas.
- N04-F5.5: métricas operativas y auditoría.

**Cierre N04:** una comanda no puede perder partidas, duplicarse silenciosamente ni declararse lista mientras existan partidas requeridas pendientes.

# N05 — Recursos humanos y personal

**Objetivo:** administrar el ciclo operativo del personal sin asumir que el POS sustituye un sistema de nómina o cumplimiento laboral.

### N05-F1 — Expediente y estructura
- N05-F1.1: ficha de empleado y datos mínimos necesarios.
- N05-F1.2: relación con organización, entidad legal y sucursal.
- N05-F1.3: cargos, equipos, responsables y estado laboral operativo.
- N05-F1.4: documentos y permisos de acceso con protección de datos.
- N05-F1.5: historial de asignaciones y cambios.

### N05-F2 — Roles y habilidades operativas
- N05-F2.1: perfiles de puesto y competencias.
- N05-F2.2: asignación a caja, salón, cocina, delivery u otras áreas.
- N05-F2.3: habilitaciones y restricciones por estación.
- N05-F2.4: separación entre rol laboral y permiso de acceso al sistema.
- N05-F2.5: autorización temporal y sustituciones.

### N05-F3 — Programación de turnos
- N05-F3.1: plantillas y necesidades de cobertura por sucursal.
- N05-F3.2: planificación, publicación y cambios de turno.
- N05-F3.3: disponibilidad, solicitudes e intercambios sujetos a aprobación.
- N05-F3.4: control de solapamientos y descansos según reglas aprobadas.
- N05-F3.5: calendario y alertas de cobertura insuficiente.

### N05-F4 — Asistencia y actividad
- N05-F4.1: marcación de entrada, salida y pausas.
- N05-F4.2: correcciones con motivo y autorización.
- N05-F4.3: incidencias, ausencias y tardanzas.
- N05-F4.4: resumen de horas por periodo y sucursal.
- N05-F4.5: exportación controlada para nómina externa si se aprueba.

### N05-F5 — Productividad y cierre
- N05-F5.1: métricas operativas con contexto y sin rankings engañosos.
- N05-F5.2: relación de actividad con turnos, ventas y carga operativa.
- N05-F5.3: permisos, privacidad, retención y auditoría.
- N05-F5.4: reportes de cobertura y costos laborales solo con reglas aprobadas.
- N05-F5.5: pruebas de zona horaria, cambios de turno, duplicados y permisos.

**Cierre N05:** no presentar datos operativos como liquidación salarial oficial ni aplicar reglas laborales no aprobadas.

# N06 — CRM y fidelización

**Objetivo:** mantener una visión consistente del cliente y permitir programas de relación y fidelización controlados.

### N06-F1 — Perfil unificado de cliente
- N06-F1.1: identidad de cliente y datos de contacto consentidos.
- N06-F1.2: deduplicación y resolución de perfiles.
- N06-F1.3: historial de pedidos por canales y sucursales autorizados.
- N06-F1.4: preferencias, restricciones y notas con acceso limitado.
- N06-F1.5: exportación, rectificación y eliminación conforme a obligaciones aplicables.

### N06-F2 — Segmentación y comunicación
- N06-F2.1: segmentos por reglas explícitas.
- N06-F2.2: filtros por recurrencia, recencia, gasto y preferencias.
- N06-F2.3: consentimiento y exclusión por canal.
- N06-F2.4: campañas con vigencia, audiencia y límites.
- N06-F2.5: medición de entrega, interacción y conversión.

### N06-F3 — Programa de puntos y recompensas
- N06-F3.1: reglas de acumulación y redención configurables.
- N06-F3.2: libro de puntos inmutable con origen y vencimiento si aplica.
- N06-F3.3: recompensas, cupones y beneficios.
- N06-F3.4: límites, reversos por devoluciones y prevención de abuso.
- N06-F3.5: reglas compartidas o diferenciadas por sucursal.

### N06-F4 — Promociones personalizadas
- N06-F4.1: ofertas por cliente/segmento y canal.
- N06-F4.2: compatibilidad, exclusiones y límites de uso.
- N06-F4.3: aplicación verificable en backend al pedido.
- N06-F4.4: control de presupuesto y vigencia.
- N06-F4.5: auditoría y medición incremental sin atribuciones no demostrables.

### N06-F5 — Integración y cierre
- N06-F5.1: integración con clientes, ventas, autoservicio y notificaciones.
- N06-F5.2: privacidad, consentimiento y retención.
- N06-F5.3: idempotencia de acumulación/redención.
- N06-F5.4: pruebas de devoluciones, fraude, concurrencia y sucursales.
- N06-F5.5: panel de desempeño del programa.

**Cierre N06:** los puntos y beneficios deben tener un libro auditable; una repetición de eventos no puede duplicar recompensas.

# N07 — Logística y distribución

**Objetivo:** coordinar la preparación, asignación, despacho, seguimiento y entrega de pedidos, integrándose con Delivery.

### N07-F1 — Modelo logístico
- N07-F1.1: modalidades de entrega y retiro.
- N07-F1.2: zonas, cobertura, restricciones y horarios por sucursal.
- N07-F1.3: direcciones normalizadas e instrucciones de entrega.
- N07-F1.4: tarifas, mínimos y recargos con reglas aprobadas.
- N07-F1.5: capacidad de despacho por franja horaria.

### N07-F2 — Asignación y despacho
- N07-F2.1: cola de pedidos listos y pendientes de asignación.
- N07-F2.2: repartidores propios/externos y disponibilidad.
- N07-F2.3: asignación manual y automática bajo reglas transparentes.
- N07-F2.4: agrupación de entregas cuando sea viable.
- N07-F2.5: reasignación, rechazo y contingencias.

### N07-F3 — Rutas y seguimiento
- N07-F3.1: cálculo/selección de ruta mediante proveedor aprobado.
- N07-F3.2: estados de despacho y ubicación solo con consentimiento/base legítima.
- N07-F3.3: estimación de llegada con margen y fuente identificada.
- N07-F3.4: comunicación de cambios y retrasos.
- N07-F3.5: tratamiento de pérdida de conectividad y datos desactualizados.

### N07-F4 — Entrega y prueba
- N07-F4.1: confirmación de recogida y entrega.
- N07-F4.2: evidencia de entrega proporcional y protegida.
- N07-F4.3: entrega fallida, cliente ausente, rechazo y devolución.
- N07-F4.4: incidencias, reclamos y reintentos.
- N07-F4.5: conciliación del estado logístico con pedido y pago.

### N07-F5 — Optimización y cierre
- N07-F5.1: tiempos por zona, franja, sucursal y repartidor.
- N07-F5.2: desempeño y causas de incumplimiento.
- N07-F5.3: costo logístico y rentabilidad por canal.
- N07-F5.4: pruebas de asignación concurrente, duplicados y desconexión.
- N07-F5.5: integración con Delivery, KDS, notificaciones y BI.

**Cierre N07:** nunca asignar simultáneamente un mismo pedido a dos repartidores activos; todo cambio de custodia debe quedar registrado.

# N08 — BI e inteligencia de negocio

**Objetivo:** proporcionar indicadores confiables para decisiones operativas y gerenciales, distinguiendo datos transaccionales de agregados analíticos.

### N08-F1 — Gobierno de datos e indicadores
- N08-F1.1: catálogo de métricas, fórmulas, propietario y definición.
- N08-F1.2: dimensiones de tiempo, sucursal, canal, producto y entidad legal.
- N08-F1.3: reglas de calidad, completitud y reconciliación.
- N08-F1.4: permisos y alcance de datos corporativo/sucursal.
- N08-F1.5: frescura y linaje de cada indicador.

### N08-F2 — Modelo analítico
- N08-F2.1: fuentes y eventos de ventas, inventario, compras, personal y delivery.
- N08-F2.2: modelo de hechos y dimensiones apropiado al volumen real.
- N08-F2.3: agregaciones y periodos sin duplicar eventos.
- N08-F2.4: tratamiento de correcciones, devoluciones y datos tardíos.
- N08-F2.5: conciliación con reportes operativos y financieros.

### N08-F3 — Tableros e informes
- N08-F3.1: ventas, ticket promedio, canales y tendencias.
- N08-F3.2: rentabilidad y margen con costos completos disponibles.
- N08-F3.3: inventario, rotación, quiebres y desperdicio.
- N08-F3.4: productividad, tiempos y capacidad operativa.
- N08-F3.5: comparación entre sucursales y periodos equivalentes.

### N08-F4 — Análisis avanzado
- N08-F4.1: detección de anomalías con explicación y umbrales configurables.
- N08-F4.2: pronóstico de demanda con medición de error.
- N08-F4.3: sugerencias de compra y dotación como recomendaciones, no acciones irreversibles.
- N08-F4.4: escenarios y análisis de sensibilidad.
- N08-F4.5: control de sesgos, calidad y límites de los modelos.

### N08-F5 — Seguridad y cierre
- N08-F5.1: exportaciones autorizadas y auditadas.
- N08-F5.2: rendimiento, caché y actualización de agregados.
- N08-F5.3: pruebas de reconciliación, aislamiento y grandes volúmenes.
- N08-F5.4: documentación de métricas y fórmulas.
- N08-F5.5: monitoreo de frescura y fallos de procesamiento.

**Cierre N08:** cada KPI debe tener fórmula, fuente, periodo, alcance y limitaciones documentados; los resultados consolidados deben reconciliarse con las fuentes.

# N09 — Gestión multisucursal

**Objetivo:** habilitar administración corporativa de la cadena y operación aislada por sucursal, sin introducir multi-tenancy de clientes independientes.

### N09-F1 — Estructura corporativa
- N09-F1.1: organización y datos corporativos.
- N09-F1.2: entidades legales y relación con sucursales.
- N09-F1.3: alta, configuración, apertura, suspensión y cierre de sucursal.
- N09-F1.4: dirección, zona horaria, calendario y parámetros locales.
- N09-F1.5: historial de cambios organizacionales.

### N09-F2 — Recursos y políticas compartidas
- N09-F2.1: catálogo corporativo con habilitación por sucursal.
- N09-F2.2: recetas y variantes con excepciones controladas.
- N09-F2.3: listas de precios, impuestos y promociones por ámbito.
- N09-F2.4: proveedores, compras y almacén central.
- N09-F2.5: publicación/versionado de configuración y propagación segura.

### N09-F3 — Usuarios y permisos
- N09-F3.1: roles corporativos y roles locales.
- N09-F3.2: asignación de usuario a una o varias sucursales.
- N09-F3.3: permisos de lectura, operación, aprobación y administración por alcance.
- N09-F3.4: delegación temporal y sustitución de responsables.
- N09-F3.5: pruebas negativas de acceso cruzado y auditoría.

### N09-F4 — Operación y transferencias
- N09-F4.1: parámetros operativos por sucursal.
- N09-F4.2: transferencias de inventario entre ubicaciones.
- N09-F4.3: movimientos de personal solo mediante flujo autorizado.
- N09-F4.4: continuidad operativa ante caída de una sucursal.
- N09-F4.5: apertura/cierre operativo y estado de sucursales.

### N09-F5 — Consolidación corporativa
- N09-F5.1: indicadores por sucursal y grupo.
- N09-F5.2: consolidación por entidad legal sin mezclar libros.
- N09-F5.3: comparativos y detección de desviaciones.
- N09-F5.4: exportación y permisos corporativos.
- N09-F5.5: pruebas de aislamiento, rendimiento y consistencia.

**Cierre N09:** ninguna consulta, caché, exportación, evento o trabajo en segundo plano puede filtrar información de una sucursal fuera del alcance autorizado.

# N10 — Atención y reservas avanzada

**Objetivo:** administrar el ciclo de atención en salón y otros canales, desde la reserva o llegada hasta la asignación, consumo y cierre.

### N10-F1 — Configuración de atención
- N10-F1.1: áreas, mesas, capacidad y combinaciones permitidas.
- N10-F1.2: horarios, duración estimada y reglas de reserva.
- N10-F1.3: canales de reserva y datos requeridos.
- N10-F1.4: preferencias y necesidades especiales con acceso restringido.
- N10-F1.5: políticas de depósito, cancelación y no-show solo tras aprobación.

### N10-F2 — Reservas
- N10-F2.1: crear, consultar, modificar y cancelar reservas.
- N10-F2.2: disponibilidad por fecha, franja, capacidad y sucursal.
- N10-F2.3: confirmaciones, recordatorios y lista de cambios.
- N10-F2.4: prevención de doble reserva mediante transacciones/controles de concurrencia.
- N10-F2.5: llegada, retraso, no-show y cierre de reserva.

### N10-F3 — Lista de espera y asignación
- N10-F3.1: registro de clientes en espera y tamaño del grupo.
- N10-F3.2: estimación de espera con método documentado.
- N10-F3.3: asignación de mesa y notificación.
- N10-F3.4: prioridades y excepciones auditadas.
- N10-F3.5: expiración, abandono y reasignación.

### N10-F4 — Servicio y experiencia
- N10-F4.1: apertura de servicio/mesa y asociación de pedido.
- N10-F4.2: cambios de mesa, unión y división de cuentas según permisos.
- N10-F4.3: seguimiento de tiempos de atención y estado de mesa.
- N10-F4.4: preferencias y feedback posterior.
- N10-F4.5: integración con operaciones, pedidos, KDS, CRM y portal QR.

### N10-F5 — Cierre y análisis
- N10-F5.1: ocupación, rotación y duración de mesa.
- N10-F5.2: reservas atendidas, cancelaciones y no-show.
- N10-F5.3: tiempos de espera y conversión.
- N10-F5.4: pruebas de concurrencia, cambios de zona horaria y conflictos.
- N10-F5.5: auditoría y reportes por sucursal.

**Cierre N10:** la disponibilidad y asignación de mesas debe ser consistente bajo solicitudes concurrentes y respetar la capacidad/configuración de cada sucursal.

## 6. Ampliación detallada de módulos existentes

# E01 — Operaciones

**Objetivo:** ampliar las operaciones actuales de salón y restaurante, integrando mesas, espera, cocina, estaciones, turnos y tiempos.

### E01-F1 — Plano de mesas
- E01-F1.1: áreas, zonas, mesas, capacidad y atributos.
- E01-F1.2: editor visual del plano con posiciones y dimensiones persistidas.
- E01-F1.3: estados de mesa y transiciones permitidas.
- E01-F1.4: unir/separar mesas y mover pedidos con auditoría.
- E01-F1.5: disponibilidad consistente entre plano, reservas y pedidos.

### E01-F2 — Lista de espera
- E01-F2.1: alta y gestión de grupos en espera.
- E01-F2.2: estimación, prioridad y reglas de asignación.
- E01-F2.3: notificación de mesa disponible.
- E01-F2.4: expiración, abandono y reasignación.
- E01-F2.5: métricas y auditoría.

### E01-F3 — Turnos operativos
- E01-F3.1: apertura y cierre de turno por sucursal/área.
- E01-F3.2: asignación de responsables y personal.
- E01-F3.3: traspaso entre turnos y pendientes.
- E01-F3.4: permisos para apertura, cierre y corrección.
- E01-F3.5: integración con cajas y asistencia, sin confundir ambos conceptos.

### E01-F4 — Estaciones de cocina y KDS
- E01-F4.1: configuración de estaciones y reglas de enrutamiento.
- E01-F4.2: colas de producción y estados de partidas.
- E01-F4.3: coordinación de partidas y expedición.
- E01-F4.4: incidencias, pausas y rehacer.
- E01-F4.5: integración con N04 y eventos de pedidos.

### E01-F5 — Control de tiempos
- E01-F5.1: marcas de tiempo de cada etapa operativa.
- E01-F5.2: objetivos por producto, canal, estación y sucursal.
- E01-F5.3: alertas de retraso y escalamiento.
- E01-F5.4: análisis de espera, preparación y entrega.
- E01-F5.5: pruebas de eventos tardíos, relojes, zona horaria y concurrencia.

**Nota de alcance:** E01 integra la operación existente; N04 desarrolla la capacidad KDS especializada. Evitar implementar dos motores distintos de comandas o estados.

# E02 — Contabilidad y finanzas

**Objetivo:** evolucionar los informes actuales hacia submódulos financieros y contables completos, vinculados a entidad legal y sucursal.

### E02-F1 — Fundamentos contables
- E02-F1.1: marco contable y entidad legal.
- E02-F1.2: plan de cuentas y dimensiones analíticas.
- E02-F1.3: moneda funcional, precisión y reglas de redondeo.
- E02-F1.4: periodos, apertura, cierre y reapertura autorizada.
- E02-F1.5: eventos de negocio y mapeo contable aprobado.

### E02-F2 — Gastos
- E02-F2.1: categorías, terceros, soportes y registro.
- E02-F2.2: borrador, aprobación, rechazo, pago y reverso.
- E02-F2.3: límites y segregación de funciones.
- E02-F2.4: vínculo con caja, banco, proveedor y contabilidad.
- E02-F2.5: reportes por sucursal y entidad legal.

### E02-F3 — Cuentas por pagar
- E02-F3.1: obligaciones, documentos y vencimientos.
- E02-F3.2: pagos totales/parciales, anticipos y notas.
- E02-F3.3: programación y autorización de pagos.
- E02-F3.4: saldos y antigüedad.
- E02-F3.5: integración con compras, proveedores y conciliación.

### E02-F4 — Cuentas por cobrar
- E02-F4.1: ventas a crédito y documentos exigibles autorizados.
- E02-F4.2: clientes, vencimientos y límites si se aprueban.
- E02-F4.3: recaudos, abonos, anticipos y notas.
- E02-F4.4: antigüedad, cobranza y seguimiento.
- E02-F4.5: integración con pedidos, pagos, caja y libro.

### E02-F5 — Conciliación
- E02-F5.1: importación/recepción de extractos y liquidaciones.
- E02-F5.2: normalización e idempotencia.
- E02-F5.3: coincidencia automática y revisión manual.
- E02-F5.4: diferencias, comisiones, contracargos y devoluciones.
- E02-F5.5: cierre de conciliación y auditoría.

### E02-F6 — Impuestos
- E02-F6.1: identificación de jurisdicción y entidad emisora.
- E02-F6.2: catálogo de impuestos, tarifas y vigencias aprobadas.
- E02-F6.3: reglas por producto, operación y ubicación.
- E02-F6.4: cálculo, redondeo, exenciones y soportes.
- E02-F6.5: reportes y conciliación fiscal.
- E02-F6.6: pruebas de vigencia histórica y cambios normativos.

### E02-F7 — Caja, cierres y arqueos
- E02-F7.1: apertura, fondo y responsable.
- E02-F7.2: movimientos por efectivo y otros medios.
- E02-F7.3: cierre, conteo y diferencia.
- E02-F7.4: aprobación, reapertura, ajuste y reverso.
- E02-F7.5: consolidación por caja, turno, sucursal y entidad legal.

### E02-F8 — Libro contable
- E02-F8.1: generación de asientos desde operaciones aprobadas.
- E02-F8.2: diario, mayor y balance de comprobación.
- E02-F8.3: asientos manuales autorizados y reversos.
- E02-F8.4: cierres de periodo e inmutabilidad.
- E02-F8.5: conciliación de sublibros y reportes.

### E02-F9 — Facturación electrónica
- E02-F9.1: análisis fiscal y documental por entidad legal.
- E02-F9.2: configuración de numeración, certificados y secretos.
- E02-F9.3: generación, firma, validación y transmisión.
- E02-F9.4: respuestas, estados, representación y entrega.
- E02-F9.5: notas, contingencias, reintentos y trazabilidad.
- E02-F9.6: pruebas en ambientes oficiales antes de producción.

**Bloqueo fiscal:** si la operación está en Colombia, validar los requisitos vigentes de DIAN y del régimen aplicable con asesoría competente. No fijar tarifas, documentos, numeración ni proveedor antes de esa validación.

# E03 — Informes

**Objetivo:** ampliar los reportes actuales con métricas económicas, operativas y comparativas consistentes.

### E03-F1 — Definiciones y calidad
- E03-F1.1: diccionario de indicadores y fórmulas.
- E03-F1.2: fuentes, granularidad y periodos.
- E03-F1.3: tratamiento de devoluciones, cancelaciones y descuentos.
- E03-F1.4: permisos por organización, entidad legal y sucursal.
- E03-F1.5: reconciliación de totales con transacciones.

### E03-F2 — Rentabilidad y costos
- E03-F2.1: ingresos netos y descuentos.
- E03-F2.2: costo de recetas, empaques y consumos.
- E03-F2.3: margen por producto, categoría, canal y sucursal.
- E03-F2.4: costos operativos disponibles y asignaciones documentadas.
- E03-F2.5: rentabilidad por periodo y entidad legal.

### E03-F3 — Inventario
- E03-F3.1: existencias, valorización y rotación.
- E03-F3.2: quiebres, sobreinventario y cobertura.
- E03-F3.3: mermas, vencimientos y ajustes.
- E03-F3.4: diferencias entre consumo teórico y real.
- E03-F3.5: comparativa por almacén y sucursal.

### E03-F4 — Productividad y operación
- E03-F4.1: tiempos de pedido, cocina, atención y delivery.
- E03-F4.2: cobertura de turnos y carga de trabajo.
- E03-F4.3: rendimiento por estación y franja.
- E03-F4.4: ocupación, rotación y espera.
- E03-F4.5: indicadores de servicio con contexto y límites.

### E03-F5 — Tendencias y análisis comparativo
- E03-F5.1: comparación entre periodos equivalentes.
- E03-F5.2: tendencias por día, semana, mes y temporada.
- E03-F5.3: comparación de sucursales normalizada por contexto.
- E03-F5.4: anomalías y alertas explicables.
- E03-F5.5: exportaciones, permisos y auditoría.

# E04 — Delivery

**Objetivo:** evolucionar el delivery actual hacia gestión completa de cobertura, asignación, seguimiento y nivel de servicio.

### E04-F1 — Zonas y cobertura
- E04-F1.1: zonas geográficas por sucursal.
- E04-F1.2: polígonos, radios o reglas de cobertura con fuente cartográfica aprobada.
- E04-F1.3: horarios, restricciones y capacidad.
- E04-F1.4: tarifas, mínimos y recargos aprobados.
- E04-F1.5: validación de dirección y sucursal responsable.

### E04-F2 — Despacho inteligente
- E04-F2.1: cola de pedidos por estado y prioridad.
- E04-F2.2: disponibilidad y capacidad de repartidores.
- E04-F2.3: asignación manual y automática.
- E04-F2.4: reasignación, agrupación y contingencias.
- E04-F2.5: prevención de asignaciones dobles.

### E04-F3 — Seguimiento
- E04-F3.1: estados de preparación, recogida, tránsito y entrega.
- E04-F3.2: seguimiento del cliente con datos mínimos necesarios.
- E04-F3.3: ubicación bajo controles de privacidad.
- E04-F3.4: ETA y actualización de retrasos.
- E04-F3.5: fallos de conectividad y reconciliación.

### E04-F4 — Tiempos y calidad
- E04-F4.1: tiempos objetivo por zona y franja.
- E04-F4.2: medición de preparación, espera y trayecto.
- E04-F4.3: causas de retraso y entrega fallida.
- E04-F4.4: evidencia, reclamos y resolución.
- E04-F4.5: análisis de costo y rentabilidad logística.

### E04-F5 — Integración y cierre
- E04-F5.1: integración con N07, KDS, notificaciones y autoservicio.
- E04-F5.2: conciliación de pedido, entrega y pago.
- E04-F5.3: permisos y auditoría.
- E04-F5.4: pruebas de concurrencia, geografía y reintentos.
- E04-F5.5: panel operativo por sucursal.

# E05 — Notificaciones

**Objetivo:** ofrecer alertas accionables y confiables para operación y administración, evitando duplicados y ruido.

### E05-F1 — Centro de notificaciones
- E05-F1.1: catálogo de eventos notificables.
- E05-F1.2: severidad, destinatarios y ámbito corporativo/sucursal.
- E05-F1.3: bandeja, lectura, resolución y reconocimiento.
- E05-F1.4: preferencias por rol y canal.
- E05-F1.5: retención, privacidad y auditoría.

### E05-F2 — Alertas de inventario
- E05-F2.1: stock mínimo y quiebre.
- E05-F2.2: vencimientos y lotes bloqueados.
- E05-F2.3: diferencias de conteo y mermas fuera de umbral.
- E05-F2.4: solicitudes de reposición pendientes.
- E05-F2.5: escalamiento por falta de atención.

### E05-F3 — Alertas de operación
- E05-F3.1: pedidos retrasados y comandas estancadas.
- E05-F3.2: reservas, lista de espera y mesas.
- E05-F3.3: delivery sin asignar o fuera de tiempo.
- E05-F3.4: turnos y cobertura insuficiente.
- E05-F3.5: incidentes críticos de sucursal.

### E05-F4 — Alertas financieras y administrativas
- E05-F4.1: cierres y arqueos pendientes.
- E05-F4.2: diferencias de caja y conciliación.
- E05-F4.3: obligaciones por vencer.
- E05-F4.4: documentos fiscales rechazados o en contingencia.
- E05-F4.5: cambios críticos de configuración y seguridad.

### E05-F5 — Entrega y confiabilidad
- E05-F5.1: canales de entrega configurados y verificados.
- E05-F5.2: cola persistente, reintentos y dead-letter/gestión de fallos.
- E05-F5.3: deduplicación y límites de frecuencia.
- E05-F5.4: métricas de entrega, latencia y fallos.
- E05-F5.5: pruebas de indisponibilidad, reintentos y aislamiento.

# E06 — Portal de autoservicio

**Objetivo:** permitir consultar el menú y realizar pedidos desde QR o web sin exponer operaciones internas ni confiar en cálculos del navegador.

### E06-F1 — Menú público
- E06-F1.1: publicación de menú por sucursal/canal.
- E06-F1.2: categorías, productos, imágenes, variantes y modificadores.
- E06-F1.3: disponibilidad, horarios y agotados.
- E06-F1.4: alérgenos e información al consumidor aprobada.
- E06-F1.5: accesibilidad, rendimiento y SEO cuando aplique.

### E06-F2 — Experiencia QR
- E06-F2.1: QR asociado a sucursal, área y mesa mediante identificador no privilegiado.
- E06-F2.2: validación del contexto y estado de mesa en backend.
- E06-F2.3: carrito y personalización de productos.
- E06-F2.4: envío de pedido y confirmación.
- E06-F2.5: protección contra QR manipulados, repetición y abuso.

### E06-F3 — Pedidos web
- E06-F3.1: selección de sucursal y modalidad.
- E06-F3.2: disponibilidad y horarios reales.
- E06-F3.3: datos de cliente y dirección mínimos.
- E06-F3.4: cálculo de totales, impuestos y tarifas en backend.
- E06-F3.5: confirmación, cancelación y seguimiento según política.

### E06-F4 — Pago y ciclo de pedido
- E06-F4.1: métodos de pago habilitados por canal/sucursal.
- E06-F4.2: integración con contratos de pago existentes y autorización segura.
- E06-F4.3: idempotencia de creación y pago.
- E06-F4.4: estados de pedido, cocina, retiro y delivery.
- E06-F4.5: errores, expiración, reintentos y conciliación.

### E06-F5 — Seguridad y cierre
- E06-F5.1: límites de frecuencia, validación y antiabuso.
- E06-F5.2: protección de datos personales y sesiones públicas.
- E06-F5.3: pruebas de precios manipulados, sucursal incorrecta y pedidos duplicados.
- E06-F5.4: pruebas de carga y accesibilidad.
- E06-F5.5: métricas de conversión y fallos.

# E07 — Administración del sistema

**Objetivo:** proporcionar gobierno centralizado, configuración controlada, auditoría, integraciones y monitoreo de la plataforma.

### E07-F1 — Configuración corporativa y por sucursal
- E07-F1.1: parámetros generales de organización.
- E07-F1.2: configuración local de sucursal.
- E07-F1.3: parámetros por módulo con esquema, validación y valores permitidos.
- E07-F1.4: herencia, excepciones y publicación de cambios.
- E07-F1.5: historial, rollback controlado y auditoría.

### E07-F2 — Administración y permisos
- E07-F2.1: roles, permisos y ámbitos.
- E07-F2.2: administración de sucursales, usuarios y asignaciones.
- E07-F2.3: aprobaciones y segregación de funciones.
- E07-F2.4: operaciones críticas con reautenticación si corresponde.
- E07-F2.5: pruebas de escalamiento y acceso cruzado.

### E07-F3 — Auditoría y cumplimiento
- E07-F3.1: eventos de auditoría normalizados.
- E07-F3.2: búsquedas por actor, recurso, sucursal, fecha y resultado.
- E07-F3.3: integridad, retención y acceso restringido.
- E07-F3.4: exportación de evidencias.
- E07-F3.5: alertas sobre cambios sensibles.

### E07-F4 — Integraciones
- E07-F4.1: registro y configuración de proveedores.
- E07-F4.2: credenciales y secretos fuera de logs y respuestas.
- E07-F4.3: webhooks firmados, idempotencia y rotación de secretos.
- E07-F4.4: estado, reintentos y diagnóstico de integraciones.
- E07-F4.5: pruebas de firma, replay, expiración y fallos externos.

### E07-F5 — Monitoreo y operaciones
- E07-F5.1: salud de API, base de datos, Redis y dependencias.
- E07-F5.2: métricas de latencia, errores y saturación.
- E07-F5.3: trazas correlacionadas sin datos sensibles.
- E07-F5.4: alertas operativas y runbooks.
- E07-F5.5: respaldos, restauración y pruebas de recuperación documentadas.

**Cierre E07:** las herramientas administrativas no deben permitir saltarse validaciones de dominio ni modificar directamente datos críticos sin auditoría.

## 7. Línea A — Seguridad y administración de cuentas

Se conserva la línea del roadmap anterior y se integra con el modelo de organización/sucursales.

### A1 — Recuperación y cambio de contraseña
- A1.1: canal verificado y flujo de solicitud sin enumeración de cuentas.
- A1.2: tokens aleatorios, almacenados como hash, de un solo uso y con expiración.
- A1.3: cambio autenticado con reautenticación aprobada.
- A1.4: revocación de sesiones según política.
- A1.5: notificación, auditoría, límites de frecuencia y pruebas de abuso.

### A2 — Administración de usuarios
- A2.1: listado, búsqueda, filtros y detalle.
- A2.2: alta/invitación y activación segura.
- A2.3: edición de datos permitidos y estado de cuenta.
- A2.4: asignación de roles y alcance corporativo/sucursal.
- A2.5: protección del último administrador y pruebas de escalamiento.

### A3 — Sesiones y dispositivos
- A3.1: listado de sesiones con metadatos mínimos.
- A3.2: revocación individual y global.
- A3.3: rechazo inmediato de sesiones revocadas.
- A3.4: administración de sesiones propias y, con permiso, de otros usuarios.
- A3.5: pruebas de concurrencia, expiración y revocación.

### A4 — Políticas avanzadas de cuentas
- A4.1: estados de cuenta y transiciones válidas.
- A4.2: umbrales, ventanas y duración de bloqueos aprobados.
- A4.3: bloqueo temporal, suspensión y desactivación diferenciados.
- A4.4: desbloqueo, motivos y auditoría.
- A4.5: controles distribuidos entre instancias y pruebas de fuerza bruta.

## 8. Línea F — Finanzas y contabilidad

Se conserva el detalle del roadmap anterior y se amplía con sucursales y entidades legales. Ninguna regla fiscal o contable se fija sin aprobación.

### F1 — Fundamentos contables y periodos
- F1.1: entidad legal, marco contable y moneda funcional.
- F1.2: catálogo de cuentas y dimensiones por sucursal/centro de costo.
- F1.3: reglas de débito/crédito, reconocimiento y redondeo.
- F1.4: periodos, cortes, apertura, cierre y reapertura.
- F1.5: mapeo aprobado desde ventas, inventario, gastos, cartera y caja.

### F2 — Gastos
- F2.1: registro de tercero, categoría, soporte, importes e impuestos.
- F2.2: flujo de aprobación y segregación.
- F2.3: pagos, anticipos y relación con caja/banco.
- F2.4: reversos y ajustes auditables.
- F2.5: reportes por sucursal y entidad legal.

### F3 — Cuentas por pagar
- F3.1: obligaciones, documentos y vencimientos.
- F3.2: pagos parciales/totales y anticipos.
- F3.3: notas, ajustes y devoluciones.
- F3.4: programación, aprobación y saldos.
- F3.5: integración con compras, proveedores y conciliación.

### F4 — Cuentas por cobrar
- F4.1: ventas a crédito y documentos autorizados.
- F4.2: vencimientos y saldos por cliente.
- F4.3: recaudos, abonos, anticipos y notas.
- F4.4: antigüedad y seguimiento.
- F4.5: integración con ventas, pagos y caja.

### F5 — Conciliación de pagos
- F5.1: fuentes bancarias y pasarelas autorizadas.
- F5.2: importación idempotente y preservación de referencia externa.
- F5.3: coincidencia exacta, reglas y revisión manual.
- F5.4: comisiones, diferencias, contracargos y devoluciones.
- F5.5: cierre, evidencia y auditoría.

### F6 — Caja, cierres y arqueos
- F6.1: apertura de caja y fondo.
- F6.2: entradas, salidas y pagos por medio.
- F6.3: cierre y conteo declarado.
- F6.4: diferencias, aprobación, reapertura y ajustes.
- F6.5: consolidación por turno, caja, sucursal y entidad legal.

### F7 — Libro contable
- F7.1: asientos automáticos y manuales autorizados.
- F7.2: diario, mayor y balance de comprobación.
- F7.3: inmutabilidad y reversos.
- F7.4: cierres y bloqueos de periodo.
- F7.5: conciliación con sublibros y estados financieros requeridos.

### F8 — Facturación electrónica
- F8.1: jurisdicción, entidad emisora y obligaciones.
- F8.2: numeración, certificados y secretos.
- F8.3: generación, validación, firma y transmisión.
- F8.4: aceptación/rechazo, representación y entrega.
- F8.5: notas, contingencia, reintentos y eventos.
- F8.6: certificación y verificación en ambientes oficiales.

## 9. Secuencia de ejecución y dependencias

La numeración de fases por módulo no implica que todos los módulos se desarrollen en paralelo. Orden recomendado:

### Ola 0 — Descubrimiento y cimientos
1. Verificar el estado real del código, migraciones, contratos y pruebas.
2. Diseñar organización, entidad legal, sucursal, almacén, zona horaria y permisos de alcance.
3. Definir auditoría, idempotencia, eventos, configuración y estrategia de migración.
4. Resolver decisiones de negocio que bloqueen inventario, costos, compras, contabilidad y facturación.
5. Establecer pruebas de aislamiento entre sucursales desde el primer cambio de esquema.


### Ola 0.1 — Diseño técnico, controles y evidencia de cierre

Los seis frentes de esta ola se mantienen visibles, pero se separan por tipo de dependencia. **Los pendientes de gobierno de repositorio y de recuperación productiva no suspenden el desarrollo de las demás olas.** La regla de continuidad acordada el 2026-11-18 es:

- Se puede continuar con análisis, diseño, implementación y pruebas en ramas de trabajo, PRs y entornos efímeros/aislados.
- Las migraciones pueden desarrollarse y probarse contra bases desechables o aisladas de PostgreSQL, desde una base vacía y desde los esquemas de upgrade representativos. Eso no equivale a autorización para aplicarlas en producción.
- Las decisiones de negocio aún abiertas (permisos exactos, moneda funcional/conversiones, caja compartida, políticas operativas, etc.) bloquean únicamente las subfases que dependan de ellas. No se inventarán reglas provisionales.
- Mientras la protección de `main` siga pendiente, no se harán pushes directos. Cada PR deberá pasar manualmente los tres checks sobre su HEAD exacto y revisión de alcance antes de cualquier merge. Esto es un control operativo temporal, no sustituye Branch Protection.
- Hasta completar inspección productiva y restauración real aislada, no se ejecutarán en producción migraciones de esquema multisucursal, backfills, conversiones de datos, cutovers ni cambios destructivos/incompatibles. Cualquier despliegue de código que pueda afectar datos o comportamiento productivo requerirá evaluar previamente su impacto y autorización explícita.
- La protección de `main` y el restore real continúan siendo tareas pendientes de Fase 0 y deben cerrarse; simplemente dejan de ser bloqueos para el trabajo no productivo y las subfases independientes.

#### Frentes y dependencias

1. **RBAC:** aprobar catálogo de permisos, perfiles mínimos, alcance de cada asignación, herencia explícita, delegación y segregación de funciones. Default deny; los roles actuales `admin/staff` no se convierten en privilegios globales. Esta aprobación bloquea la implementación de los permisos afectados, no el análisis ni los módulos sin esa dependencia.
2. **Internacionalización y configuración:** aprobar la fuente autoritativa por tipo de parámetro. Moneda funcional por entidad legal y moneda operativa por sucursal; transacciones solo en monedas permitidas, conversiones con snapshot inmutable y fechas UTC más zona IANA/fecha de negocio. Las decisiones pendientes bloquean solo los cálculos, cierres y documentos que las necesiten.
3. **Caja y terminales:** modelar caja, dispositivo, sesión técnica, sesión de caja y turno de cajero como entidades separadas. Soportar terminales concurrentes con idempotencia y ledger append-only; las cajas compartidas entre varias entidades legales requieren asignación contable del fondo y conciliación por NIT/moneda. La operación financiera real queda condicionada a aprobar esas reglas.
4. **Inspección de PostgreSQL productivo:** ejecutar el runbook de solo lectura, capturar versión/esquema/roles/grants/RLS/funciones/tamaños/integridad y entregar únicamente evidencia sanitizada. Pendiente de acceso operativo; no impide desarrollar contra PostgreSQL aislado.
5. **Restauración real:** seleccionar backup, restaurarlo en infraestructura aislada, comprobar objetos/conteos/integridad/consultas críticas y medir RPO/RTO contra objetivos aprobados. Pendiente de ejecución; es requisito antes de cambiar esquema o datos en producción, no antes de desarrollar/probar migraciones en CI.
6. **CI y protección de `main`:** el workflow independiente de PR y las pruebas PostgreSQL reales están implementados. La ejecución más reciente del HEAD `b1bcc1f97e15a524f80843519899f364b5cb29f2` pasó los tres jobs (backend/frontend/build y PostgreSQL 16/17): [GitHub Actions run 44422575565](https://github.com/programadorkevinsvega-sys/restaurant-pos/actions/runs/44422575565). La Branch Protection sigue pendiente de configuración; hasta entonces se exige verificación manual de los tres jobs en cada PR.

**Secuencia revisada:** aprobar los diseños 1–3 por dominio; continuar en paralelo con Ola 1 mediante ramas, PRs y PostgreSQL efímero; terminar los puntos 4–5 antes de desplegar cambios multisucursal que modifiquen esquema o datos productivos. No se requiere cerrar integralmente Fase 0 para iniciar las actividades no productivas de Ola 1.
 
 
### Ola 1 — Núcleo operativo y trazabilidad
1. N09-F1 y N09-F3: estructura multisucursal y permisos.
2. N01-F1 y N01-F2: inventario y libro de movimientos.
3. N02-F1 y N02-F2: unidades y recetas.
4. N03-F1 y N03-F2: proveedores y órdenes.
5. E01-F1 y E01-F3: mesas y turnos operativos.
6. A1–A4: completar seguridad de cuentas y permisos.

### Ola 2 — Producción y abastecimiento
1. N01-F3–F5: conteos, lotes, reposición y transferencias.
2. N02-F3–F5: costos y consumo.
3. N03-F3–F5: recepción, devoluciones y evaluación.
4. N04-F1–F4 y E01-F4–F5: KDS, estaciones y tiempos.
5. E04-F1–F2: zonas y despacho inicial.
6. E05-F1–F3: notificaciones operativas.

### Ola 3 — Atención y canales
1. N10-F1–F5: reservas y lista de espera avanzada.
2. E06-F1–F3: menú, QR y pedidos web.
3. N07-F1–F4 y E04-F3–F5: logística y seguimiento.
4. N06-F1–F3: perfil y fidelización base.
5. E05-F4–F5: alertas financieras y confiabilidad.

### Ola 4 — Finanzas y control empresarial
1. F1 y E02-F1: fundamentos contables.
2. F2–F4 y N03-F4: gastos, cartera y proveedores.
3. F5: conciliación.
4. F6: caja, cierres y arqueos.
5. F7: libro contable.
6. F8: facturación electrónica, solo tras aprobación fiscal.
7. E02-F6: impuestos, con vigencias y reglas aprobadas.

### Ola 5 — Analítica y optimización
1. E03-F1–F5: informes ampliados y comparativos.
2. N08-F1–F3: gobierno de datos y BI descriptivo.
3. N08-F4–F5: pronósticos y análisis avanzado tras validar calidad de datos.
4. N05-F1–F5: recursos humanos y productividad.
5. N06-F4–F5: campañas y medición.
6. N09-F5: consolidación corporativa completa.

### Ola 6 — Gobierno y endurecimiento
1. E07-F1–F5: administración, auditoría, integraciones y monitoreo.
2. Pruebas de recuperación, restauración y continuidad.
3. Pruebas de carga representativas para múltiples sucursales.
4. Revisión de seguridad, privacidad, permisos y retención.
5. Verificación productiva de todos los flujos críticos y cierre documental.

## 10. Dependencias funcionales clave

- N09 es transversal: organización, sucursales y permisos deben preceder a las funcionalidades que guardan datos por sucursal.
- N01 es dependencia de N02, N03, costos, mermas, compras e informes de inventario.
- N02 define el consumo teórico y costo de producto; requiere unidades y fuentes de costo confiables.
- N03 alimenta inventario y cuentas por pagar; no duplicar recepción ni obligación.
- N04 y E01 comparten el ciclo de comandas; mantener una única fuente de verdad de pedidos/partidas.
- N05 alimenta turnos y productividad; los permisos del sistema siguen siendo independientes del cargo laboral.
- N06 depende de clientes, ventas, consentimiento y eventos confiables.
- N07 y E04 deben compartir el mismo ciclo logístico; no crear dos motores de asignación.
- N08 depende de definiciones estables y calidad de datos de los módulos transaccionales.
- N10 comparte mesas, reservas y lista de espera con E01; mantener un único modelo operativo.
- E05 consume eventos de los demás módulos y no debe ser fuente de verdad del estado de negocio.
- E06 utiliza contratos públicos limitados; los totales, impuestos, disponibilidad y permisos se calculan/validan en backend.
- E07 administra configuración y observabilidad, pero no puede saltarse reglas de dominio.
- F1 precede a la contabilización formal; F2–F7 deben generar trazabilidad contable consistente.
- F8 depende de decisiones fiscales por entidad legal y de contratos estables de ventas/impuestos.

## 11. Decisiones pendientes de aprobación

No implementar reglas arbitrarias para llenar vacíos. Registrar decisión, responsable, fecha y evidencia de aprobación.

| Área | Decisiones requeridas |
|---|---|
| Organización | D0-01 respondida: una organización puede tener varias entidades legales/NIT. D0-02 respondida: una sucursal puede operar con una o varias entidades legales (relación N:M). D0-03 respondida: coexistirán almacenes centrales y locales por sucursal, con control de existencias por ubicación y total consolidado por almacén. Pendiente: cantidades iniciales y reglas detalladas de propiedad |
| Usuarios y permisos | D0-05 y D0-06 respondidas en alcance principal. Diseño RBAC recomendado: permisos granulares recurso.acción, asignaciones con ámbito/vigencia, default deny, herencia explícita, límites de delegación y auditoría. Matriz final y pruebas pendientes |
| Catálogo | D0-04 respondida: productos maestros corporativos y compartidos; cada sucursal define surtido, precio y disponibilidad sin duplicar productos. Los demás campos locales requieren decisión adicional |
| Inventario | Método de costeo, FEFO/FIFO, stock de seguridad, tolerancias y aprobaciones |
| Recetas | Rendimientos, mermas estándar, sustituciones y actualización de costos |
| Compras | Límites de aprobación, proveedores permitidos, recepción y devoluciones |
| Cocina | Tiempos objetivo, prioridades, cursos y reglas de expedición |
| Personal | Reglas laborales, turnos, asistencia, retención y alcance de nómina |
| CRM | Consentimiento, vencimiento de puntos, recompensas y límites de campañas |
| Delivery | Zonas, tarifas, proveedores de mapas, tracking y prueba de entrega |
| Reservas | Duraciones, depósitos, cancelaciones, no-show y tolerancias |
| Finanzas | Marco contable, plan de cuentas, moneda funcional por entidad legal, monedas de transacción autorizadas, conversión/snapshot, reconocimiento y periodos |
| Impuestos | Jurisdicción, tarifas, vigencias, exenciones y documentos |
| Facturación | Entidad emisora, régimen, proveedor, certificados y contingencias |
| Notificaciones | Canales, horarios, severidad, destinatarios y escalamiento |
| Autoservicio | Canales, métodos de pago, privacidad, cancelación y reembolsos |
| Administración | Retención de auditoría, acceso a secretos, respaldos y recuperación |

## 12. Requisitos transversales de calidad y pruebas

Cada fase debe identificar sus casos positivos y negativos. Como mínimo, cuando aplique:

- Autorización por rol, organización, entidad legal, sucursal y recurso.
- Acceso cruzado entre sucursales, incluyendo APIs, búsquedas, exportaciones, cachés y tareas asíncronas.
- Datos inválidos, tipos incorrectos, campos ausentes, límites y valores extremos.
- Duplicados, reintentos, idempotencia y eventos fuera de orden.
- Concurrencia, bloqueos, aislamiento, rollback y consistencia transaccional.
- Estados válidos e inválidos, transiciones, expiración y operaciones terminales.
- Fallos de PostgreSQL, Redis, proveedores externos, red y procesos en segundo plano.
- Integridad referencial, redondeos, moneda, zona horaria y fechas de corte.
- Auditoría, redacción de secretos y protección de datos personales.
- Rendimiento y volumen representativos del número esperado de sucursales y terminales.
- Regresión de los flujos actuales de login, catálogo, pedidos, operaciones, informes y delivery.

### Matriz de trazabilidad obligatoria

Para cada requisito/subfase registrar:

| Campo | Contenido |
|---|---|
| Requisito | Identificador y regla de negocio |
| Diseño | Dominio, contrato, persistencia y permisos |
| Implementación | PR, commit y archivos relevantes |
| Prueba | Identificador del test y escenario |
| Ejecución | Workflow/ejecución CI y resultado |
| Entorno | Evidencia de verificación en entorno objetivo |
| Estado | Pendiente, en curso, bloqueada o completada |

## 13. Definición de terminado por fase

Una fase solo puede marcarse **Completada** cuando:

1. Requisitos, reglas y decisiones están documentados y aprobados.
2. Diseño de dominio, contratos API, permisos, persistencia y migraciones están revisados.
3. Backend y frontend implementan el flujo real; sin mocks, stubs, TODOs ni rutas ficticias en producción.
4. Se aplican aislamiento multisucursal, autorización backend, validaciones, auditoría e idempotencia.
5. Existen pruebas unitarias, integración con PostgreSQL/Redis, pruebas de contrato, concurrencia y casos negativos.
6. Los flujos E2E afectados pasan con datos y servicios de prueba representativos.
7. Formato, lint, typecheck, build y suites exigidas por el repositorio pasan sin debilitar reglas.
8. Documentación operativa, configuración, secretos, despliegue, rollback y observabilidad están actualizados.
9. Hay evidencia de CI y verificación en el entorno objetivo adecuado al riesgo. La validación aislada permite acreditar desarrollo e integración; no sustituye una verificación productiva cuando el alcance requiera desplegar o modificar datos reales.
10. Roadmap y matriz requisito → prueba → ejecución CI están actualizados con enlaces verificables.

## 14. Reglas de gestión del roadmap

- Todas las fases y subfases empiezan en **Pendiente**.
- No inferir que una capacidad está terminada por existir parcialmente en el sistema actual.
- Antes de iniciar un módulo, auditar código real, migraciones, contratos, permisos y pruebas para evitar duplicaciones.
- Si una funcionalidad existente cubre una subfase, registrar evidencia y brechas; no reescribirla por defecto.
- Cada PR debe tener alcance acotado, criterios de aceptación y pruebas propias.
- No fusionar fases con CI fallido ni saltarse dependencias críticas.
- No cambiar scripts, dependencias o infraestructura sin que el alcance de la fase lo requiera y esté autorizado.
- Las decisiones pendientes bloquean únicamente las subfases que dependen de ellas; no se deben inventar valores temporales para aparentar avance.
- Actualizar este roadmap en el PR que aporte la evidencia de cierre.
- Mantener historial de cambios y no eliminar decisiones anteriores sin registrar su reemplazo.

## 15. Estado inicial

**Todos los módulos, fases y subfases de ampliación descritos aquí quedan en estado Pendiente.** El estado de funcionalidades ya existentes debe determinarse mediante auditoría del código y evidencia; este roadmap no modifica retroactivamente ese estado.

La Ola 0 dejó el inventario técnico, el modelo organizacional base y las decisiones principales documentados. Se puede iniciar y avanzar con las fases de implementación en ramas y entornos aislados. Los pendientes de gobierno/recuperación de Fase 0 siguen abiertos y se deben cerrar antes de las operaciones productivas que dependen de ellos; las decisiones funcionales bloquean únicamente las subfases afectadas.


---

## Estado de Ola 0 — actualización 2026-11-18

La auditoría estática y el diseño técnico de referencia de Fase 0 están documentados en [FASE-0-AUDITORIA-TECNICA.md](./FASE-0-AUDITORIA-TECNICA.md). El procedimiento seguro para inspección y restauración está en [FASE-0-RUNBOOK-POSTGRES-BACKUP.md](./FASE-0-RUNBOOK-POSTGRES-BACKUP.md). La política de protección de main está en [FASE-0-PROTECCION-MAIN.md](./FASE-0-PROTECCION-MAIN.md).

- **Completado:** inventario estático inicial de arquitectura, módulos, migraciones, autenticación, autorización, funciones SQL, caché, frontend y pruebas.
- **Completado:** matriz inicial de brechas, modelo lógico candidato, matriz de propiedad propuesta, contrato de contexto, amenazas, estrategia expand/contract y 15 escenarios de aceptación multisucursal.
- **Respondidas:** D0-01 (una organización puede tener varias entidades legales/NIT) y D0-02 (una sucursal puede operar con una o varias entidades legales; relación N:M).
- **Respondida:** D0-03 confirma almacenes centrales y locales por sucursal, con control de inventario por ubicación física y total consolidado por almacén.
- **Respondida:** D0-04 establece catálogo maestro corporativo único y configuración local de surtido, precio y disponibilidad por sucursal, sin duplicar productos.
- **Respondida:** D0-05 permite asignar un usuario a varias sucursales, seleccionar la activa al iniciar sesión y cambiarla desde la aplicación, con permisos validados por sucursal en backend.
- **Respondida como modelo base:** D0-06 combina roles corporativos y roles operativos por sucursal, con permisos configurables. El catálogo inicial de roles está definido; la matriz exacta de acciones/permisos debe aprobarse antes de implementarla.
- **Respondida:** D0-07 confirma que cada sucursal podrá operar varias cajas registradoras y terminales POS simultáneamente; la relación caja-terminal y las reglas de apertura/cierre, asignación de cajeros y turnos siguen pendientes.
- **Respondida en alcance:** D0-08 confirma que Chili POS será internacional y permitirá configurar moneda y zona horaria propias en cada entidad legal y sucursal. La precedencia entre ámbitos, moneda funcional/contable, conversiones y reglas de corte siguen pendientes.
- **Respondida:** D0-09 acepta las tres políticas configurables por producto o sucursal: bloquear ventas por stock insuficiente, permitir vender sin stock suficiente y desactivar manualmente la disponibilidad aunque haya existencias. Las configura un administrador autorizado; matriz de permisos, precedencia entre ámbitos y tratamiento del faltante siguen pendientes.
- **Respondida:** D0-10 adopta un modelo mixto: configuración corporativa con ajustes por entidad legal/sucursal; proveedores compartidos con habilitación por ámbito; clientes compartidos con historial de operaciones por sucursal; promociones corporativas para sucursales designadas o promociones locales. La precedencia de configuración y el detalle de permisos/visibilidad requieren definición adicional.
- **Diseño documentado:** RBAC por ámbito, precedencia de configuración/moneda/zona horaria, separación caja-terminal-turno e inspección/restauración de producción.
- **Implementado:** workflow de CI para Pull Requests, aislado de deploy y sin secretos productivos; test PostgreSQL real con migraciones, ejecución idempotente y rol runtime restringido.
- **Ejecutado con éxito en el HEAD `b1bcc1f97e15a524f80843519899f364b5cb29f2`:** los tres jobs aprobaron: backend/frontend/build y las matrices PostgreSQL 16 y 17 (migraciones desde cero, idempotencia y test con rol runtime restringido). Evidencia: [GitHub Actions run 44422575565](https://github.com/programadorkevinsvega-sys/restaurant-pos/actions/runs/44422575565).
- **Pendiente de configuración:** activar y verificar la protección de `main` según FASE-0-PROTECCION-MAIN.md. Mientras tanto, los checks se verifican manualmente por PR y HEAD; no se hacen pushes directos.
- **Pendiente de ejecución:** inspección de PostgreSQL productivo con el runbook. Esta actividad no impide desarrollar ni probar en bases aisladas.
- **Pendiente de evidencia:** restaurar un backup real en entorno aislado y validar integridad, RPO y RTO observados. Es una puerta previa a migraciones/backfills/cutovers en producción, no un bloqueo del desarrollo en ramas o CI.
- **Continuidad autorizada:** iniciar y avanzar las actividades no productivas de Ola 1 y las subfases que tengan sus decisiones funcionales resueltas. Diseño, código y migraciones pueden validarse en PostgreSQL efímero/aislado.
- **Restricción productiva vigente:** no aplicar en producción migraciones multisucursal, backfills, conversiones/cutovers ni cambios destructivos o incompatibles hasta completar inspección y restore verificado.

**Decisiones registradas:** D0-01 — la organización puede tener varias entidades legales/NIT. D0-02 — una sucursal puede operar con una sola entidad legal o con varias; se requiere una relación N:M explícita y cada operación fiscal/financiera debe identificar su entidad legal responsable. D0-03 — habrá almacenes centrales y almacenes locales por sucursal, con inventario controlado por ubicación física y total consolidado por almacén. D0-04 — el catálogo maestro de productos será corporativo y compartido; cada sucursal podrá configurar surtido, precio y disponibilidad sin duplicar productos. D0-05 — un mismo usuario podrá tener asignaciones a varias sucursales, seleccionar la activa al iniciar sesión y cambiarla desde la aplicación, manteniendo validación de permisos por ámbito en backend. D0-06 — se combinarán roles corporativos (propietario, administrador general, director de operaciones y responsable financiero) y roles operativos por sucursal (gerente, administrador de sucursal, cajero, mesero, cocinero y responsable de inventario), con permisos configurables por ámbito; la matriz detallada de acciones queda pendiente de aprobación. D0-07 — cada sucursal podrá operar varias cajas registradoras y terminales POS simultáneamente; la relación caja-terminal y las reglas de apertura/cierre, asignación de cajeros y turnos requieren decisiones adicionales. D0-08 — Chili POS será internacional; cada entidad legal y sucursal podrá configurar su propia moneda y zona horaria. La precedencia entre ámbitos, moneda funcional, conversiones y reglas de corte quedan pendientes. D0-09 — las políticas de venta y disponibilidad serán configurables por producto o sucursal por un administrador autorizado: bloquear por stock insuficiente, permitir vender sin stock suficiente o desactivar manualmente la disponibilidad aunque existan unidades; permisos exactos, precedencia y tratamiento del faltante quedan pendientes. D0-10 — se adopta modelo mixto: configuración corporativa con ajustes por entidad legal/sucursal; proveedores compartidos con habilitación por ámbito; clientes compartidos con historial por sucursal; promociones corporativas o locales. La precedencia de configuración y el detalle de permisos/visibilidad quedan pendientes.

**Dictamen:** Fase 0 completada en su componente de análisis estático y diseño técnico de referencia, pero no cerrada integralmente. D0-01 a D0-10 están respondidas en su alcance principal; las decisiones operativas complementarias siguen bloqueando solo las subfases que dependen de ellas. El workflow de CI PR y la prueba de integración se implementaron; el HEAD `b1bcc1f97e15a524f80843519899f364b5cb29f2` aprobó backend/frontend/build y PostgreSQL 16/17 ([run 44422575565](https://github.com/programadorkevinsvega-sys/restaurant-pos/actions/runs/44422575565)). La protección de `main`, la inspección productiva y la restauración real siguen pendientes y no se consideran cerradas. **Estas pendientes no bloquean el diseño, implementación ni validación de las demás fases en ramas y entornos aislados.** Sí impiden aplicar en producción migraciones multisucursal, backfills, conversiones/cutovers o cambios destructivos/incompatibles hasta contar con evidencia de recuperación. No se declara Fase 0 integralmente cerrada hasta completar sus entregables pendientes.
