import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, MemoryStick, Wifi, FileText } from 'lucide-react';

interface MonitoringProps {
  serverId: string;
}

interface MetricPoint {
  timestamp: string;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export default function MonitoringCharts({ serverId }: MonitoringProps) {
  const [hours, setHours] = useState(1);
  const [tab, setTab] = useState<'charts' | 'logs'>('charts');

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['metrics-history', serverId, hours],
    queryFn: async () => {
      const res = await monitoringApi.history(serverId, hours);
      return res.data?.data || [];
    },
    enabled: !!serverId,
    refetchInterval: 30000,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['server-logs', serverId],
    queryFn: async () => {
      const res = await monitoringApi.logs(serverId, 200);
      return res.data?.data || [];
    },
    enabled: !!serverId && tab === 'logs',
    refetchInterval: 10000,
  });

  const metrics: MetricPoint[] = historyData || [];
  const logs: LogEntry[] = logsData || [];

  const chartData = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    cpu: Number(m.cpuPercent?.toFixed(1) || 0),
    memory: Number((m.memoryUsedMb || 0).toFixed(0)),
    memoryLimit: Number((m.memoryLimitMb || 0).toFixed(0)),
    rx: Number(((m.networkRxBytes || 0) / 1024 / 1024).toFixed(2)),
    tx: Number(((m.networkTxBytes || 0) / 1024 / 1024).toFixed(2)),
  }));

  const getLevelColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'ERROR': case 'FATAL': return 'text-red-400';
      case 'WARN': case 'WARNING': return 'text-yellow-400';
      case 'INFO': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Monitoring</h3>
        <div className="flex items-center space-x-2">
          <div className="flex bg-gray-800 rounded border border-gray-700">
            <button
              onClick={() => setTab('charts')}
              className={`px-3 py-1 text-sm rounded-l transition-colors ${tab === 'charts' ? 'bg-hydash-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Charts
            </button>
            <button
              onClick={() => setTab('logs')}
              className={`px-3 py-1 text-sm rounded-r transition-colors ${tab === 'logs' ? 'bg-hydash-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Logs
            </button>
          </div>
          {tab === 'charts' && (
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300"
            >
              <option value={1}>1 Stunde</option>
              <option value={6}>6 Stunden</option>
              <option value={24}>24 Stunden</option>
              <option value={72}>3 Tage</option>
            </select>
          )}
        </div>
      </div>

      {tab === 'charts' && (
        historyLoading ? (
          <p className="text-gray-400 text-sm">Metriken werden geladen...</p>
        ) : chartData.length === 0 ? (
          <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
            <Activity className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Keine Metrik-Daten verfügbar</p>
            <p className="text-gray-500 text-sm mt-1">Daten werden gesammelt, wenn der Server läuft</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* CPU Chart */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Activity className="w-4 h-4 text-blue-400" />
                <h4 className="text-sm font-medium text-gray-300">CPU-Auslastung</h4>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#3b82f6' }}
                  />
                  <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Memory Chart */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <MemoryStick className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-medium text-gray-300">Speicherverbrauch</h4>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} unit=" MB" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Area type="monotone" dataKey="memory" stroke="#a855f7" fill="url(#memGradient)" strokeWidth={2} name="Verwendet (MB)" />
                  <Line type="monotone" dataKey="memoryLimit" stroke="#6b7280" strokeDasharray="5 5" strokeWidth={1} dot={false} name="Limit (MB)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Network Chart */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Wifi className="w-4 h-4 text-green-400" />
                <h4 className="text-sm font-medium text-gray-300">Netzwerkverkehr</h4>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} unit=" MB" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Line type="monotone" dataKey="rx" stroke="#22c55e" strokeWidth={2} dot={false} name="Empfangen (MB)" />
                  <Line type="monotone" dataKey="tx" stroke="#06b6d4" strokeWidth={2} dot={false} name="Gesendet (MB)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      )}

      {tab === 'logs' && (
        logsLoading ? (
          <p className="text-gray-400 text-sm">Logs werden geladen...</p>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
            <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Keine Logs verfügbar</p>
          </div>
        ) : (
          <div className="bg-gray-950 rounded-lg border border-gray-700 p-4 h-[500px] overflow-y-auto font-mono text-sm">
            {logs.map((log, i) => (
              <div key={i} className={`${getLevelColor(log.level)} whitespace-pre-wrap`}>
                <span className="text-gray-600 mr-2">
                  {new Date(log.timestamp).toLocaleTimeString('de-DE')}
                </span>
                <span className="text-gray-500 mr-2">[{log.level}]</span>
                {log.message}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}