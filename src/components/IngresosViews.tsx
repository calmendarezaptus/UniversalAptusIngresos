import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Download, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { inputCls } from '@/lib/ui'
import {
  agruparInconsistencias, coincide, descargar, facturasCsv, filtrarArbol, flattenFacturas, formatFecha, formatMoney, inconsistenciasCsv,
  PROVEEDOR_LABEL, SEVERIDAD_LABEL, STATUS_LABEL, VIA_LABEL, type Factura, type IngresosResponse, type Montos, type Severidad,
} from '@/lib/ingresos'

const SEV_CLS: Record<Severidad, string> = {
  error: 'bg-red-50 text-red-700 border-red-200',
  revisar: 'bg-amber-50 text-amber-800 border-amber-200',
  aviso: 'bg-slate-50 text-slate-600 border-slate-200',
}
const Sev = ({ s }: { s: Severidad }) => <span className={cn('text-[10px] font-semibold rounded px-1.5 py-0.5 border whitespace-nowrap', SEV_CLS[s] ?? SEV_CLS.aviso)}>{SEVERIDAD_LABEL[s] ?? s}</span>
const num = 'tabular-nums text-right whitespace-nowrap'
const th = 'py-1.5 pr-3 font-medium text-[11px] text-slate-500'

function MontosCols({ m }: { m: Montos }) {
  return (
    <>
      <td className={cn(num, 'py-1.5 pr-3')}>{formatMoney(m.honorarios_mxn)}</td>
      <td className={cn(num, 'py-1.5 pr-3')}>{formatMoney(m.iva_honorarios_mxn)}</td>
      <td className={cn(num, 'py-1.5 pr-3')}>{formatMoney(m.gastos_mxn)}</td>
      <td className={cn(num, 'py-1.5 pr-3')}>{formatMoney(m.iva_gastos_mxn)}</td>
      <td className={cn(num, 'py-1.5 font-semibold')}>{formatMoney(m.total_mxn)}</td>
    </>
  )
}
const MontosHead = () => (
  <>
    <th className={cn(th, 'text-right')}>Honorarios</th><th className={cn(th, 'text-right')}>IVA hon.</th>
    <th className={cn(th, 'text-right')}>Gastos</th><th className={cn(th, 'text-right')}>IVA gastos</th><th className={cn(th, 'text-right pr-0')}>Total MXN</th>
  </>
)

