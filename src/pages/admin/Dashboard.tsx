import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FiUsers,
  FiUserPlus,
  FiActivity,
  FiBarChart2,
  FiAlertCircle,
  FiZap,
  FiRefreshCw,
} from 'react-icons/fi'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useAdminStats } from '@/hooks/useAdmin'
import { useTheme } from '@/hooks/useTheme'

const COLORS = ['#0D9488', '#14B8A6', '#0F766E', '#5EEAD4', '#99F6E4']

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  trend?: string
  color: string
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-shadow dark:text-foreground-dark">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
          {trend && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{trend}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { data, loading, error, refetch } = useAdminStats()
  const [refreshKey, setRefreshKey] = useState(0)
  const isDark = resolvedTheme === 'dark'

  const chartData = useMemo(() => {
    if (!data?.dailyUserStats) return []
    return data.dailyUserStats.map((item) => ({
      date: item.date.slice(5),
      users: item.count,
    }))
  }, [data])

  const pieData = useMemo(() => {
    if (!data?.usageStats) return []
    return data.usageStats.map((item) => ({
      name: item.action,
      value: item.count,
    }))
  }, [data])

  const actionNameMap: Record<string, string> = {
    analyze: t('dashboard.actions.analyze'),
    chat: t('dashboard.actions.chat'),
    plan: t('dashboard.actions.plan'),
    quiz: t('dashboard.actions.quiz'),
  }

  const requestTrendData = useMemo(() => {
    if (!data?.requestTrend) return []
    return data.requestTrend.map((item) => ({
      hour: item.hour.slice(5),
      count: item.count,
      avgLatency: item.avgLatency,
    }))
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-red-600 dark:text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div key={refreshKey} className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('admin.dashboard')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('admin.dashboardSubtitle')}</p>
        </div>
        <button
          onClick={() => { setRefreshKey((k) => k + 1); refetch() }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('dashboard.refresh', '刷新')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title={t('admin.users')}
          value={data?.totalUsers ?? 0}
          icon={FiUsers}
          trend={`+${data?.todayNewUsers ?? 0} ${t('dashboard.today')}`}
          color="#0D9488"
        />
        <StatCard
          title={t('dashboard.today')}
          value={data?.todayNewUsers ?? 0}
          icon={FiUserPlus}
          trend={t('dashboard.activeGrowth')}
          color="#3B82F6"
        />
        <StatCard
          title={t('dashboard.totalCalls')}
          value={data?.totalLogs ?? 0}
          icon={FiActivity}
          trend={`${data?.todayLogs ?? 0} ${t('dashboard.today')}`}
          color="#F59E0B"
        />
        <StatCard
          title={t('dashboard.activity')}
          value={data?.totalLogs && data.totalUsers ? Math.round(data.totalLogs / data.totalUsers) : 0}
          icon={FiBarChart2}
          trend={t('dashboard.perUser')}
          color="#10B981"
        />
        <StatCard
          title={t('dashboard.totalRequests')}
          value={data?.metricsOverview?.totalRequests ?? 0}
          icon={FiZap}
          trend={t('dashboard.last24Hours')}
          color="#6366F1"
        />
        <StatCard
          title={t('dashboard.errorRate')}
          value={`${data?.metricsOverview?.errorRate ?? 0}%`}
          icon={FiAlertCircle}
          trend={t('dashboard.last24Hours')}
          color={(data?.metricsOverview?.errorRate ?? 0) > 5 ? '#EF4444' : '#10B981'}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User trend chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('dashboard.userGrowth')}</h3>
          <div className="h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#E2E8F0'} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B' }} stroke={isDark ? '#475569' : '#CBD5E1'} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B' }} stroke={isDark ? '#475569' : '#CBD5E1'} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: isDark ? '1px solid #475569' : '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      color: isDark ? '#F1F5F9' : '#1E293B',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="users"
                    stroke="#0D9488"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUsers)"
                    name={t('dashboard.userGrowth')}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                {t('dashboard.noData', '暂无数据')}
              </div>
            )}
          </div>
        </div>

        {/* Usage distribution pie chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('dashboard.usage')}</h3>
          <div className="h-72">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    stroke={isDark ? '#1E293B' : '#FFFFFF'}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={isDark ? '#1E293B' : '#FFFFFF'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      value as number,
                      actionNameMap[name as string] || (name as string),
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: isDark ? '1px solid #475569' : '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      color: isDark ? '#F1F5F9' : '#1E293B',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                {t('dashboard.noData', '暂无数据')}
              </div>
            )}
          </div>
          {pieData.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {actionNameMap[entry.name] || entry.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Request Trend & Error Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('dashboard.requestCount')}</h3>
          <div className="h-72">
            {requestTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={requestTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#E2E8F0'} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} stroke={isDark ? '#475569' : '#CBD5E1'} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B' }} stroke={isDark ? '#475569' : '#CBD5E1'} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: isDark ? '1px solid #475569' : '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      color: isDark ? '#F1F5F9' : '#1E293B',
                    }}
                  />
                  <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} name={t('dashboard.requestCount')} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                {t('dashboard.noData', '暂无数据')}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('dashboard.latency')}</h3>
          <div className="h-72">
            {requestTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={requestTrendData}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#E2E8F0'} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }} stroke={isDark ? '#475569' : '#CBD5E1'} />
                  <YAxis tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B' }} stroke={isDark ? '#475569' : '#CBD5E1'} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: isDark ? '1px solid #475569' : '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      color: isDark ? '#F1F5F9' : '#1E293B',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgLatency"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorLatency)"
                    name={t('dashboard.avgLatencyMs')}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                {t('dashboard.noData', '暂无数据')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
