import { useEffect, useRef, useState } from 'react'
import 'animate.css'
import { Toaster } from 'sonner'
import { FileSearch, Landmark, LayoutDashboard, ListTree, Loader2, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusModal, type StatusModalType } from '@/components/StatusModal'
import { ThemeMenu } from '@/components/ThemeMenu'
import { Conciliacion, Detalle, Resumen } from '@/components/IngresosViews'
import { cn } from '@/lib/utils'
import { CALENDAR_URL } from '@/lib/api'
import { inputCls, labelCls, useTheme } from '@/lib/ui'
import { edadCache, filtrosIniciales, formatFecha, getIngresos, PRESETS, rango, validateFiltros, type Filtros, type IngresosResponse, type Preset } from '@/lib/ingresos'
import { MenuButton } from '@/components/MenuButton'

type Modal = { isOpen: boolean; type: StatusModalType; title: string; message: string }
const REINTENTO_MS = 4000
const MAX_INTENTOS = 30 // el primer cálculo de un periodo largo tarda ~70 s en el servidor

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'detalle', label: 'Detalle por factura', icon: ListTree },
  { id: 'conciliacion', label: 'Conciliación CFDI', icon: FileSearch },
] as const
type Tab = typeof TABS[number]['id']
const segCls = (active: boolean) => cn('px-3 h-8 text-xs font-semibold rounded-md transition-all whitespace-nowrap',
  active ? 'bg-white text-theme-text shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-theme-light border border-transparent')
const selectCls = cn(inputCls, 'w-full px-2 border')

