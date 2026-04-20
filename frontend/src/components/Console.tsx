import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';

let logIdCounter = 0;

interface ConsoleLog {
  id: number;
  level: string;
  message: string;
  timestamp: string;
}

interface ConsoleProps {
  serverId: string;
  serverStatus: string;
}

export default function Console({ serverId, serverStatus }: ConsoleProps) {
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { accessToken } = useAuthStore();

  const connectWebSocket = useCallback(() => {
    if (serverStatus !== 'running') return;

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/console?serverId=${serverId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: accessToken }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'auth_ok') {
          setConnected(true);
          reconnectAttemptRef.current = 0;
          setReconnectAttempt(0);
          return;
        }
        if (data.type === 'auth_error') {
          setConnected(false);
          return;
        }
        if (data.type === 'log' || data.type === 'status') {
          setLogs(prev => [...prev.slice(-499), {
            id: ++logIdCounter,
            level: data.level || 'INFO',
            message: data.data || data.message || '',
            timestamp: data.timestamp || new Date().toISOString(),
          }]);
        }
      } catch {
        setLogs(prev => [...prev.slice(-499), {
          id: ++logIdCounter,
          level: 'INFO',
          message: event.data,
          timestamp: new Date().toISOString(),
        }]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
      reconnectAttemptRef.current += 1;
      setReconnectAttempt(reconnectAttemptRef.current);
      reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, [serverId, serverStatus, accessToken]);

  useEffect(() => {
    if (serverStatus !== 'running') return;

    connectWebSocket();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [serverId, serverStatus, accessToken, connectWebSocket]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const sendCommand = useCallback(() => {
    const cmd = command.trim();
    if (!cmd || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ type: 'command', command: cmd }));
    setLogs(prev => [...prev, { id: ++logIdCounter, level: 'INPUT', message: `> ${cmd}`, timestamp: new Date().toISOString() }]);
    setCommand('');
  }, [command]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand();
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': case 'FATAL': return 'text-red-400';
      case 'WARN': case 'WARNING': return 'text-yellow-400';
      case 'INPUT': return 'text-cyan-400';
      default: return 'text-gray-300';
    }
  };

  if (serverStatus !== 'running') {
    return (
      <div className="bg-gray-950 rounded-lg border border-gray-700 p-6 text-center">
        <p className="text-gray-400">Server muss gestartet sein, um die Konsole zu nutzen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Konsole</h3>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {connected ? 'Verbunden' : reconnectAttempt > 0 ? `Verbindung... (${reconnectAttempt})` : 'Getrennt'}
          </span>
        </div>
      </div>

      <div className="bg-gray-950 rounded-lg border border-gray-700 p-4 h-96 overflow-y-auto font-mono text-sm">
        {logs.length === 0 ? (
          <p className="text-gray-500">Warte auf Server-Ausgabe...</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`${getLevelColor(log.level)} whitespace-pre-wrap`}>
              <span className="text-gray-600 mr-2">{new Date(log.timestamp).toLocaleTimeString('de-DE')}</span>
              {log.message}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      <div className="flex">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Befehl eingeben..."
          disabled={!connected}
          className="flex-1 bg-gray-800 border border-gray-600 rounded-l px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-hydash-500 disabled:opacity-50"
        />
        <button
          onClick={sendCommand}
          disabled={!connected || !command.trim()}
          className="px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-r text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Senden
        </button>
      </div>
    </div>
  );
}