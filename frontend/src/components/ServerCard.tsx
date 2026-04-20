import { Link } from 'react-router-dom';
import { Play, Square, RotateCw, Cpu, MemoryStick, Users, Trash2 } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import type { Server } from '@/types';

interface ServerCardProps {
  server: Server;
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onRestart?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function ServerCard({ server, onStart, onStop, onRestart, onDelete }: ServerCardProps) {
  const isRunning = server.status === 'running';
  const isStarting = server.status === 'starting';
  const isStopping = server.status === 'stopping';
  const isLoading = isStarting || isStopping;

  return (
    <Link
      to={`/servers/${server.id}`}
      className="block bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white truncate">{server.name}</h3>
          <StatusBadge status={server.status} size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
          <div className="flex items-center space-x-1 text-gray-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>{server.memoryLimitMb / 1024} GB</span>
          </div>
          <div className="flex items-center space-x-1 text-gray-400">
            <MemoryStick className="w-3.5 h-3.5" />
            <span>Port {server.port}</span>
          </div>
          <div className="flex items-center space-x-1 text-gray-400">
            <Users className="w-3.5 h-3.5" />
            <span>VD: {server.viewDistance}</span>
          </div>
        </div>

        {server.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {server.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2" onClick={(e) => e.preventDefault()}>
          {!isRunning && !isLoading && (
            <button
              onClick={() => onStart?.(server.id)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start</span>
            </button>
          )}
          {isRunning && !isLoading && (
            <button
              onClick={() => onStop?.(server.id)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop</span>
            </button>
          )}
          {isRunning && !isLoading && (
            <button
              onClick={() => onRestart?.(server.id)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>
          )}
          {isLoading && (
            <span className="text-sm text-gray-400">Wird geladen...</span>
          )}
          <button
            onClick={() => onDelete?.(server.id)}
            className="ml-auto p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Link>
  );
}