import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fileApi } from '@/services/api';
import { Folder, File, ArrowLeft, RefreshCw, Trash2, Download, Upload } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';

interface FilesProps {
  serverId: string;
}

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

export default function FileManager({ serverId }: FilesProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [_uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [confirmState, setConfirmState] = useState<{open: boolean, onConfirm: () => void, title: string, message: string} | null>(null);
  const queryClient = useQueryClient();

  const { data: filesData, isLoading, error } = useQuery({
    queryKey: ['files', serverId, currentPath],
    queryFn: async () => {
      const res = await fileApi.list(serverId, currentPath || undefined);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });

  const readMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await fileApi.read(serverId, path);
      return res.data?.data;
    },
    onSuccess: (data, path) => {
      setFileContent(data?.content || data || '');
      setEditingFile(path);
    },
  });

  const writeMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => fileApi.write(serverId, path, content),
    onSuccess: () => {
      setEditingFile(null);
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => fileApi.delete(serverId, path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => fileApi.upload(serverId, file, currentPath || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] });
      setUploadingFile(null);
    },
  });

  const files: FileEntry[] = filesData || [];
  const sortedFiles = useMemo(() => [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  }), [files]);

  const navigateTo = (name: string) => {
    const newPath = currentPath ? `${currentPath}/${name}` : name;
    setCurrentPath(newPath);
  };

  const navigateUp = () => {
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // File editor view
  if (editingFile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white truncate">{editingFile}</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => writeMutation.mutate({ path: editingFile, content: fileContent })}
              disabled={writeMutation.isPending}
              className="px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded text-sm disabled:opacity-50 transition-colors"
            >
              {writeMutation.isPending ? 'Speichere...' : 'Speichern'}
            </button>
            <button
              onClick={() => setEditingFile(null)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
            >
              Schließen
            </button>
          </div>
        </div>
        <textarea
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          className="w-full h-96 bg-gray-950 border border-gray-700 rounded p-4 font-mono text-sm text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-hydash-500"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-white">Dateien</h3>
          <span className="text-sm text-gray-400 font-mono">/{currentPath || ''}</span>
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <span>Hochladen</span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
              }}
            />
          </label>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm">
        <button onClick={() => setCurrentPath('')} className="text-hydash-400 hover:text-hydash-300 transition-colors">
          Root
        </button>
        {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
          <span key={i} className="flex items-center space-x-2">
            <span className="text-gray-600">/</span>
            <button
              onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
              className="text-hydash-400 hover:text-hydash-300 transition-colors"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      {isLoading ? (
        <p className="text-gray-400 text-sm">Dateien werden geladen...</p>
      ) : error ? (
        <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
          <Folder className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">Keine Dateien verfügbar</p>
          <p className="text-gray-500 text-sm">Der Server muss mindestens einmal gestartet werden, damit Dateien erstellt werden.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
          {currentPath && (
            <button
              onClick={navigateUp}
              className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-gray-700/50 transition-colors text-left"
            >
              <ArrowLeft className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400 text-sm">..</span>
            </button>
          )}
          {sortedFiles.map((file) => (
            <div key={file.name} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-700/50 transition-colors">
              <button
                onClick={() => file.type === 'directory' ? navigateTo(file.name) : readMutation.mutate(currentPath ? `${currentPath}/${file.name}` : file.name)}
                className="flex items-center space-x-3 flex-1 min-w-0 text-left"
              >
                {file.type === 'directory' ? (
                  <Folder className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-white text-sm truncate">{file.name}</span>
                <span className="text-gray-500 text-xs flex-shrink-0">{formatSize(file.size)}</span>
              </button>
              <div className="flex items-center space-x-1 ml-2">
                {file.type === 'file' && (
                  <button
                    onClick={() => readMutation.mutate(currentPath ? `${currentPath}/${file.name}` : file.name)}
                    className="p-1 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                    title="Bearbeiten"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => { setConfirmState({open: true, onConfirm: () => deleteMutation.mutate(currentPath ? `${currentPath}/${file.name}` : file.name), title: 'Datei löschen', message: `"${file.name}" wirklich löschen?`}); }}
                  className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && !currentPath && (
            <p className="text-gray-500 text-sm text-center py-6">Ordner ist leer</p>
          )}
        </div>
      )}

      {uploadMutation.isPending && (
        <div className="bg-hydash-600/20 border border-hydash-500/30 rounded p-3 text-sm text-hydash-400">
          Datei wird hochgeladen...
        </div>
      )}

      <ConfirmModal
        open={!!confirmState}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmVariant="danger"
      />
    </div>
  );
}