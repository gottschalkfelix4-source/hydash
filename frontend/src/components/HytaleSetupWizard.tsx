import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hytaleApi } from '../services/api';
import { Download, Key, Loader2, CheckCircle2, XCircle, ExternalLink, Copy, Check } from 'lucide-react';

interface SetupWizardProps {
  serverId: string;
}

type SetupStep = 'idle' | 'auth' | 'downloading' | 'done' | 'error';

export default function HytaleSetupWizard({ serverId }: SetupWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<SetupStep>('idle');
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-poll for auth while on the 'auth' step
  useEffect(() => {
    if (step === 'auth') {
      // Start polling every 5 seconds
      pollRef.current = setInterval(() => {
        pollAuthMutation.mutate();
      }, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: readyData } = useQuery({
    queryKey: ['hytale-ready', serverId],
    queryFn: async () => {
      const res = await hytaleApi.setupStatus(serverId);
      return res.data?.data;
    },
    enabled: !!serverId && step === 'idle',
  });

  const startSetupMutation = useMutation({
    mutationFn: () => hytaleApi.setupStart(serverId),
    onSuccess: (res) => {
      const data = res.data?.data;
      if (data?.step === 'complete') {
        setStep('done');
      } else if (data?.userCode) {
        setUserCode(data.userCode);
        setVerificationUrl(data.verificationUrl || 'https://oauth.accounts.hytale.com/oauth2/device/verify');
        setStep('auth');
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Fehler beim Starten des Setups';
      setErrorMessage(msg);
      setStep('error');
    },
  });

  const pollAuthMutation = useMutation({
    mutationFn: () => hytaleApi.pollAuth(serverId),
    onSuccess: (res) => {
      const data = res.data?.data;
      if (data?.authorized) {
        // Stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setStep('downloading');
        downloadMutation.mutate();
      }
    },
    onError: () => {
      // Polling errors are expected - user may not have authorized yet
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => hytaleApi.download(serverId),
    onSuccess: () => {
      // Start polling for download status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await hytaleApi.setupStatus(serverId);
          const status = statusRes.data?.data;
          if (status?.status === 'completed' || status?.status === 'done') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setStep('done');
            queryClient.invalidateQueries({ queryKey: ['server', serverId] });
          } else if (status?.status === 'error' || status?.status === 'needs_cli') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setErrorMessage(status?.message || 'Download fehlgeschlagen');
            setStep('error');
          }
        } catch {
          // Continue polling
        }
      }, 3000);
    },
    onError: (err) => {
      setErrorMessage(err instanceof Error ? err.message : 'Download fehlgeschlagen');
      setStep('error');
    },
  });

  const resetSetup = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setStep('idle');
    setUserCode(null);
    setVerificationUrl(null);
    setErrorMessage('');
  };

  const copyCode = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (readyData?.status === 'completed' || readyData?.ready) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">Hytale Server eingerichtet</h3>
        <p className="text-gray-400">Der Server ist bereit und kann gestartet werden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Hytale Server Einrichtung</h3>

      {step === 'idle' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="text-center">
            <Download className="w-12 h-12 text-hydash-400 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-2">Hytale Server herunterladen & einrichten</h4>
            <p className="text-gray-400 text-sm mb-2">
              Um einen Hytale Server zu betreiben, musst du dich mit deinem Hytale-Account authentifizieren.
              Die Serverdateien werden dann automatisch heruntergeladen.
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Du benötigst einen Hytale-Account. Es gelten die Nutzungsbedingungen von Hypixel Studios.
            </p>
            <button
              onClick={() => startSetupMutation.mutate()}
              disabled={startSetupMutation.isPending}
              className="px-6 py-2.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {startSetupMutation.isPending ? 'Starte...' : 'Einrichtung starten'}
            </button>
            {startSetupMutation.isError && (
              <p className="text-red-400 text-sm mt-3">
                {startSetupMutation.error instanceof Error ? startSetupMutation.error.message : 'Fehler beim Starten'}
              </p>
            )}
          </div>
        </div>
      )}

      {step === 'auth' && userCode && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="text-center">
            <Key className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-2">Hytale-Account verknüpfen</h4>
            <p className="text-gray-400 text-sm mb-4">
              Besuche die folgende URL und gib den Code ein, um deinen Account zu verknüpfen.
            </p>
            {verificationUrl && (
              <a
                href={verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-hydash-400 hover:text-hydash-300 text-sm font-mono mb-4"
              >
                <span>{verificationUrl}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <div className="bg-gray-950 rounded-lg py-4 px-6 mb-4 relative">
              <p className="text-xs text-gray-500 mb-1">Dein Code</p>
              <p className="text-2xl font-mono font-bold text-white tracking-widest">{userCode}</p>
              <button
                onClick={copyCode}
                className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
                title="Code kopieren"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-gray-500 text-xs mb-2">
              Der Code ist 10 Minuten gültig.
            </p>
            <p className="text-hydash-400/70 text-xs mb-4">
              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
              Automatische Prüfung aktiv...
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => pollAuthMutation.mutate()}
                disabled={pollAuthMutation.isPending}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                Jetzt prüfen
              </button>
              <button
                onClick={resetSetup}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'downloading' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-hydash-400 mx-auto mb-4 animate-spin" />
            <h4 className="text-white font-medium mb-2">Serverdateien werden heruntergeladen...</h4>
            <p className="text-gray-400 text-sm">
              Dies kann einige Minuten dauern, je nach Internetverbindung.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Du kannst diese Seite verlassen. Der Download läuft im Hintergrund weiter.
            </p>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="bg-gray-800 rounded-lg border border-green-500/30 p-6">
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-2">Einrichtung abgeschlossen!</h4>
            <p className="text-gray-400 text-sm mb-4">
              Der Hytale-Server wurde erfolgreich heruntergeladen und konfiguriert.
              Du kannst ihn jetzt starten.
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['server', serverId] })}
              className="px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors"
            >
              Aktualisieren
            </button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="bg-gray-800 rounded-lg border border-red-500/30 p-6">
          <div className="text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-2">Fehler bei der Einrichtung</h4>
            <p className="text-red-400 text-sm mb-4 whitespace-pre-line">{errorMessage}</p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={resetSetup}
                className="px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors"
              >
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}