// ── Resumen ──
export function Resumen({ data }: { data: IngresosResponse }) {
  const t = data.totales
  const cards: [string, number][] = [['Honorarios', t.honorarios_mxn], ['IVA honorarios', t.iva_honorarios_mxn], ['Gastos', t.gastos_mxn], ['IVA gastos', t.iva_gastos_mxn]]
  const conCuadre = !!data.cuadre && typeof data.cuadre.diferencia === 'number'
  const cuadra = conCuadre && Math.abs(data.cuadre!.diferencia as number) < 0.01
  // Con filtros que podan (responsable, abogado, moneda, desglose) los pagos del periodo ya no son los mostrados.
  const filtrado = (data.conteos?.facturas_mostradas ?? data.conteos?.facturas) !== data.conteos?.facturas
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 border border-theme-border rounded-xl bg-theme-light p-4">
          <p className="text-[11px] font-semibold text-theme-text">Total cobrado (MXN)</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatMoney(t.total_mxn)}</p>
          <p className="text-[11px] text-slate-500 mt-1">{filtrado
            ? `${data.conteos?.facturas_mostradas ?? 0} de ${data.conteos?.facturas ?? 0} facturas del periodo`
            : `${data.conteos?.pagos ?? 0} pagos · ${data.conteos?.facturas ?? 0} facturas`}</p>
        </div>
        {cards.map(([label, v]) => (
          <div key={label} className="border border-slate-200 rounded-xl bg-white p-4">
            <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatMoney(v)}</p>
          </div>
        ))}
      </div>
      {data.cuadre && !conCuadre && (
        <p className="text-xs rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600">
          {data.cuadre.nota || 'Con filtros el cuadre contra pagos no aplica.'} Lo mostrado: {formatMoney(data.cuadre.repartido_mxn)} MXN de {formatMoney(data.cuadre.cobrado_pagos_mxn)} MXN cobrados en el periodo.
        </p>
      )}
      {data.cuadre && conCuadre && (
        <p className={cn('text-xs rounded-lg border p-2 flex items-start gap-1.5', cuadra ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>
          {cuadra ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          Cobrado en pagos: {formatMoney(data.cuadre.cobrado_pagos_mxn)} MXN · repartido: {formatMoney(data.cuadre.repartido_mxn)} MXN
          {cuadra ? ' · cuadra.' : ` · diferencia ${formatMoney(data.cuadre.diferencia as number)} MXN.`}
        </p>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        <section className="border border-slate-200 rounded-xl bg-white p-3 sm:p-4 min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Por responsable de facturación</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead><tr className="text-left border-b border-slate-200"><th className={th}>Responsable</th><th className={cn(th, 'text-right')}>Facturas</th><MontosHead /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.responsables.map(r => (
                  <tr key={r.responsable}><td className="py-1.5 pr-3">{r.responsable}</td><td className={cn(num, 'py-1.5 pr-3')}>{r.facturas}</td><MontosCols m={r} /></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="border border-slate-200 rounded-xl bg-white p-3 sm:p-4 min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Por abogado</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead><tr className="text-left border-b border-slate-200"><th className={th}>Abogado</th><th className={cn(th, 'text-right')}>Facturas</th><MontosHead /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.resumen_abogados.map(a => (
                  <tr key={a.abogado + a.sin_desglose}>
                    <td className="py-1.5 pr-3">{a.abogado}{a.sin_desglose && <span className="ml-1 text-[10px] text-amber-700" title="Facturas sin desglose por abogado: el honorario se asigna al responsable.">(sin desglose)</span>}</td>
                    <td className={cn(num, 'py-1.5 pr-3')}>{a.facturas}</td><MontosCols m={a} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Detalle por factura ──
function FacturaFila({ f }: { f: Factura }) {
  const [open, setOpen] = useState(false)
  const problemas = f.problemas_cfdi ?? []
  return (
    <>
      <tr className="align-top hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <td className="py-1.5 pr-3 whitespace-nowrap">
          <button type="button" aria-expanded={open} className="inline-flex items-center gap-1 font-medium text-slate-800" onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
            <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-90')} />{f.factura}
          </button>
          <span className="block pl-[18px] text-[10px] text-slate-500">{formatFecha(f.fecha)} · {STATUS_LABEL[f.status] ?? f.status}</span>
        </td>
        <td className={cn(num, 'py-1.5 pr-3')}>{formatMoney(f.cobrado_nativo)} <span className="text-[10px] text-slate-500">{f.moneda}</span></td>
        <MontosCols m={f.montos} />
        <td className="py-1.5 pl-3">
          {f.cfdi ? <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 border bg-emerald-50 text-emerald-800 border-emerald-200">{[f.cfdi.serie, f.cfdi.folio].filter(Boolean).join('-') || 'CFDI'}</span>
            : f.cfdi_aplica === false ? <span className="text-[10px] text-slate-400" title={f.cfdi_motivo ?? ''}>No aplica</span> : null}
          {problemas.map(p => <span key={p.tipo} className="ml-1"><Sev s={p.severidad} /></span>)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="pb-3 pl-[18px]">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-2 text-[11px] text-slate-600">
              <p>Total factura {formatMoney(f.total_factura)} {f.moneda} · detalle: {VIA_LABEL[f.via] ?? f.via}{f.prebill_id ? ` (Prebill #${f.prebill_id})` : ''}</p>
              {!!f.pagos.length && <p>Pagos: {f.pagos.map(p => `#${p.numero} ${formatFecha(p.fecha)} ${formatMoney(p.aplicado)} ${p.moneda} = ${formatMoney(p.mxn)} MXN`).join(' · ')}</p>}
              {!!f.abogados.length && (
                <table className="w-full min-w-[560px]"><tbody>
                  {f.abogados.map(a => <tr key={a.abogado}><td className="py-0.5 pr-3">{a.abogado}{a.sin_desglose ? ' (sin desglose)' : ''}</td><MontosCols m={a} /></tr>)}
                </tbody></table>
              )}
              {[...problemas.map(p => `${p.descripcion}${p.detalle ? ` (${p.detalle})` : ''}`), ...(f.banderas ?? []).filter(b => !problemas.some(p => p.tipo === b))].map(t => <p key={t} className="text-amber-800">• {t}</p>)}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function Detalle({ data }: { data: IngresosResponse }) {
  const [texto, setTexto] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set(data.arbol.flatMap(m => m.responsables.map(r => `${m.moneda_factura}|${r.responsable}`))))
  const arbol = useMemo(() => filtrarArbol(data.arbol, texto), [data.arbol, texto])
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const buscando = !!texto.trim()
  const facturas = useMemo(() => flattenFacturas(data).filter(f => !buscando || coincide(texto, f.cliente, f.factura, ...f.abogados.map(a => a.abogado))), [data, texto, buscando])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input className={cn(inputCls, 'pl-8 pr-8')} placeholder="Buscar cliente, factura o abogado" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar" />
          {texto && <button type="button" aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setTexto('')}><X className="w-4 h-4" /></button>}
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-200" disabled={!facturas.length}
          onClick={() => descargar(`Ingresos-${data.periodo.desde}-${data.periodo.hasta}.csv`, facturasCsv(facturas))}><Download className="w-3.5 h-3.5" />CSV ({facturas.length} facturas)</Button>
      </div>
      {buscando && <p className="text-[11px] text-slate-500">La búsqueda solo oculta facturas; los subtotales son los del periodo completo.</p>}
      {!arbol.length && <p className="text-sm text-slate-500">{buscando ? 'Ninguna factura coincide.' : 'No hay cobros en este periodo.'}</p>}
      {arbol.map(m => (
        <section key={m.moneda_factura} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800">Facturas en {m.moneda_factura}</h3>
            <span className="text-sm font-semibold tabular-nums">{formatMoney(m.subtotal.total_mxn)} MXN</span>
          </div>
          <div className="divide-y divide-slate-200">
            {m.responsables.map(r => {
              const k = `${m.moneda_factura}|${r.responsable}`
              return (
                <div key={k}>
                  <button type="button" aria-expanded={open.has(k)} onClick={() => toggle(k)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-theme-light/60 text-left">
                    <span className="flex items-center gap-2 font-medium text-slate-800"><ChevronRight className={cn('w-4 h-4 text-slate-400 transition-transform', open.has(k) && 'rotate-90')} />{r.responsable}
                      <span className="text-[11px] font-normal text-slate-500">{r.clientes.length} cliente(s)</span></span>
                    <span className="text-sm tabular-nums">{formatMoney(r.subtotal.total_mxn)} MXN</span>
                  </button>
                  {open.has(k) && (
                    <div className="px-3 pb-3 overflow-x-auto">
                      <table className="w-full min-w-[900px] text-xs">
                        <thead><tr className="text-left border-b border-slate-200"><th className={th}>Factura</th><th className={cn(th, 'text-right')}>Cobrado</th><MontosHead /><th className={cn(th, 'pl-3')}>CFDI</th></tr></thead>
                        {r.clientes.map(c => (
                          <tbody key={c.cliente_id ?? c.cliente} className="divide-y divide-slate-100">
                            <tr className="bg-slate-50/70"><td colSpan={2} className="py-1.5 pr-3 font-semibold text-slate-700">{c.cliente}</td><MontosCols m={c.subtotal} /><td /></tr>
                            {c.facturas.map(f => <FacturaFila key={f.zoho_invoice_id ?? f.factura} f={f} />)}
                          </tbody>
                        ))}
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ── Conciliación con CFDI e inconsistencias ──
export function Conciliacion({ data }: { data: IngresosResponse }) {
  const grupos = useMemo(() => agruparInconsistencias(data.inconsistencias), [data.inconsistencias])
  const [tipo, setTipo] = useState('')
  const lista = tipo ? grupos.find(g => g.tipo === tipo)?.items ?? [] : (data.inconsistencias ?? [])
  const c = data.conciliacion
  const n = (x?: unknown[]) => x?.length ?? 0
  return (
    <div className="space-y-4">
      {c && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="border border-slate-200 rounded-xl bg-white p-3"><p className="text-[11px] text-slate-500">CFDI desde</p><p className="text-sm font-semibold">{PROVEEDOR_LABEL[c.proveedor] ?? c.proveedor}</p>
            <p className="text-[10px] text-slate-500">{c.solo_pagadas ? 'Solo facturas pagadas' : 'Todas las facturas'}</p></div>
          <div className="border border-slate-200 rounded-xl bg-white p-3"><p className="text-[11px] text-slate-500">Facturas sin CFDI</p><p className="text-lg font-bold tabular-nums">{n(c.facturas_sin_cfdi)}</p></div>
          <div className="border border-slate-200 rounded-xl bg-white p-3"><p className="text-[11px] text-slate-500">Importes que no cuadran</p><p className="text-lg font-bold tabular-nums">{n(c.importes_no_cuadran)}</p></div>
          <div className="border border-slate-200 rounded-xl bg-white p-3"><p className="text-[11px] text-slate-500">CFDI sin factura</p><p className="text-lg font-bold tabular-nums">{n(c.cfdi_sin_factura)}</p></div>
        </div>
      )}
      {c && c.aplica === false && <p className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 p-2">La conciliación con CFDI no aplica con la configuración actual del despacho.</p>}

      <section className="border border-slate-200 rounded-xl bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Inconsistencias ({data.inconsistencias?.length ?? 0})</h2>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-200" disabled={!lista.length}
            onClick={() => descargar(`Inconsistencias-${data.periodo.desde}-${data.periodo.hasta}.csv`, inconsistenciasCsv(lista))}><Download className="w-3.5 h-3.5" />CSV</Button>
        </div>
        {!grupos.length ? <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Sin inconsistencias en el periodo.</p> : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button type="button" aria-pressed={!tipo} onClick={() => setTipo('')} className={cn('text-xs rounded-full border px-2.5 py-1', !tipo ? 'bg-theme-light border-theme-border text-theme-text font-semibold' : 'border-slate-200 text-slate-600')}>Todas</button>
              {grupos.map(g => (
                <button key={g.tipo} type="button" aria-pressed={tipo === g.tipo} title={g.descripcion} onClick={() => setTipo(t => t === g.tipo ? '' : g.tipo)}
                  className={cn('text-xs rounded-full border px-2.5 py-1 flex items-center gap-1.5', tipo === g.tipo ? 'bg-theme-light border-theme-border text-theme-text font-semibold' : 'border-slate-200 text-slate-600')}>
                  <Sev s={g.severidad} />{g.descripcion} <span className="tabular-nums text-slate-500">{g.total}</span>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="sticky top-0 bg-white"><tr className="text-left border-b border-slate-200"><th className={th}>Severidad</th><th className={th}>Qué pasa</th><th className={th}>Factura</th><th className={th}>Cliente</th><th className={th}>Detalle</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {lista.map((i, idx) => (
                    <tr key={`${i.tipo}-${i.factura ?? ''}-${idx}`} className="align-top">
                      <td className="py-1.5 pr-3"><Sev s={i.severidad} /></td>
                      <td className="py-1.5 pr-3">{i.descripcion}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{i.factura || '—'}</td>
                      <td className="py-1.5 pr-3">{i.cliente || '—'}</td>
                      <td className="py-1.5 text-slate-500 max-w-[360px] break-words">{i.detalle || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