function App() {
  const [theme, setTheme] = useTheme()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState<Modal>({ isOpen: false, type: 'info', title: '', message: '' })
  useEffect(() => {
    const orgId = new URLSearchParams(window.location.search).get('organization_id')
    if (!orgId) setStatusModal({ isOpen: true, type: 'error', title: 'Error de Inicialización', message: 'No se detectó la organización relacionada. Es necesario incluir el parámetro "organization_id" en la URL.' })
    else setOrganizationId(orgId)
  }, [])

  const [tab, setTab] = useState<Tab>('resumen')

  // ── Filtros ──
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosIniciales())
  const [preset, setPreset] = useState<Preset>('mes_anterior')
  const [fechas, setFechas] = useState({ desde: filtros.desde, hasta: filtros.hasta })
  const errorFechas = preset === 'personalizado' ? validateFiltros({ ...filtros, ...fechas }) : null
  const elegirPreset = (p: Preset) => {
    setPreset(p)
    const r = rango(p)
    if (r) { setFechas(r); setFiltros(f => ({ ...f, ...r })) }
  }
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros(f => ({ ...f, [k]: v }))

  // Nombres conocidos de responsables y abogados (se acumulan: con un filtro puesto la respuesta trae menos).
  const [nombres, setNombres] = useState<{ responsables: string[]; abogados: string[] }>({ responsables: [], abogados: [] })

  // ── Carga con reintento mientras el servidor calcula ({ listo: false }) ──
  const [data, setData] = useState<IngresosResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [preparando, setPreparando] = useState(0)
  const [loadError, setLoadError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = (forzar = false) => {
    if (!organizationId || validateFiltros(filtros)) return
    controller.current?.abort(); window.clearTimeout(timer.current)
    const ctrl = new AbortController(); controller.current = ctrl
    setLoading(true); setLoadError(''); setPreparando(0)
    const attempt = async (n: number, conForzar: boolean) => {
      try {
        const result = await getIngresos(organizationId, filtros, { forzar: conForzar, signal: ctrl.signal })
        if (ctrl.signal.aborted) return
        if ('listo' in result) {
          if (n >= MAX_INTENTOS) { setLoading(false); setPreparando(0); setLoadError('El reporte sigue calculándose en el servidor. Intenta de nuevo en unos minutos.'); return }
          setPreparando(n)
          timer.current = window.setTimeout(() => void attempt(n + 1, false), REINTENTO_MS)
          return
        }
        setData(result); setLoading(false); setPreparando(0)
        setNombres(prev => ({
          responsables: [...new Set([...prev.responsables, ...result.responsables.map(r => r.responsable)])].sort((a, b) => a.localeCompare(b, 'es')),
          abogados: [...new Set([...prev.abogados, ...result.resumen_abogados.filter(a => !a.sin_desglose || a.abogado !== 'Sin responsable').map(a => a.abogado)])].sort((a, b) => a.localeCompare(b, 'es')),
        }))
      } catch (error) {
        if (ctrl.signal.aborted || (error as Error)?.name === 'AbortError') return
        setLoading(false); setPreparando(0)
        setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el reporte de ingresos.')
      }
    }
    void attempt(1, forzar)
  }
  useEffect(() => { load() }, [organizationId, filtros]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { controller.current?.abort(); window.clearTimeout(timer.current) }, [])

  function handleCancel() {
    const params = new URLSearchParams(window.location.search)
    const org = organizationId || params.get('organization_id') || ''
    try {
      const target = new URL(params.get('origin') || CALENDAR_URL)
      if (!target.searchParams.get('organization_id') && org) target.searchParams.set('organization_id', org)
      target.searchParams.set('_t', Date.now().toString())
      window.location.href = target.toString()
    } catch {
      window.location.href = `${CALENDAR_URL}?organization_id=${encodeURIComponent(org)}&_t=${Date.now()}`
    }
  }

  const incons = data?.inconsistencias?.length ?? 0

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 lg:p-8 flex justify-center items-start font-sans w-full">
      <Toaster position="top-center" richColors />
      <Card className="w-full bg-gradient-to-b from-[#F5F8FD] to-white border border-slate-200 rounded-[20px] overflow-hidden p-3 sm:p-5 lg:p-8 relative animate__animated animate__fadeIn animate__faster">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-theme-from/5 rounded-full blur-[80px] animate-blob pointer-events-none z-0"></div>
        <div className="absolute top-0 left-0 right-0 h-15 bg-gradient-to-b from-theme-light to-transparent pointer-events-none z-0"></div>

        {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 lg:mb-6 gap-0 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-from to-theme-to flex items-center justify-center shrink-0 shadow-sm border border-black/5 text-white">
              <Landmark className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ingresos (Reporte 03)</h1>
                <ThemeMenu theme={theme} setTheme={setTheme} />
                <MenuButton />
              </div>
              <p className="text-slate-500 text-sm mt-0.5">Lo cobrado en el periodo por responsable de facturación, en MXN, con su conciliación de CFDI</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
            <Button variant="outline" type="button" onClick={() => load(true)} disabled={loading || !organizationId}
              className="flex-1 lg:flex-none h-11 sm:h-12 px-4 rounded-lg border-slate-200 text-slate-700 gap-2">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />Recalcular
            </Button>
            <Button variant="outline" type="button" onClick={handleCancel}
              className="flex-1 lg:flex-none h-11 sm:h-12 px-6 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium">
              Regresar
            </Button>
          </div>
        </div>

        {/* ── FILTROS ─────────────────────────────────────────────────────── */}
        <div className="relative z-10 border border-slate-200 rounded-xl bg-white p-3 sm:p-4 mb-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200" role="radiogroup" aria-label="Periodo">
              {PRESETS.map(p => <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={segCls(preset === p.id)} onClick={() => elegirPreset(p.id)}>{p.label}</button>)}
            </div>
            {preset === 'personalizado' && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1"><span className={labelCls}>Desde</span>
                  <Input type="date" className={cn(inputCls, 'w-40')} value={fechas.desde} onChange={e => setFechas(x => ({ ...x, desde: e.target.value }))} /></label>
                <label className="space-y-1"><span className={labelCls}>Hasta</span>
                  <Input type="date" className={cn(inputCls, 'w-40')} value={fechas.hasta} onChange={e => setFechas(x => ({ ...x, hasta: e.target.value }))} /></label>
                <Button type="button" className="h-9" disabled={!!errorFechas || loading || (fechas.desde === filtros.desde && fechas.hasta === filtros.hasta)}
                  onClick={() => setFiltros(f => ({ ...f, ...fechas }))}>Aplicar</Button>
              </div>
            )}
          </div>
          {errorFechas && <p role="alert" className="text-xs text-red-700">{errorFechas}</p>}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <label className="space-y-1"><span className={labelCls}>Responsable</span>
              <select className={selectCls} value={filtros.responsable} onChange={e => set('responsable', e.target.value)}>
                <option value="">Todos</option>{nombres.responsables.map(n => <option key={n}>{n}</option>)}
              </select></label>
            <label className="space-y-1"><span className={labelCls}>Abogado</span>
              <select className={selectCls} value={filtros.abogado} onChange={e => set('abogado', e.target.value)}>
                <option value="">Todos</option>{nombres.abogados.map(n => <option key={n}>{n}</option>)}
              </select></label>
            <label className="space-y-1"><span className={labelCls}>Moneda de la factura</span>
              <select className={selectCls} value={filtros.moneda} onChange={e => set('moneda', e.target.value)}>
                <option value="">Todas</option><option>MXN</option><option>USD</option><option>EUR</option>
              </select></label>
            <label className="space-y-1"><span className={labelCls}>Concepto</span>
              <select className={selectCls} value={filtros.concepto} onChange={e => set('concepto', e.target.value as Filtros['concepto'])}>
                <option value="">Honorarios y gastos</option><option value="honorarios">Solo honorarios</option>
              </select></label>
            <label className="space-y-1 col-span-2 lg:col-span-1"><span className={labelCls}>Desglose por abogado</span>
              <select className={selectCls} value={filtros.sin_desglose} onChange={e => set('sin_desglose', e.target.value as Filtros['sin_desglose'])}>
                <option value="">Todas las facturas</option><option value="excluir">Solo con desglose</option><option value="solo">Solo sin desglose</option>
              </select></label>
          </div>
          {filtros.abogado && <p className="text-[11px] text-slate-500">Con abogado elegido, cada factura muestra solo sus honorarios (gastos en 0).</p>}
        </div>

        {/* ── PESTAÑAS ───────────────────────────────────────────────────── */}
        <div className="relative z-10 mb-4 -mx-1 overflow-x-auto">
          <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 w-max mx-1" role="tablist" aria-label="Secciones">
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={cn('px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all',
                  tab === t.id ? 'bg-white text-theme-text shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-theme-light border border-transparent')}>
                <t.icon className="w-4 h-4" />{t.label}
                {t.id === 'conciliacion' && !!incons && <span className="ml-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800 px-1.5">{incons}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── CONTENIDO ───────────────────────────────────────────────────── */}
        <div className="relative z-10 space-y-4">
          {loadError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex flex-wrap items-center justify-between gap-2">
              {loadError}
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => load()}><RefreshCw className="w-3.5 h-3.5" />Reintentar</Button>
            </div>
          )}
          {loading && (
            <p className="text-sm text-slate-600 flex items-center gap-2" role="status">
              <Loader2 className="w-4 h-4 animate-spin text-theme-text" />
              {preparando ? `El servidor está calculando el periodo con los pagos de Books (intento ${preparando}). Puede tardar un par de minutos; se vuelve a consultar solo…` : 'Cargando ingresos…'}
            </p>
          )}
          {data && (
            <div className={cn('space-y-4 transition-opacity', loading && 'opacity-50 pointer-events-none')} aria-busy={loading}>
              <p className="text-xs text-slate-500">Periodo de pagos: <span className="font-semibold text-slate-700">{formatFecha(data.periodo.desde)} – {formatFecha(data.periodo.hasta)}</span>
                {data.solo_honorarios ? ' · solo honorarios' : ''}</p>
              {tab === 'resumen' && <Resumen data={data} />}
              {tab === 'detalle' && <Detalle key={data.generado_en + data.periodo.desde + data.periodo.hasta} data={data} />}
              {tab === 'conciliacion' && <Conciliacion key={data.generado_en} data={data} />}
              <p className="text-[11px] text-slate-500">
                Base de efectivo: pagos del periodo repartidos en honorarios, IVA y gastos, en MXN al tipo de cambio de cada pago.
                {' '}Calculado {edadCache(data.cache?.edad_s)}{data.actualizando || data.cache?.actualizando ? ' (actualizándose en segundo plano)' : ''}.
              </p>
            </div>
          )}
        </div>
        <p className="mt-4 text-[11px] text-slate-500 relative z-10">Solo consulta: desde aquí no se escribe en Aptus ni en Books.</p>
      </Card>

      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={statusModal.type === 'error' && !organizationId ? undefined : () => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type} title={statusModal.title} message={statusModal.message}
      />
    </div>
  )
}

export default App
