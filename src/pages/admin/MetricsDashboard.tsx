/**
 * 管理后台 - 性能监控仪表盘
 * 展示请求量趋势、延迟分布、错误率等图表
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { fetchWithTimeout } from '@/api/client'

const API_BASE = '/api/admin/metrics'
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface Overview {
  totalRequests: number
  avgLatency: number
  maxLatency: number
  minLatency: number
  errorRate: number
}

interface TrendItem {
  hour: string
  count: number
  avgLatency: number
}

interface PathStat {
  path: string
  count: number
  avgLatency: number
  errorCount: number
}

interface StatusDist {
  statusCode: number
  count: number
}

interface ErrorItem {
  id: string
  path: string
  method: string
  statusCode: number
  latencyMs: number
  createdAt: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { data: T }
  return json.data
}

export default function MetricsDashboard() {
  const { t } = useTranslation()
  const [hours, setHours] = useState(24)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [trend, setTrend] = useState<TrendItem[]>([])
  const [paths, setPaths] = useState<PathStat[]>([])
  const [statusDist, setStatusDist] = useState<StatusDist[]>([])
  const [errors, setErrors] = useState<ErrorItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, tr, pa, st, er] = await Promise.all([
        fetchJson<Overview>(`${API_BASE}/overview?hours=${hours}`),
        fetchJson<TrendItem[]>(`${API_BASE}/trend?hours=${hours}`),
        fetchJson<PathStat[]>(`${API_BASE}/paths?hours=${hours}`),
        fetchJson<StatusDist[]>(`${API_BASE}/status-codes?hours=${hours}`),
        fetchJson<ErrorItem[]>(`${API_BASE}/errors?limit=50`),
      ])
      setOverview(ov)
      setTrend(tr)
      setPaths(pa)
      setStatusDist(st)
      setErrors(er)
    } catch {
      // 静默处理加载错误
    } finally {
      setLoading(false)
    }
  }, [hours])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const statusPieData = statusDist.map((d) => ({
    name: `${d.statusCode}`,
    value: d.count,
  }))

  if (loading && !overview) {
    return <div className="flex items-center justify-center h-64 text-gray-500">{t('common.loading')}</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{t('admin.metrics')}</h2>
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="px-3 py-1 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600"
        >
          <option value={1}>{t('metrics.last1Hour', '最近 1 小时')}</option>
          <option value={6}>{t('metrics.last6Hours', '最近 6 小时')}</option>
          <option value={24}>{t('metrics.last24Hours', '最近 24 小时')}</option>
          <option value={168}>{t('metrics.last7Days', '最近 7 天')}</option>
        </select>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard label={t('metrics.totalRequests', '总请求数')} value={overview.totalRequests.toLocaleString()} color="blue" />
          <MetricCard label={t('metrics.avgLatency', '平均延迟')} value={`${overview.avgLatency}ms`} color="green" />
          <MetricCard label={t('metrics.maxLatency', '最大延迟')} value={`${overview.maxLatency}ms`} color="yellow" />
          <MetricCard label={t('metrics.minLatency', '最小延迟')} value={`${overview.minLatency}ms`} color="purple" />
          <MetricCard label={t('metrics.errorRate', '错误率')} value={`${overview.errorRate}%`} color={overview.errorRate > 5 ? 'red' : 'green'} />
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
        <h3 className="text-lg font-semibold mb-4 dark:text-gray-200">{t('metrics.requestTrend', '请求量趋势')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="count" stroke="#3b82f6" name={t('metrics.requestCount', '请求数')} strokeWidth={2} />
            <Line yAxisId="right" type="monotone" dataKey="avgLatency" stroke="#f59e0b" name={t('metrics.avgLatencyMs', '平均延迟(ms)')} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
          <h3 className="text-lg font-semibold mb-4 dark:text-gray-200">{t('metrics.topPaths', '热门路径 Top 10')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={paths.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="path" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" name={t('metrics.requestCount', '请求数')} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
          <h3 className="text-lg font-semibold mb-4 dark:text-gray-200">{t('metrics.statusDist', '状态码分布')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusPieData} cx="50%" cy="50%" outerRadius={100} dataKey="value"
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
                {statusPieData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
        <h3 className="text-lg font-semibold mb-4 dark:text-gray-200">{t('metrics.latencyDetail', '接口延迟详情')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t('metrics.path', '路径')}</th>
                <th className="py-2">{t('metrics.requestCount', '请求数')}</th>
                <th className="py-2">{t('metrics.avgLatency', '平均延迟')}</th>
                <th className="py-2">{t('metrics.errorCount', '错误数')}</th>
              </tr>
            </thead>
            <tbody>
              {paths.map((p) => (
                <tr key={p.path} className="border-b hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="py-2 font-mono text-xs">{p.path}</td>
                  <td className="py-2">{p.count}</td>
                  <td className="py-2"><span className={p.avgLatency > 500 ? 'text-red-500' : 'text-green-600'}>{p.avgLatency}ms</span></td>
                  <td className="py-2">{p.errorCount > 0 ? <span className="text-red-500">{p.errorCount}</span> : <span className="text-green-500">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
        <h3 className="text-lg font-semibold mb-4 dark:text-gray-200">{t('metrics.recentErrors', '最近错误日志')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t('metrics.time', '时间')}</th>
                <th className="py-2">{t('metrics.method', '方法')}</th>
                <th className="py-2">{t('metrics.path', '路径')}</th>
                <th className="py-2">{t('metrics.statusCode', '状态码')}</th>
                <th className="py-2">{t('metrics.latency', '延迟')}</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, 20).map((e) => (
                <tr key={e.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="py-2 text-xs">{new Date(e.createdAt * 1000).toLocaleString()}</td>
                  <td className="py-2"><span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-600 rounded text-xs font-mono">{e.method}</span></td>
                  <td className="py-2 font-mono text-xs">{e.path}</td>
                  <td className="py-2"><span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">{e.statusCode}</span></td>
                  <td className="py-2 text-xs">{e.latencyMs}ms</td>
                </tr>
              ))}
              {errors.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-gray-400">{t('metrics.noErrors', '暂无错误记录')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
  }
  return (
    <div className={`rounded-xl p-4 ${colorMap[color] || colorMap.blue}`}>
      <div className="text-sm opacity-75">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}
