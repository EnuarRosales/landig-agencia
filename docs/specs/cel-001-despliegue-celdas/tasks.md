# CEL-001 — Tareas de implementación

**Estado de la especificación:** CEL-001 v1.0 aprobada.  
**Estado de implementación:** Todas las tareas están pendientes. La aprobación de esta spec no autoriza cambios de código, migraciones, commits ni despliegues.

| ID | Requisitos | Tarea | Dependencia | Estado |
|---|---|---|---|---|
| CEL-T01 | CEL-RF-001–005, CEL-RF-023–026 | Auditar contratos persistidos `local_compose`/`remote_vps`; implementar el registro de hosts y relación `cell_id → host_id` sin romper datos/APIs; aplicar el mapping de CEL-RF-026, registrar el preflight manual de capacidad antes de marcar un host `ready`; conservar capacidad nominal 100 y reservas atómicas. | CEL-001 aprobada; compatibilidad documentada | [ ] Pendiente |
| CEL-T02 | CEL-RF-006–009, CEL-RF-026 | Implementar `CellDeploymentSpec` neutral y `ComposeCellManifestRenderer`; capturar salidas previas y demostrar equivalencia semántica antes de cambios funcionales. | CEL-T01 contractualmente definido | [ ] Pendiente |
| CEL-T03 | CEL-RF-010–015, CEL-RF-023–026 | Corregir perfil local: build offline desde fuente con dependencias precargadas y sin registry/Internet, migraciones celulares explícitas, migrador one-shot, readiness de PgBouncer, probes, handshake, secretos y estándar de host. | CEL-T02 y puerta de Etapa 1 | [ ] Pendiente |
| CEL-T04 | CEL-RF-016–022 | Implementar persistencia de multimedia en SeaweedFS y lectura segura con imgproxy: autorización por `client_id`, referencias/metadatos, secretos server-only, firmas, expiración y manejo de fallos parciales. | CEL-T02; credenciales/endpoints compartidos disponibles | [ ] Pendiente |
| CEL-T05 | CEL-RF-001–009, CEL-RF-015, CEL-RF-023–026 | Implementar renderer `control_plane_vps`: artefacto inmutable, redes necesarias solo para `tenant-app`, routing único por `cell_code`, cero puertos publicados y cero `latest`. | CEL-T02–T04 | [ ] Pendiente |
| CEL-T06 | CEL-RF-001–005, CEL-RF-022, CEL-RF-026 | Implementar renderer `external_vps` con Traefik local, endpoints privados configurables y sin redes Docker del VPS principal. Documentar VPN/red privada como prerequisito externo si el repo no la administra. | CEL-T02–T04; evidencia de endpoints/red privada | [ ] Pendiente |
| CEL-T07 | CEL-RF-001–026, AC-01–13 | Ejecutar suites relevantes, pruebas aisladas de PostgreSQL y `docker compose config` para cada perfil; comprobar aislamiento, routing, media, expiración y ausencia de colisiones. Registrar evidencia no disponible sin afirmar despliegue/runtime no observado. | CEL-T01–T06 | [ ] Pendiente |
| CEL-T08 | CEL-RF-001–026 | Completar runbooks, documentación de APIs/configuración y evidencia operativa; dejar DAT-001, ADM-001 y OPS-001 como referencias sin duplicar el contrato detallado. | CEL-T07 | [ ] Pendiente |

## Reglas de ejecución

- CEL-T01–T08 no quedan autorizadas para implementar código hasta que CEL-001 sea aprobada y la implementación reciba autorización explícita.
- La Etapa 2 queda bloqueada hasta que CEL-T02 demuestre equivalencia de Etapa 1.
- Cualquier migración persistida, efecto irreversible, cambio de contrato público, secreto nuevo o requisito de conectividad externa debe pasar por las salvaguardas y especificaciones correspondientes antes de ejecutarse.
- No hay commits definidos en esta propuesta; la entrega y cualquier commit siguen la autorización explícita y las reglas del repositorio.