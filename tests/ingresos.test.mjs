import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const toModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')
const api = read('../src/lib/api.ts').replace(/import\.meta\.env\.DEV/g, 'true').replace(/import\.meta\.env\.\w+/g, 'undefined')
const lib = await import(toModule(read('../src/lib/ingresos.ts').replace("from './api'", `from '${toModule(api)}'`)))

const m = (total, extra = {}) => ({ moneda: 'MXN', honorarios_mxn: total, iva_honorarios_mxn: 0, gastos_mxn: 0, iva_gastos_mxn: 0, total_mxn: total, ...extra })
const factura = o => ({ factura: 'INV-1', fecha: '2026-10-05', status: 'paid', cliente: 'Avolar', moneda: 'MXN', total_factura: 100, cobrado_nativo: 100, responsable: 'Ana', via: 'prebill', pagos: [{ numero: '7', fecha: '2026-10-06', aplicado: 100, moneda: 'MXN', mxn: 100 }], montos: m(100), abogados: [{ abogado: 'José Pérez', sin_desglose: false, ...m(100) }], ...o })
const data = {
  reporte: 'ingresos', periodo: { desde: '2026-10-01', hasta: '2026-10-31' }, generado_en: 'x', totales: m(150), responsables: [], resumen_abogados: [],
  arbol: [
    { moneda_factura: 'MXN', subtotal: m(100), responsables: [{ responsable: 'Ana', subtotal: m(100), clientes: [{ cliente_id: '1', cliente: 'Avolar', subtotal: m(100), facturas: [factura({})] }] }] },
    { moneda_factura: 'USD', subtotal: m(50), responsables: [{ responsable: 'Sin responsable', subtotal: m(50), clientes: [{ cliente_id: '2', cliente: 'Go Wine', subtotal: m(50), facturas: [factura({ factura: 'INV-2', cliente: '', moneda: 'USD', abogados: [], montos: m(50), responsable: '' })] }] }] },
  ],
  inconsistencias: [
    { tipo: 'SIN_CFDI', severidad: 'revisar', descripcion: 'Sin CFDI', factura: 'INV-1' },
    { tipo: 'CFDI_DUPLICADO', severidad: 'error', descripcion: 'Duplicado', factura: 'INV-2' },
    { tipo: 'SIN_CFDI', severidad: 'revisar', descripcion: 'Sin CFDI', factura: 'INV-3' },
    { tipo: 'PAGO_SIN_FACTURA', severidad: 'aviso', descripcion: 'Pago sin factura', detalle: '=1+1' },
  ],
}

test('rango: mes anterior (incluye enero → diciembre), este mes, año anterior', () => {
  assert.deepEqual(lib.rango('mes_anterior', new Date(2026, 10, 14)), { desde: '2026-10-01', hasta: '2026-10-31' })
  assert.deepEqual(lib.rango('mes_anterior', new Date(2026, 0, 3)), { desde: '2025-12-01', hasta: '2025-12-31' })
  assert.deepEqual(lib.rango('mes_anterior', new Date(2024, 2, 10)), { desde: '2024-02-01', hasta: '2024-02-29' })
  assert.deepEqual(lib.rango('mes_actual', new Date(2026, 10, 14)), { desde: '2026-11-01', hasta: '2026-11-14' })
  assert.deepEqual(lib.rango('anio_anterior', new Date(2026, 10, 14)), { desde: '2025-01-01', hasta: '2025-12-31' })
  assert.equal(lib.rango('personalizado'), null)
})

test('buildQuery y validación del periodo', () => {
  const f = lib.filtrosIniciales(new Date(2026, 10, 14))
  assert.equal(lib.buildQuery(f), '?desde=2026-10-01&hasta=2026-10-31')
  assert.equal(lib.buildQuery({ ...f, moneda: 'USD', concepto: 'honorarios', sin_desglose: 'excluir', responsable: ' Laura Romero M. ', abogado: 'José' }, true),
    '?desde=2026-10-01&hasta=2026-10-31&moneda=USD&concepto=honorarios&sin_desglose=excluir&responsable=Laura+Romero+M.&abogado=Jos%C3%A9&forzar=1')
  assert.equal(lib.validateFiltros({ ...f, desde: '' }), 'Elige las dos fechas del periodo.')
  assert.equal(lib.validateFiltros({ ...f, desde: '2026-11-01' }), 'La fecha inicial es posterior a la final.')
  assert.equal(lib.validateFiltros(f), null)
})

test('aplanar facturas hereda cliente y responsable; búsqueda poda sin recalcular', () => {
  const rows = lib.flattenFacturas(data)
  assert.deepEqual(rows.map(r => [r.factura, r.cliente, r.responsable, r.moneda_factura]), [['INV-1', 'Avolar', 'Ana', 'MXN'], ['INV-2', 'Go Wine', 'Sin responsable', 'USD']])
  const podado = lib.filtrarArbol(data.arbol, 'jose')
  assert.equal(podado.length, 1)
  assert.equal(podado[0].subtotal.total_mxn, 100)
  assert.equal(lib.filtrarArbol(data.arbol, 'go wine')[0].moneda_factura, 'USD')
  assert.equal(lib.filtrarArbol(data.arbol, '').length, 2)
})

test('inconsistencias: agrupadas por tipo, errores primero', () => {
  const g = lib.agruparInconsistencias(data.inconsistencias)
  assert.deepEqual(g.map(x => [x.tipo, x.total]), [['CFDI_DUPLICADO', 1], ['SIN_CFDI', 2], ['PAGO_SIN_FACTURA', 1]])
  assert.deepEqual(lib.agruparInconsistencias(undefined), [])
})

test('CSV: una fila por factura y abogado, sin fórmulas', () => {
  const csv = lib.facturasCsv(lib.flattenFacturas(data))
  const lines = csv.split('\r\n')
  assert.ok(lines[0].startsWith('﻿Responsable,Cliente,Factura'))
  assert.equal(lines.length, 3)
  assert.ok(lines[1].includes('José Pérez'))
  assert.ok(lib.inconsistenciasCsv(data.inconsistencias).includes("'=1+1"))
})

test('getIngresos: { listo: false } para reintentar; errores con mensaje', async () => {
  const original = globalThis.fetch
  try {
    let url
    globalThis.fetch = async u => { url = u; return new Response(JSON.stringify({ listo: false }), { status: 200 }) }
    assert.deepEqual(await lib.getIngresos('636939444', lib.filtrosIniciales(new Date(2026, 10, 14))), { listo: false })
    assert.equal(url, '/api/636939444/ingresos?desde=2026-10-01&hasta=2026-10-31')
    globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 200 })
    assert.equal((await lib.getIngresos('1', lib.filtrosIniciales())).reporte, 'ingresos')
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Cliente inexistente.' }), { status: 404 })
    await assert.rejects(lib.getIngresos('1', lib.filtrosIniciales()), /Cliente inexistente/)
    globalThis.fetch = async () => new Response('[]', { status: 200 })
    await assert.rejects(lib.getIngresos('1', lib.filtrosIniciales()), /inesperada/)
  } finally { globalThis.fetch = original }
})
