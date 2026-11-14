# Ingresos (Reporte 03)

Slate del proyecto Reportes (`ReportsForAptusFinancials`). Lo cobrado en un periodo (base de efectivo),
repartido en honorarios, IVA y gastos, en MXN, por responsable de facturación, con la conciliación
contra el CFDI. **Solo consulta.**

- Abre con `?organization_id=<org de Books>`; opcional `?origin=` para el botón Regresar.
- Periodo: mes anterior (por omisión), este mes, este año, año anterior u otro.
- Filtros que van a la API: responsable, abogado, moneda de la factura, concepto y desglose.
- Pestañas: Resumen (totales, cuadre, por responsable y por abogado), Detalle por factura (árbol por
  moneda → responsable → cliente → factura, búsqueda y CSV) y Conciliación CFDI (inconsistencias por tipo, CSV).
- Si el servidor todavía calcula el periodo (`{ listo: false }`), vuelve a consultar cada 4 s.

Variables (opcionales): `VITE_API_BASE_URL` (URL de `aptus_report_services`), `VITE_CALENDAR_URL`.

```bash
npm install
npm test
npm run build   # salida en dist/
```
