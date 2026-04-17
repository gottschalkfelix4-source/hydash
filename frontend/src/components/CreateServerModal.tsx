import { useState } from 'react';
import { serverApi } from '../services/api';

interface CreateServerModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateServerModal({ onClose, onCreated }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [port, setPort] = useState(5520);
  const [memoryGb, setMemoryGb] = useState(6);
  const [viewDistance, setViewDistance] = useState(12);
  const [tags, setTags] = useState('');
  const [autostart, setAutostart] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await serverApi.create({
        name,
        port,
        memoryLimitMb: memoryGb * 1024,
        viewDistance,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        autostart,
      });
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Erstellen des Servers';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-lg w-full mx-4">
        <h2 className="text-xl font-semibold text-white mb-4">Neuen Server erstellen</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Servername</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              placeholder="Mein Hytale Server"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Port</label>
              <input
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">RAM (GB)</label>
              <input
                type="number"
                min={1}
                max={32}
                value={memoryGb}
                onChange={(e) => setMemoryGb(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Sichtweite: {viewDistance} Chunks
            </label>
            <input
              type="range"
              min={4}
              max={32}
              value={viewDistance}
              onChange={(e) => setViewDistance(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>4 (min)</span>
              <span>12 (empfohlen)</span>
              <span>32 (max)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tags <span className="text-gray-500">(kommagetrennt)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              placeholder="survival, friends, modded"
            />
          </div>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => setAutostart(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-hydash-600 focus:ring-hydash-500"
            />
            <span className="text-sm text-gray-300">Automatisch starten</span>
          </label>

          <div className="flex space-x-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Erstelle...' : 'Erstellen'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}