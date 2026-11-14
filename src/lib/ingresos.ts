import { API_BASE } from './api'

// Reporte 03 de ReportesSandbox (ingresos por responsable de facturación, base de efectivo, en MXN) vía
// aptus_report_services. Solo lectura. Los importes ya vienen repartidos por el servidor; aquí solo se
// presentan, se aplanan para CSV y se agrupan las inconsistencias.
export interface Montos { moneda: string; honorarios_mxn: number; iva_honorarios_mxn: number; gastos_mxn: number; iva_gastos_mxn: number; total_mxn: number }
export interface Problema { tipo: string; severidad: Severidad; descripcion: string; detalle?: string }
export type Severidad = 'error' | 'revisar' | 'aviso'
export interface Pago { numero: string; fecha: string; aplicado: number; moneda: string; mxn: number }
export interface AbogadoMonto extends Montos { abogado: string; sin_desglose: boolean }
export interface Factura {
  factura: string; zoho_invoice_id?: string | null; fecha: string; status: string; cliente_id?: string | null; cliente: string
  moneda: string; total_factura: number; cobrado_nativo: number; responsable: string; via: 'prebill' | 'lineas_books' | 'sin_detalle' | string
  prebill_id?: number | null; pagos: Pago[]; montos: Montos; abogados: AbogadoMonto[]; tiene_sin_desglose?: boolean; banderas?: string[]
  cfdi?: { estado?: string; serie?: string; folio?: string; uuid?: string; total?: number } | null; cfdi_aplica?: boolean; cfdi_motivo?: string | null
  problemas_cfdi?: Problema[]
}
export interface NodoCliente { cliente_id?: string | null; cliente: string; subtotal: Montos; facturas: Factura[] }
export interface NodoResponsable { responsable: string; subtotal: Montos; clientes: NodoCliente[] }
export interface NodoMoneda { moneda_factura: string; subtotal: Montos; responsables: NodoResponsable[] }
export interface Inconsistencia { tipo: string; severidad: Severidad; descripcion: string; factura?: string | null; cliente_id?: string | null; cliente?: string | null; detalle?: string }
export interface IngresosResponse {
  reporte: 'ingresos'; periodo: { desde: string; hasta: string }; generado_en: string; actualizando?: boolean
  cache?: { cargado_en?: string; edad_s?: number; vigencia_s?: number; actualizando?: boolean }
  solo_honorarios?: boolean; totales: Montos
  responsables: (Montos & { responsable: string; facturas: number })[]
  resumen_abogados: (AbogadoMonto & { facturas: number })[]
  arbol: NodoMoneda[]
  conciliacion?: { proveedor: string; solo_pagadas?: boolean; aplica?: boolean; cfdi_cargados_en?: string | null; facturas_sin_cfdi?: unknown[]; importes_no_cuadran?: unknown[]; cfdi_sin_factura?: unknown[] }
  // Con filtros no trae `diferencia` sino `nota`: el cuadre contra pagos no aplica.
  cuadre?: { moneda: string; cobrado_pagos_mxn: number; repartido_mxn: number; diferencia?: number; nota?: string }
  conteos?: { pagos?: number; aplicaciones?: number; facturas?: number; facturas_mostradas?: number }
  inconsistencias?: Inconsistencia[]; conteo_inconsistencias?: Record<string, number>
}
export interface Pendiente { listo: false; actualizando?: boolean }

// ── Periodo y filtros ──
export type Preset = 'mes_anterior' | 'mes_actual' | 'anio_actual' | 'anio_anterior' | 'personalizado'
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'mes_actual', label: 'Este mes' },
  { id: 'anio_actual', label: 'Este año' },
  { id: 'anio_anterior', label: 'Año anterior' },
  { id: 'personalizado', label: 'Otro periodo' },
]
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m: 1-12

// Rango de fechas de un preset, con la fecha local de hoy. "personalizado" no calcula nada.
export function rango(preset: Preset, hoy = new Date()): { desde: string; hasta: string } | null {
  const y = hoy.getFullYear(), m = hoy.getMonth() + 1
  switch (preset) {
    case 'mes_anterior': { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return { desde: iso(py, pm, 1), hasta: iso(py, pm, ultimoDia(py, pm)) } }
    case 'mes_actual': return { desde: iso(y, m, 1), hasta: iso(y, m, hoy.getDate()) }
    case 'anio_actual': return { desde: iso(y, 1, 1), hasta: iso(y, m, hoy.getDate()) }
    case 'anio_anterior': return { desde: iso(y - 1, 1, 1), hasta: iso(y - 1, 12, 31) }
    default: return null
  }
}

