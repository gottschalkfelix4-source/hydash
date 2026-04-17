import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modApi } from '../services/api';
import {
  Search, Download, Trash2, RefreshCw, Package, Loader2,
  ArrowLeft, Check, ExternalLink, Tag, User, Calendar
} from 'lucide-react';

interface ModProps {
  serverId: string;
}

interface CurseForgeMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  isFeatured?: boolean;
  categories?: { name: string; iconUrl?: string; slug?: string }[];
  authors?: { name: string; url?: string }[];
  logo?: { thumbnailUrl?: string; title?: string; url?: string };
  dateModified?: string;
  dateCreated?: string;
  dateReleased?: string;
  latestFiles?: CurseForgeFile[];
}

interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: number;
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  downloadUrl: string;
  gameVersions: string[];
}

type InstallState = 'idle' | 'downloading' | 'installing' | 'success' | 'error';

export default function ModsManager({ serverId }: ModProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMod, setSelectedMod] = useState<CurseForgeMod | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [installStates, setInstallStates] = useState<Record<number, InstallState>>({});
  const queryClient = useQueryClient();

  const { data: installedData, isLoading: installedLoading } = useQuery({
    queryKey: ['mods', serverId],
    queryFn: async () => {
      const res = await modApi.installed(serverId);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });

  const { data: featuredData, isLoading: featuredLoading, error: featuredError } = useQuery({
    queryKey: ['mods-featured', serverId],
    queryFn: async () => {
      const res = await modApi.featured(serverId);
      return res.data?.data || [];
    },
    enabled: !!serverId && searchQuery.length < 2,
  });

  const { data: searchData } = useQuery({
    queryKey: ['mod-search', serverId, searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const res = await modApi.search(serverId, searchQuery);
      return res.data?.data?.mods || res.data?.data || [];
    },
    enabled: !!serverId && searchQuery.length >= 2,
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['mod-files', serverId, selectedMod?.id],
    queryFn: async () => {
      if (!selectedMod) return null;
      const res = await modApi.files(serverId, selectedMod.id);
      return res.data?.data || null;
    },
    enabled: !!selectedMod,
  });

  const installMutation = useMutation({
    mutationFn: async (data: { curseforgeId: number; fileId?: number }) => {
      setInstallStates(prev => ({ ...prev, [data.curseforgeId]: 'downloading' }));
      try {
        const result = await modApi.install(serverId, data);
        setInstallStates(prev => ({ ...prev, [data.curseforgeId]: 'installing' }));
        // Small delay to show "installing" state
        await new Promise(r => setTimeout(r, 800));
        setInstallStates(prev => ({ ...prev, [data.curseforgeId]: 'success' }));
        // Reset success state after 3 seconds
        setTimeout(() => {
          setInstallStates(prev => ({ ...prev, [data.curseforgeId]: 'idle' }));
        }, 3000);
        return result;
      } catch (err) {
        setInstallStates(prev => ({ ...prev, [data.curseforgeId]: 'error' }));
        setTimeout(() => {
          setInstallStates(prev => ({ ...prev, [data.curseforgeId]: 'idle' }));
        }, 3000);
        throw err;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mods', serverId] }),
  });

  const uninstallMutation = useMutation({
    mutationFn: (modId: string) => modApi.uninstall(serverId, modId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mods', serverId] }),
  });

  const updateMutation = useMutation({
    mutationFn: (modId: string) => modApi.update(serverId, modId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mods', serverId] }),
  });

  const installedMods = installedData || [];
  const searchResults = searchData || [];
  const featuredMods = (featuredData || []) as CurseForgeMod[];
  const isSearching = searchQuery.length >= 2;
  const modFiles: CurseForgeFile[] = filesData?.files || [];

  const formatDownloads = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const releaseTypeLabel = (type: number) => {
    switch (type) {
      case 1: return { label: 'Release', color: 'bg-green-500/20 text-green-400' };
      case 2: return { label: 'Beta', color: 'bg-yellow-500/20 text-yellow-400' };
      case 3: return { label: 'Alpha', color: 'bg-red-500/20 text-red-400' };
      default: return { label: 'Unbekannt', color: 'bg-gray-500/20 text-gray-400' };
    }
  };

  const handleInstall = (mod: CurseForgeMod, fileId?: number) => {
    installMutation.mutate({ curseforgeId: mod.id, fileId: fileId || undefined });
  };

  const getInstallButton = (mod: CurseForgeMod, size: 'sm' | 'lg' = 'sm') => {
    const state = installStates[mod.id] || 'idle';
    const isInstalled = installedMods.some(
      (m: { curseforgeId: number | null }) => m.curseforgeId === mod.id
    );

    if (isInstalled && state === 'idle') {
      return null;
    }

    const baseClass = size === 'lg'
      ? 'flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50'
      : 'flex-shrink-0 p-2 rounded-lg transition-colors disabled:opacity-50';

    switch (state) {
      case 'downloading':
        return (
          <button disabled className={`${baseClass} bg-blue-600/50 text-blue-300`}>
            <Loader2 className={`${size === 'lg' ? 'w-4 h-4' : 'w-4 h-4'} animate-spin`} />
            {size === 'lg' && <span>Wird heruntergeladen...</span>}
          </button>
        );
      case 'installing':
        return (
          <button disabled className={`${baseClass} bg-yellow-600/50 text-yellow-300`}>
            <Loader2 className={`${size === 'lg' ? 'w-4 h-4' : 'w-4 h-4'} animate-spin`} />
            {size === 'lg' && <span>Wird installiert...</span>}
          </button>
        );
      case 'success':
        return (
          <button disabled className={`${baseClass} bg-green-600/50 text-green-300`}>
            <Check className={size === 'lg' ? 'w-4 h-4' : 'w-4 h-4'} />
            {size === 'lg' && <span>Installiert!</span>}
          </button>
        );
      case 'error':
        return (
          <button
            onClick={() => handleInstall(mod)}
            className={`${baseClass} bg-red-600 hover:bg-red-700 text-white`}
          >
            <span className={size === 'sm' ? 'sr-only' : ''}>Fehler — Erneut versuchen</span>
            {size === 'sm' && <Download className="w-4 h-4" />}
          </button>
        );
      default:
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleInstall(mod);
            }}
            className={`${baseClass} bg-hydash-600 hover:bg-hydash-700 text-white`}
            title="Installieren"
          >
            <Download className={size === 'lg' ? 'w-4 h-4' : 'w-4 h-4'} />
            {size === 'lg' && <span>Installieren</span>}
          </button>
        );
    }
  };

  // ========== Mod Detail Panel ==========
  const renderModDetail = () => {
    if (!selectedMod) return null;

    const isInstalled = installedMods.some(
      (m: { curseforgeId: number | null }) => m.curseforgeId === selectedMod.id
    );

    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => { setSelectedMod(null); setSelectedFileId(null); }}
          className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Zurück zur Übersicht</span>
        </button>

        {/* Mod header */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-start gap-4">
            {selectedMod.logo?.thumbnailUrl ? (
              <img
                src={selectedMod.logo.thumbnailUrl}
                alt={selectedMod.name}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                <Package className="w-8 h-8 text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white">{selectedMod.name}</h2>
              <p className="text-gray-400 text-sm mt-1">{selectedMod.summary}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  {formatDownloads(selectedMod.downloadCount || 0)} Downloads
                </span>
                {selectedMod.authors?.[0]?.name && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    von {selectedMod.authors[0].name}
                  </span>
                )}
                {selectedMod.dateModified && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Aktualisiert: {formatDate(selectedMod.dateModified)}
                  </span>
                )}
              </div>
              {selectedMod.categories && selectedMod.categories.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {selectedMod.categories.map((cat, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                      <Tag className="w-2.5 h-2.5" />
                      {cat.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Version selection */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Version auswählen</h3>

          {filesLoading ? (
            <div className="flex items-center justify-center py-4 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Versionen werden geladen...</span>
            </div>
          ) : modFiles.length > 0 ? (
            <div className="space-y-3">
              <select
                value={selectedFileId || ''}
                onChange={(e) => setSelectedFileId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
              >
                <option value="">Neueste Version (automatisch)</option>
                {modFiles.map((file) => {
                  const rt = releaseTypeLabel(file.releaseType);
                  return (
                    <option key={file.id} value={file.id}>
                      {file.displayName} [{rt.label}] — {formatFileSize(file.fileLength)} — {formatDate(file.fileDate)}
                    </option>
                  );
                })}
              </select>

              {/* Selected file details */}
              {(() => {
                const file = selectedFileId
                  ? modFiles.find(f => f.id === selectedFileId)
                  : modFiles.find(f => f.releaseType === 1) || modFiles[0];

                if (!file) return null;

                const rt = releaseTypeLabel(file.releaseType);

                return (
                  <div className="bg-gray-750 rounded-lg border border-gray-600 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-sm font-medium">{file.displayName}</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${rt.color}`}>
                        {rt.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                      <span>Dateiname: <span className="text-gray-300 font-mono">{file.fileName}</span></span>
                      <span>Größe: <span className="text-gray-300">{formatFileSize(file.fileLength)}</span></span>
                      <span>Datum: <span className="text-gray-300">{formatDate(file.fileDate)}</span></span>
                      <span>Downloads: <span className="text-gray-300">{formatDownloads(file.downloadCount)}</span></span>
                    </div>
                    {file.gameVersions && file.gameVersions.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <span className="text-xs text-gray-500">Game-Versionen:</span>
                        {file.gameVersions.map((v, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Install button */}
              <div className="flex items-center gap-3">
                {isInstalled ? (
                  <div className="flex items-center space-x-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-lg text-sm">
                    <Check className="w-4 h-4" />
                    <span>Bereits installiert</span>
                  </div>
                ) : (
                  getInstallButton(selectedMod, 'lg')
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Keine Versionen verfügbar</p>
          )}
        </div>

        {/* External link */}
        <a
          href={`https://www.curseforge.com/hytale/mods/${selectedMod.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 text-gray-400 hover:text-hydash-400 text-sm transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Auf CurseForge ansehen</span>
        </a>
      </div>
    );
  };

  // ========== Mod Card ==========
  const renderModCard = (mod: CurseForgeMod) => {
    const isInstalled = installedMods.some(
      (m: { curseforgeId: number | null }) => m.curseforgeId === mod.id
    );

    return (
      <div
        key={mod.id}
        onClick={() => setSelectedMod(mod)}
        className="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-start gap-3 hover:border-gray-600 transition-colors cursor-pointer group"
      >
        {mod.logo?.thumbnailUrl ? (
          <img
            src={mod.logo.thumbnailUrl}
            alt={mod.name}
            className="w-10 h-10 rounded object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-gray-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium truncate group-hover:text-hydash-400 transition-colors">
              {mod.name}
            </p>
            {isInstalled && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400 flex-shrink-0">
                Installiert
              </span>
            )}
          </div>
          {mod.summary && (
            <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{mod.summary}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              {formatDownloads(mod.downloadCount || 0)}
            </span>
            {mod.categories?.[0]?.name && (
              <span>{mod.categories[0].name}</span>
            )}
            {mod.authors?.[0]?.name && (
              <span>von {mod.authors[0].name}</span>
            )}
          </div>
        </div>
        {!isInstalled && getInstallButton(mod, 'sm')}
      </div>
    );
  };

  // ========== Main Render ==========
  // Show detail panel when a mod is selected
  if (selectedMod) {
    return (
      <div className="space-y-6">
        {renderModDetail()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Installed Mods */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Installierte Mods</h3>
        {installedLoading ? (
          <p className="text-gray-400 text-sm">Mods werden geladen...</p>
        ) : installedMods.length === 0 ? (
          <p className="text-gray-500 text-sm">Keine Mods installiert</p>
        ) : (
          <div className="space-y-2">
            {installedMods.map((mod: { id: string; fileName: string; fileType: string; active: boolean; fileVersion: string | null; curseforgeId: number | null }) => (
              <div key={mod.id} className="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Package className="w-4 h-4 text-hydash-400" />
                  <div>
                    <p className="text-white text-sm font-medium">{mod.fileName}</p>
                    <p className="text-gray-400 text-xs">{mod.fileVersion || '-'} | {mod.fileType} | {mod.active ? 'Aktiv' : 'Inaktiv'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {mod.curseforgeId && (
                    <button
                      onClick={() => {
                        // Find and select the mod from featured/search results
                        const found = featuredMods.find(m => m.id === mod.curseforgeId);
                        if (found) {
                          setSelectedMod(found);
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      title="Details anzeigen"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => updateMutation.mutate(mod.id)}
                    disabled={updateMutation.isPending}
                    className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                    title="Update"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => uninstallMutation.mutate(mod.id)}
                    disabled={uninstallMutation.isPending}
                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                    title="Deinstallieren"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search / Browse */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">
          {isSearching ? 'Suchergebnisse' : 'Beliebte Mods'}
        </h3>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Mod suchen..."
            className="w-full px-3 py-2 pl-9 bg-gray-800 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Featured / Popular Mods (shown when not searching) */}
        {!isSearching && (
          <div className="mt-3">
            {featuredLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Beliebte Mods werden geladen...</span>
              </div>
            ) : featuredError ? (
              <div className="text-center py-6">
                <p className="text-yellow-400 text-sm">CurseForge API-Key nicht konfiguriert</p>
                <p className="text-gray-500 text-xs mt-1">
                  Hinterlege den API-Key in den Einstellungen, um Mods zu durchsuchen.
                </p>
              </div>
            ) : featuredMods.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Keine beliebten Mods verfügbar</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {featuredMods.map(renderModCard)}
              </div>
            )}
          </div>
        )}

        {/* Search Results (shown when searching) */}
        {isSearching && (
          <div className="mt-3">
            {searchResults.length > 0 ? (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {searchResults.slice(0, 20).map((mod: CurseForgeMod) => renderModCard(mod))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">Keine Mods gefunden</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}