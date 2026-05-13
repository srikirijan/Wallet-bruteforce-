import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Play, Square, Activity, Database, Trash2, Plus, Download, Key, Search, Copy, CheckCircle2 } from 'lucide-react';
import { Storage } from './lib/storage';

const DEFAULT_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com'
];

export default function App() {
  const [rpcs, setRpcs] = useState<string[]>(DEFAULT_RPCS);
  const [newRpc, setNewRpc] = useState('https://rpc.ankr.com/solana_devnet/f3e259180317da53a5c632c93bc65741fe20493047543da9dccb2add3abd7095');
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  const [checked, setChecked] = useState(0); 
  const [found, setFound] = useState<any[]>([]);
  const [totalValue, setTotalValue] = useState(0); 
  const [timeElapsed, setTimeElapsed] = useState(0); 
  const [rpcStatus, setRpcStatus] = useState<Record<string, { status: 'checking' | 'connected' | 'error', latency?: number }>>({});
  const [isAddingRpc, setIsAddingRpc] = useState(false);
  const [scanIntensity, setScanIntensity] = useState(10); // Default to 10 requests per connected node
  const [activeTab, setActiveTab] = useState<'scanner' | 'network'>('scanner');
  const [networkLogs, setNetworkLogs] = useState<{uid: string, msg: string, time: number}[]>([]);
  const logQueueRef = useRef<{msg: string}[]>([]);
  const wakeLockRef = useRef<any>(null);

  const isInitialLoadRef = useRef(true);

  // Load initial data from mobile storage
  useEffect(() => {
    const loadSavedData = async () => {
      // Load Wallets
      const savedWallets = await Storage.getFoundWallets();
      if (savedWallets.length > 0) {
        setFound(savedWallets);
        const value = savedWallets.reduce((sum: number, b: any) => sum + (b.totalValue || 0), 0);
        setTotalValue(value);
      }
      
      // Load Configs
      const savedRpcs = await Storage.getConfig('rpcs');
      if (savedRpcs) setRpcs(savedRpcs);
      
      const savedIntensity = await Storage.getConfig('scanIntensity');
      if (savedIntensity) setScanIntensity(savedIntensity);
      
      isInitialLoadRef.current = false;
    };
    loadSavedData();
  }, []);

  // Update storage when found list changes
  useEffect(() => {
    if (found.length > 0) {
      Storage.saveFoundWallets(found);
    }
  }, [found]);

  useEffect(() => {
    if (!isInitialLoadRef.current) {
      Storage.saveConfig('rpcs', rpcs);
    }
  }, [rpcs]);

  useEffect(() => {
    if (!isInitialLoadRef.current) {
      Storage.saveConfig('scanIntensity', scanIntensity);
    }
  }, [scanIntensity]);

  // Check RPC health periodically
  useEffect(() => {
    let isMounted = true;
    
    const checkNodes = async () => {
      setRpcStatus(prev => {
        const result = { ...prev };
        let changed = false;
        rpcs.forEach(url => { 
          if (!result[url]) {
            result[url] = { status: 'checking' }; 
            changed = true;
          }
        });
        return changed ? result : prev;
      });
      
      if (!navigator.onLine) {
        if (isMounted) {
          setRpcStatus(prev => {
            const res = { ...prev };
            rpcs.forEach(url => res[url] = { status: 'error' });
            return res;
          });
        }
        return;
      }

      for (const url of rpcs) {
        try {
          const start = Date.now();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion' }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            if (data && data.result) {
              if (isMounted) setRpcStatus(prev => ({ ...prev, [url]: { status: 'connected', latency: Date.now() - start } }));
            } else {
              if (isMounted) setRpcStatus(prev => ({ ...prev, [url]: { status: 'error' } }));
            }
          } else {
            if (isMounted) setRpcStatus(prev => ({ ...prev, [url]: { status: 'error' } }));
          }
        } catch (e) {
          if (isMounted) setRpcStatus(prev => ({ ...prev, [url]: { status: 'error' } }));
        }
      }
    };
    
    checkNodes();
    const interval = setInterval(checkNodes, 15000); // Check every 15s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [rpcs]);

  const [recentSeeds, setRecentSeeds] = useState<any[]>([]);
  const [scanSpeed, setScanSpeed] = useState(0);
  const workersRef = useRef<Worker[]>([]);
  const lastCheckedRef = useRef(0);
  const speedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const renderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const seedQueueRef = useRef<any[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const initialTimeOffset = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const foundContainerRef = useRef<HTMLDivElement>(null);

  const totalCheckedRef = useRef(0);

  const playAlertSound = useCallback(() => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed', e));
    } catch {}
  }, []);

  // Initialize Workers
  useEffect(() => {
    const numWorkers = Math.max(6, (navigator.hardwareConcurrency || 4));
    const newWorkers: Worker[] = [];

    for (let i = 0; i < numWorkers; i++) {
        try {
          const scannerWorker = new Worker(new URL('./scannerWorker.ts', import.meta.url), { type: 'module' });
          scannerWorker.onmessage = (e: MessageEvent) => {
            const { type, data } = e.data;
            if (type === 'result') {
              totalCheckedRef.current += 1;
              
              seedQueueRef.current = [{
                seed: data.seed,
                totalValue: data.totalValue,
                hasFunds: data.hasFunds,
                balances: data.balances
              }, ...seedQueueRef.current].slice(0, 100);

              if (data.hasFunds) {
                playAlertSound();
                setFound(prev => [...prev, data]);
                setTotalValue(prev => prev + data.totalValue);
              }
            } else if (type === 'log') {
              logQueueRef.current.push({ msg: data });
              if (logQueueRef.current.length > 500) {
                 logQueueRef.current = logQueueRef.current.slice(-500); // Prevent overflow
              }
            }
          };
          newWorkers.push(scannerWorker);
        } catch (err) {
          console.error(`Failed to start worker ${i}`, err);
        }
    }
    workersRef.current = newWorkers;

    speedIntervalRef.current = setInterval(() => {
        const current = totalCheckedRef.current;
        const delta = current - lastCheckedRef.current;
        lastCheckedRef.current = current;
        setScanSpeed(delta);
        setChecked(current);
    }, 1000);

    return () => {
      workersRef.current.forEach(w => w.terminate());
      if (speedIntervalRef.current) clearInterval(speedIntervalRef.current);
    };
  }, [playAlertSound]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Statical time update for UI
    const tick = setInterval(() => {
      if (startTimeRef.current && isScanning) {
        setTimeElapsed(initialTimeOffset.current + Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    renderIntervalRef.current = setInterval(() => {
      if (seedQueueRef.current.length > 0) {
        const qLen = seedQueueRef.current.length;
        const itemsToTake = Math.max(1, Math.ceil(qLen / 10));
        const nextItems = seedQueueRef.current.splice(0, itemsToTake).map(i => ({...i, uid: Math.random().toString(36).substr(2, 9)}));
        setRecentSeeds(prev => {
          return [...nextItems.reverse(), ...prev].slice(0, 40); 
        });
      }

      if (logQueueRef.current.length > 0) {
        const qLen = logQueueRef.current.length;
        const itemsToTake = Math.max(1, Math.ceil(qLen / 5));
        const nextItems = logQueueRef.current.splice(0, itemsToTake).map(i => ({
            uid: Math.random().toString(36).substring(2,9),
            msg: i.msg,
            time: Date.now()
        }));
        setNetworkLogs(prev => {
          return [...nextItems.reverse(), ...prev].slice(0, 100);
        });
      }
    }, 40);

    return () => {
      clearInterval(tick);
      if (renderIntervalRef.current) clearInterval(renderIntervalRef.current);
    };
  }, [isScanning]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        // @ts-ignore
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Wake Lock active');
      } catch (err: any) {
        console.log(`Wake Lock error: ${err.message}`);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock released');
      } catch (err: any) {
        console.log(`Wake Lock release error: ${err.message}`);
      }
    }
  };

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isScanning) {
        requestWakeLock();
      }
      if (document.visibilityState === 'hidden') {
        if (isScanning) {
          logQueueRef.current.push({ msg: "[SYSTEM] App moved to background. Background processing is heavily restricted by mobile OS. Leave app open." });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isScanning]);

  const startScanning = () => {
    // Only use RPCs that are actually connected or fall back to all if none are explicitly connected yet
    const connectedRpcs = rpcs.filter(r => rpcStatus[r]?.status === 'connected');
    const activeRpcs = connectedRpcs.length > 0 ? connectedRpcs : rpcs;

    if (activeRpcs.length === 0) {
      alert("Please add at least one RPC node.");
      return;
    }
    
    // Determine safe load based on user selection, but clamp true concurrency to prevent socket exhaustion
    let safeTotalConcurrency = Math.max(1, activeRpcs.length * scanIntensity);
    if (safeTotalConcurrency > 150) {
        safeTotalConcurrency = 150; // Max out at 150 concurrent sockets to prevent mobile browser crash
    }
    const workersCount = workersRef.current.length || 1;
    // Distribute the concurrency load across all active workers
    const concurrencyPerWorker = Math.max(1, Math.ceil(safeTotalConcurrency / workersCount));

    workersRef.current.forEach(w => w.postMessage({ 
      type: 'start', 
      rpcs: activeRpcs,
      concurrency: concurrencyPerWorker
    }));
    
    setIsScanning(true);
    startTimeRef.current = Date.now();
    requestWakeLock();
  };
  
  const stopScanning = () => {
    workersRef.current.forEach(w => w.postMessage({ type: 'stop' }));
    setIsScanning(false);
    releaseWakeLock();
    if (startTimeRef.current) {
      initialTimeOffset.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
      startTimeRef.current = null;
    }
    setScanSpeed(0);
  };

  const testRpcConnection = async (url: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion' }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        return !!data?.result;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const addRpc = async () => {
    if (newRpc && !rpcs.includes(newRpc)) {
      setIsAddingRpc(true);
      const isConnected = await testRpcConnection(newRpc);
      setIsAddingRpc(false);
      
      if (isConnected) {
        setRpcs([...rpcs, newRpc]);
        setNewRpc('');
      } else {
        alert("Could not connect to this RPC node. Please verify the URL or try another.");
      }
    }
  };

  const removeRpc = (url: string) => {
    setRpcs(rpcs.filter(r => r !== url));
  };
  
  const removeWallet = (index: number) => {
    const newFound = [...found];
    newFound.splice(index, 1);
    setFound(newFound);
    const value = newFound.reduce((sum: number, b: any) => sum + (b.totalValue || 0), 0);
    setTotalValue(value);
  };

  const exportFoundWallets = () => {
    if (found.length === 0) return;
    let dataStr = "Wallet Seed Phrases - Scanner\n\n";
    found.forEach(w => {
      dataStr += `Seed: ${w.seed}\nTotal Value: $${w.totalValue.toFixed(2)}\nTokens: ${JSON.stringify(w.balances)}\nAddress: ${w.addresses?.solana}\nTimestamp: ${new Date(w.timestamp).toISOString()}\n\n`;
    });
    const blob = new Blob([dataStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `funded-wallets-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-300 font-sans mx-auto w-full md:max-w-md flex flex-col relative h-screen text-sm overflow-hidden md:border-x border-[#1a1a1a]">
      
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-[#0c0c0c] z-10 border-b border-[#222]">
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 395 314" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M62.6393 113.882C58.8266 113.882 55.4389 111.458 54.1953 107.828L1.65089 12.3922C-0.817088 5.48545 4.31689 0 11.5835 0H282.684C286.497 0 289.884 2.42416 291.128 6.05389L343.672 101.49C346.14 108.396 341.006 113.882 333.74 113.882H62.6393Z" fill="url(#sol-gradient)"/>
            <path d="M62.6393 313.35H332.969C340.235 313.35 345.369 307.864 342.901 300.958L290.357 205.522C289.113 201.892 285.725 199.468 281.913 199.468H12.355C5.0883 199.468 -0.0456637 204.954 2.42231 211.861L54.1953 306.525C55.4389 310.154 58.8266 313.35 62.6393 313.35Z" fill="url(#sol-gradient)"/>
            <defs>
              <linearGradient id="sol-gradient" x1="12.355" y1="156.675" x2="332.969" y2="156.675" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00FFA3"/>
                <stop offset="1" stopColor="#DC1FFF"/>
              </linearGradient>
            </defs>
          </svg>
          <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00FFA3] to-[#DC1FFF] tracking-wide flex items-top gap-1">
            Solana Scanner
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/5 shadow-inner">
            <span className={`text-[9px] font-bold tracking-wider ${isScanning ? 'text-[#00FFA3]' : 'text-gray-500'}`}>
              {isScanning ? 'ACTIVE' : 'IDLE'}
            </span>
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isScanning ? 'bg-[#00FFA3] shadow-[0_0_8px_rgba(0,255,163,0.8)] animate-pulse' : 'bg-gray-700'}`}></div>
          </div>
        </div>
      </div>

      {/* RPC Configuration */}
      <div className="bg-[#111111] p-3 border-b border-[#222]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5 text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-500">
            <Database size={12} className="text-[#DC1FFF]" />
            RPC Nodes ({rpcs.length})
          </h3>
        </div>
        
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newRpc}
              onChange={(e) => setNewRpc(e.target.value)}
              placeholder="HTTPS RPC URL..."
              className="flex-1 min-w-0 bg-black border border-[#333] text-[12px] h-11 rounded px-3 focus:outline-none focus:border-[#DC1FFF] transition-colors text-white placeholder-gray-600 font-mono"
              disabled={isScanning || isAddingRpc}
            />
            <button 
              onClick={addRpc}
              disabled={!newRpc || isScanning || isAddingRpc}
              className="bg-[#222] hover:bg-[#333] border border-[#333] px-5 h-11 rounded transition-colors text-white disabled:opacity-50 text-[11px] font-bold tracking-wider flex items-center justify-center gap-1.5 shrink-0 min-w-[110px]"
            >
              {isAddingRpc ? <span className="animate-pulse">CONNECTING...</span> : <><Plus size={14} /> CONNECT</>}
            </button>
          </div>
          
          <div className="mt-2 flex flex-col gap-1">
            <label className="text-[10px] text-gray-500 font-bold tracking-widest flex justify-between">
              <span>SCAN INTENSITY (LOAD)</span>
              <span className="text-[#DC1FFF]">{scanIntensity} req/sec per node</span>
            </label>
            <input 
              type="range" 
              min="1" 
              max="200" 
              value={scanIntensity} 
              onChange={(e) => setScanIntensity(Number(e.target.value))} 
              disabled={isScanning}
              className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#DC1FFF]"
            />
          </div>
        </div>

        <div className="h-[100px] overflow-y-auto no-scrollbar space-y-2">
          {rpcs.map((rpc, i) => {
            const statusInfo = rpcStatus[rpc];
            return (
            <div key={i} className="flex items-center justify-between bg-black/50 border border-[#222] px-3 py-2 rounded-lg group hover:border-[#333] transition-colors">
              <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-3">
                <div title={statusInfo?.status || 'Unknown'} className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                  statusInfo?.status === 'connected' ? `bg-[#00FFA3] shadow-[0_0_5px_rgba(0,255,163,0.5)] ${isScanning ? 'animate-pulse' : ''}` : 
                  statusInfo?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 
                  statusInfo?.status === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-gray-600'
                }`}></div>
                <span className="text-[11px] font-mono text-gray-300 truncate min-w-0">{rpc}</span>
                {statusInfo?.latency && <span className="text-[10px] text-gray-500 shrink-0 ml-auto">{statusInfo.latency}ms</span>}
              </div>
              <button 
                onClick={() => removeRpc(rpc)} 
                disabled={isScanning || rpcs.length <= 1}
                className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors bg-[#111] hover:bg-[#222] border border-[#222] p-2 rounded cursor-pointer shrink-0 z-10"
                title={rpcs.length <= 1 ? "Cannot remove last RPC" : "Remove RPC"}
              >
                <Trash2 size={16} />
              </button>
            </div>
            );
          })}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-[#222]">
         <button 
           onClick={() => setActiveTab('scanner')} 
           className={`flex-1 py-2 text-[10px] uppercase tracking-widest font-bold transition-all ${activeTab === 'scanner' ? 'bg-[#111] text-[#00FFA3] border-b-2 border-[#00FFA3]' : 'bg-[#050505] text-gray-600 hover:text-gray-400 hover:bg-[#0a0a0a]'}`}
         >
            Generations
         </button>
         <button 
           onClick={() => setActiveTab('network')} 
           className={`flex-1 py-2 text-[10px] uppercase tracking-widest font-bold transition-all ${activeTab === 'network' ? 'bg-[#111] text-[#DC1FFF] border-b-2 border-[#DC1FFF]' : 'bg-[#050505] text-gray-600 hover:text-gray-400 hover:bg-[#0a0a0a]'}`}
         >
            Network Traffic
         </button>
      </div>

      <div 
        ref={logContainerRef}
        className="flex-1 overflow-y-auto bg-[#050505] relative shadow-inner [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]"
      >
        {activeTab === 'scanner' ? (
          <div className="flex flex-col justify-end pt-4 pb-2">
            {recentSeeds.length === 0 ? (
              <div className="text-center text-[#444] mt-10 text-[11px] tracking-wider uppercase font-mono">
                Ready to initialize derivation paths
              </div>
            ) : (
              recentSeeds.map((item) => (
                <div key={item.uid} className="animate-fade-in-down flex items-start text-[11px] px-3 py-[3px] border-b border-[#111] hover:bg-[#0a0a0a] transition-all">
                  <Search size={10} className="mt-1 text-[#DC1FFF]/40 shrink-0" />
                  <div className="ml-2 flex-1 min-w-0 flex items-center">
                     <span className="text-gray-500 font-mono text-[9.5px] whitespace-normal break-words opacity-70 selection:bg-[#DC1FFF]/30">{item.seed}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col justify-end pt-4 pb-2">
            {networkLogs.length === 0 ? (
              <div className="text-center text-[#444] mt-10 text-[11px] tracking-wider uppercase font-mono">
                Awaiting network requests...
              </div>
            ) : (
              networkLogs.map((log) => (
                <div key={log.uid} className="animate-fade-in-down flex items-start text-[10px] px-3 py-1 hover:bg-[#0a0a0a] transition-all border-b border-[#111]/50">
                  <span className="text-gray-600 text-[9px] w-14 shrink-0 font-mono truncate mr-2" title={new Date(log.time).toISOString().substring(14, 23)}>
                    {new Date(log.time).toISOString().substring(14, 23)}
                  </span>
                  <span className={`font-mono flex-1 whitespace-pre-wrap break-all ${log.msg.includes('[RES]') ? 'text-[#00FFA3]' : log.msg.includes('[ERR]') ? 'text-red-400' : 'text-gray-400 opacity-80'}`}>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Stats Line */}
      <div className="bg-[#111] py-2 px-3 flex items-center justify-between text-[11px] text-[#a1a1aa] border-y border-[#222] font-mono shadow-md z-10">
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-[#00FFA3]" />
          <span className="text-white font-bold">{scanSpeed.toLocaleString()}</span>
          <span className="text-gray-500">W/s</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Key size={12} className="text-[#DC1FFF]" />
          <span className="text-white font-bold">{checked.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#00FFA3] block w-2 h-2 rounded-full border border-[#00FFA3]"></span>
          <span className="text-white font-bold">${totalValue.toFixed(2)}</span>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-[#050505] p-3 flex items-center gap-3">
        {isScanning ? (
          <button 
            onClick={stopScanning}
            className="flex-1 h-12 bg-[#220000] text-red-500 font-bold rounded flex items-center justify-center gap-2 shadow-lg text-sm tracking-widest border border-red-900 shadow-[0_0_15px_rgba(220,38,38,0.15)] hover:bg-[#330000] active:scale-95 transition-all outline-none"
          >
            <Square size={16} fill="currentColor" /> STOP
          </button>
        ) : (
          <button 
            onClick={startScanning}
            disabled={rpcs.length === 0}
            className={`flex-1 h-12 font-bold rounded flex items-center justify-center gap-2 shadow-lg text-sm tracking-widest border transition-all ${
              rpcs.length === 0 ? 'bg-[#111] text-gray-500 border-[#222] cursor-not-allowed' : 'bg-gradient-to-r from-[#00FFA3]/10 to-[#DC1FFF]/10 text-white border-[#DC1FFF]/50 hover:border-[#00FFA3] hover:shadow-[0_0_15px_rgba(0,255,163,0.3)] active:scale-95 outline-none'
            }`}
          >
            <Play size={16} fill="currentColor" /> START
          </button>
        )}

        <div className="w-24 h-12 bg-black rounded flex items-center justify-center font-mono text-[14px] text-[#00FFA3] border border-[#222] shadow-inner tracking-widest font-bold">
          {formatTime(timeElapsed)}
        </div>
      </div>

      {/* Found Area Output */}
      <div ref={foundContainerRef} className="bg-[#111] p-0 h-[220px] overflow-y-auto w-full border-t border-[#222] scroll-smooth shadow-inner shrink-0 relative">
        <div className="sticky top-0 bg-[#111]/90 backdrop-blur-sm z-10 flex items-center justify-between p-3 border-b border-[#222]">
          <h2 className="text-[12px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#00FFA3]" />
            Found Assets
          </h2>
          <div className="flex items-center gap-2">
            {found.length > 0 && (
              <button 
                onClick={exportFoundWallets}
                className="bg-[#333] hover:bg-[#444] text-white px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold border border-[#444] transition-colors"
                title="Save wallets to file (No storage permission needed)"
              >
                <Download size={10} /> EXPORT
              </button>
            )}
            <span className="bg-[#00FFA3]/10 text-[#00FFA3] px-2 py-0.5 rounded text-[10px] font-bold border border-[#00FFA3]/20">
              {found.length}
            </span>
          </div>
        </div>

        {found.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-32 opacity-30 mt-4 text-[#00FFA3]">
             <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2">
               <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
               <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
               <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
             </svg>
             <p className="text-[10px] uppercase tracking-widest">No matching keys</p>
           </div>
        ) : (
          <div className="space-y-3 p-3">
            {found.map((item, i) => {
              const dateObj = new Date(item.timestamp);
              const timeString = isNaN(dateObj.getTime()) ? new Date().toLocaleTimeString() : dateObj.toLocaleTimeString();

              return (
                 <div key={`found-${i}`} className="text-[12px] p-3 bg-[#0a0a0a] rounded border border-[#333] relative group hover:border-[#DC1FFF]/50 transition-colors">
                    
                    <button 
                      onClick={() => removeWallet(i)}
                      className="absolute top-2 right-2 p-1.5 text-gray-600 hover:text-red-400 bg-[#111] hover:bg-[#222] rounded opacity-0 group-hover:opacity-100 transition-all border border-[#222] z-20"
                      title="Remove Wallet"
                    >
                      <Trash2 size={12} />
                    </button>

                    <div className="flex justify-between items-center mb-2">
                       <span className="bg-[#DC1FFF]/10 text-[#DC1FFF] px-1.5 py-0.5 rounded text-[9px] font-mono border border-[#DC1FFF]/20">
                         {timeString}
                       </span>
                       <span className="text-[#00FFA3] font-bold text-[12px] mr-6">
                         +${item.totalValue.toFixed(2)}
                       </span>
                    </div>

                    <div className="mb-2">
                      <p className="text-gray-300 font-mono text-[10px] bg-black p-2 rounded border border-[#222] select-all break-words leading-relaxed selection:bg-[#DC1FFF]/30 group-hover:border-[#333] transition-colors relative">
                        {item.seed}
                        <button 
                          onClick={() => navigator.clipboard.writeText(item.seed)}
                          className="absolute bottom-1 right-1 p-1 text-gray-500 hover:text-white bg-black/50 rounded"
                          title="Copy Seed Phase"
                        >
                          <Copy size={10} />
                        </button>
                      </p>
                    </div>
                    
                    {item.addresses && Object.keys(item.addresses).length > 0 && (
                      <div className="flex items-center justify-between text-[10px] font-mono bg-black px-2 py-1.5 rounded border border-[#222] group-hover:border-[#333] transition-colors">
                        <span className="text-gray-500 uppercase flex items-center gap-1">
                           <img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=025" alt="SOL" className="w-3 h-3 grayscale" />
                           {item.balances?.sol?.amount?.toFixed(4) || "0.0000"} SOL
                        </span>
                        <span className="text-gray-400 truncate w-32 text-right selection:bg-[#00FFA3]/30" title={item.addresses.solana}>{item.addresses.solana}</span>
                      </div>
                    )}
                 </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  );
}