export interface Filtros {
  desde: string; hasta: string; moneda: string; concepto: '' | 'honorarios'; sin_desglose: '' | 'solo' | 'excluir'
  responsable: string; abogado: string
}
export const filtrosIniciales = (hoy = new Date()): Filtros => ({ ...rango('mes_anterior', hoy)!, moneda: '', concepto: '', sin_desglose: '', responsable: '', abogado: '' })

const FECHA = /^\d{4}-\d{2}-\d{2}$/
export function validateFiltros(f: Filtros): string | null {
  if (!FECHA.test(f.desde) || !FECHA.test(f.hasta)) return 'Elige las dos fechas del periodo.'
  if (f.desde > f.hasta) return 'La fecha inicial es posterior a la final.'
  return null
}

export function buildQuery(f: Filtros, forzar = false): string {
  const q = new URLSearchParams()
  q.set('desde', f.desde); q.set('hasta', f.hasta)
  if (f.moneda) q.set('moneda', f.moneda)
  if (f.concepto) q.set('concepto', f.concepto)
  if (f.sin_desglose) q.set('sin_desglose', f.sin_desglose)
  if (f.responsable.trim()) q.set('responsable', f.responsable.trim())
  if (f.abogado.trim()) q.set('abogado', f.abogado.trim())
  if (forzar) q.set('forzar', '1')
  return '?' + q.toString()
}

// ── Lectura ──
const isPendiente = (d: unknown): d is Pendiente => !!d && typeof d === 'object' && (d as { listo?: unknown }).listo === false
const isIngresos = (d: unknown): d is IngresosResponse => !!d && typeof d === 'object' && (d as IngresosResponse).reporte === 'ingresos' && Array.isArray((d as IngresosResponse).arbol) && !!(d as IngresosResponse).totales

export async function getIngresos(org: string, f: Filtros, { forzar = false, signal }: { forzar?: boolean; signal?: AbortSignal } = {}): Promise<IngresosResponse | Pendiente> {
  let response: Response
  try { response = await fetch(`${API_BASE}/${encodeURIComponent(org)}/ingresos${buildQuery(f, forzar)}`, { signal }) }
  catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new Error('No hay conexión con el servicio de reportes.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo cargar el reporte de ingresos.')
  if (isPendiente(data)) return data
  if (!isIngresos(data)) throw new Error('Respuesta inesperada del servicio de reportes.')
  return data
}

// ── Facturas aplanadas (para buscar y para CSV) ──
export interface FilaFactura extends Factura { moneda_factura: string }
export function flattenFacturas(data: IngresosResponse): FilaFactura[] {
  return data.arbol.flatMap(m => m.responsables.flatMap(r => r.clientes.flatMap(c => c.facturas.map(f => ({
    ...f, moneda_factura: m.moneda_factura, responsable: f.responsable || r.responsable, cliente: f.cliente || c.cliente, cliente_id: f.cliente_id ?? c.cliente_id ?? null,
  })))))
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const coincide = (texto: string, ...campos: (string | null | undefined)[]) => {
  const words = norm(texto.trim()).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = norm(campos.filter(Boolean).join(' '))
  return words.every(w => hay.includes(w))
}

// Árbol podado por texto (cliente, número de factura, abogado). Los subtotales de los nodos siguen
// siendo los del servidor: la búsqueda solo oculta, no recalcula.
export function filtrarArbol(arbol: NodoMoneda[], texto: string): NodoMoneda[] {
  if (!texto.trim()) return arbol
  return arbol.map(m => ({
    ...m,
    responsables: m.responsables.map(r => ({
      ...r,
      clientes: r.clientes.map(c => ({ ...c, facturas: c.facturas.filter(f => coincide(texto, c.cliente, f.factura, ...f.abogados.map(a => a.abogado))) })).filter(c => c.facturas.length),
    })).filter(r => r.clientes.length),
  })).filter(m => m.responsables.length)
}

// ── Inconsistencias ──
export const SEVERIDAD_ORDEN: Severidad[] = ['error', 'revisar', 'aviso']
export const SEVERIDAD_LABEL: Record<Severidad, string> = { error: 'Error', revisar: 'Revisar', aviso: 'Aviso' }
export interface GrupoInconsistencia { tipo: string; severidad: Severidad; descripcion: string; total: number; items: Inconsistencia[] }
export function agruparInconsistencias(list: Inconsistencia[] = []): GrupoInconsistencia[] {
  const m = new Map<string, GrupoInconsistencia>()
  for (const i of list) {
    const g = m.get(i.tipo) ?? { tipo: i.tipo, severidad: i.severidad, descripcion: i.descripcion, total: 0, items: [] }
    g.total += 1; g.items.push(i); m.set(i.tipo, g)
  }
  const rank = (s: Severidad) => { const n = SEVERIDAD_ORDEN.indexOf(s); return n < 0 ? 9 : n }
  return [...m.values()].sort((a, b) => rank(a.severidad) - rank(b.severidad) || b.total - a.total || a.tipo.localeCompare(b.tipo))
}

// ── Presentación ──
export const VIA_LABEL: Record<string, string> = { prebill: 'Prebill de Aptus', lineas_books: 'Líneas de Books', sin_detalle: 'Sin detalle' }
export const STATUS_LABEL: Record<string, string> = { paid: 'Pagada', partially_paid: 'Pago parcial', overdue: 'Vencida', sent: 'Enviada', void: 'Anulada', draft: 'Borrador', unpaid: 'Sin pagar' }
export const PROVEEDOR_LABEL: Record<string, string> = { ninguno: 'Sin CFDI', interno: 'Registro interno', creator: 'Zoho Creator' }

export function formatMoney(n: number, moneda?: string) {
  const s = (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return moneda ? `${s} ${moneda}` : s
}
export function formatFecha(isoDate: string) {
  const [y, m, d] = (isoDate || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : isoDate
}
export function edadCache(segundos?: number) {
  if (segundos == null || !Number.isFinite(segundos)) return ''
  if (segundos < 90) return 'hace un momento'
  const min = Math.round(segundos / 60)
  return min < 90 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '')
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (header: string[], rows: unknown[][]) => '﻿' + [header.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n')

// Una fila por factura y abogado (como el Reporte 03); importes en MXN.
export function facturasCsv(rows: FilaFactura[]): string {
  const out: unknown[][] = []
  for (const f of rows) {
    const base = [f.responsable, f.cliente, f.factura, f.fecha, STATUS_LABEL[f.status] ?? f.status, f.moneda, f.total_factura, f.cobrado_nativo, f.pagos.map(p => p.numero).join(' '), VIA_LABEL[f.via] ?? f.via]
    const cfdi = f.cfdi ? [f.cfdi.serie, f.cfdi.folio].filter(Boolean).join('-') || f.cfdi.uuid || 'Sí' : ''
    const problemas = (f.problemas_cfdi ?? []).map(p => p.tipo).concat(f.banderas ?? []).join(' ')
    const abogados = f.abogados.length ? f.abogados : [{ abogado: '', sin_desglose: false, ...f.montos }]
    for (const a of abogados) out.push([...base, a.abogado, a.sin_desglose ? 'Sí' : '', a.honorarios_mxn, a.iva_honorarios_mxn, a.gastos_mxn, a.iva_gastos_mxn, a.total_mxn, cfdi, problemas])
  }
  return csv(['Responsable', 'Cliente', 'Factura', 'Fecha', 'Estado', 'Moneda', 'Total factura', 'Cobrado (moneda factura)', 'Pagos', 'Origen del detalle',
    'Abogado', 'Sin desglose', 'Honorarios MXN', 'IVA honorarios MXN', 'Gastos MXN', 'IVA gastos MXN', 'Total MXN', 'CFDI', 'Banderas'], out)
}

export function inconsistenciasCsv(list: Inconsistencia[]): string {
  return csv(['Severidad', 'Tipo', 'Descripción', 'Factura', 'Cliente', 'Detalle'],
    list.map(i => [SEVERIDAD_LABEL[i.severidad] ?? i.severidad, i.tipo, i.descripcion, i.factura ?? '', i.cliente ?? '', i.detalle ?? '']))
}

export function descargar(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
