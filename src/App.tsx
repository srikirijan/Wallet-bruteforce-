import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Play, Square, Activity, Database, Trash2, Plus, Download, Key, Search, Copy, CheckCircle2, Wifi, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [activePage, setActivePage] = useState<'scanner' | 'network' | 'recoveries'>('scanner');
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
  const [isNodeFullView, setIsNodeFullView] = useState(false);
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
    // Leave at least 1 core for the main thread (React UI), max 8 workers
    const hwCores = navigator.hardwareConcurrency || 4;
    const numWorkers = Math.max(1, Math.min(8, hwCores - 1));
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
    if (safeTotalConcurrency > 2400) {
        safeTotalConcurrency = 2400; // Allow much higher concurrency before capping
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
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-sans flex flex-col overflow-hidden">
      
      {/* Top Header */}
      <header className="h-[60px] md:h-[70px] shrink-0 bg-[#020202] border-b border-[#222] flex items-center justify-between pl-3 md:pl-6 relative z-10 shadow-md">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00FFA3] to-transparent opacity-20"></div>
        
        {/* Left: Logo */}
        <div className="flex items-center gap-2 md:gap-4 flex-1">
          <div className="relative flex items-center justify-center p-1.5 md:p-2 bg-[#111] rounded-lg border border-[#333]">
             <Activity className="text-[#00FFA3] w-4 h-4 md:w-5 md:h-5" />
             {isScanning && <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#00FFA3] rounded-full animate-ping"></div>}
          </div>
          <h1 className="text-[14px] md:text-[20px] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#14F195] to-[#9945FF] tracking-widest uppercase truncate hidden sm:block">
            SolScanner
          </h1>
        </div>
        
        {/* Center: Navigation Tabs */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1 md:gap-2 bg-[#0A0A0A] p-1 rounded-lg border border-[#222]">
            <button onClick={() => setActivePage('scanner')} className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-[10px] md:text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-1 md:gap-2 ${activePage === 'scanner' ? 'bg-[#111] text-[#14F195] shadow-sm border border-[#333]' : 'text-[#666] hover:text-[#aaa] border border-transparent'}`}>
              <Activity size={14} className="hidden sm:block" /> Scanner
            </button>
            <button onClick={() => setActivePage('network')} className={`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-[10px] md:text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-1 md:gap-2 ${activePage === 'network' ? 'bg-[#111] text-white shadow-sm border border-[#333]' : 'text-[#666] hover:text-[#aaa] border border-transparent'}`}>
              <Wifi size={14} className="hidden sm:block" /> Network
            </button>
          </div>
        </div>

        {/* Right: Label */}
        <div className="flex flex-1 items-center justify-end h-full">
           <div className="h-full px-4 md:px-8 bg-gradient-to-r from-[#020202] via-[#9945FF]/10 to-[#14F195]/20 border-l border-[#222] flex items-center justify-center gap-3 relative overflow-hidden shadow-[-10px_0_20px_rgba(0,0,0,0.5)]">
             <div className="absolute top-0 right-0 w-full h-[2px] bg-gradient-to-r from-[#9945FF] to-[#14F195]"></div>
             <div className="absolute top-0 right-0 w-1/2 h-full bg-[#14F195]/5 origin-top-right -skew-x-[30deg]"></div>
             
             <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-[#14F195] rounded-full animate-pulse shadow-[0_0_12px_#14F195] relative z-10"></div>
             
             <div className="flex flex-col relative z-10">
               <span className="text-[7px] md:text-[8px] text-[#A0A0A0] font-bold tracking-[0.2em] uppercase mb-0.5 whitespace-nowrap">Engine Status</span>
               <span className="text-[12px] md:text-[15px] font-black uppercase tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-[#9945FF] to-[#14F195] drop-shadow-[0_0_8px_rgba(20,241,149,0.3)] whitespace-nowrap">
                 Solana Scanner
               </span>
             </div>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative w-full">
      
        
        {/* PAGE 1: SCANNER */}
        {activePage === 'scanner' && (
          <div className="absolute inset-0 flex flex-col h-full overflow-y-auto md:overflow-hidden p-2 md:p-4 gap-3 md:gap-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505]">
            
            {/* 1. SEEDPHRASE SCREEN (Live Buffer) */}
            <div className="flex-1 shrink-[2] min-h-[300px] md:min-h-[400px] border border-[#222] rounded-xl bg-[#030303] flex flex-col relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              <div className="h-8 md:h-10 border-b border-[#111] bg-[#0A0A0A] flex items-center px-4 justify-between shrink-0">
                <span className="text-[9px] md:text-[11px] text-[#777] font-bold uppercase tracking-widest flex items-center gap-2">
                  <Database size={12} className="text-[#00FFA3]" /> Seedphrase Screen
                </span>
                <div className="flex items-center gap-2 md:gap-3 text-[9px] md:text-[10px] text-[#555] font-mono">
                  <span>ACT: {rpcs.filter(r => rpcStatus[r]?.status === 'connected').length}</span>
                  <span className="text-[#333]">|</span>
                  <span>Q: {recentSeeds.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 md:p-3" ref={logContainerRef}>
                <div className="space-y-0.5 font-mono">
                  {recentSeeds.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#333] gap-3">
                      <Activity size={30} className="opacity-20" />
                      <div className="text-[10px] md:text-xs uppercase tracking-widest font-bold">Awaiting engine start</div>
                    </div>
                  ) : (
                    recentSeeds.map((item, idx) => (
                      <div key={item.uid} className="flex px-2 py-1 hover:bg-[#0A0A0A] rounded text-[10px] md:text-xs group items-center transition-colors">
                        <div className="w-[50px] md:w-[70px] text-[#444]">{(checked - recentSeeds.length + idx + 1).toString().padStart(7, '0')}</div>
                        <div className="flex-1 text-[#00FFA3] opacity-60 group-hover:opacity-100 truncate pr-2 md:pr-4">{item.seed}</div>
                        <div className="text-[#333] shrink-0 font-bold">NUL</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 2. START, TIMER, AND CHECKED (Stats & Controls) */}
            <div className="flex flex-col xl:flex-row gap-3 md:gap-4 shrink-0">
               {/* Controls */}
               <div className="flex-1 border border-[#222] rounded-xl bg-[#020202] p-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center gap-3 md:gap-4">
                  {isScanning ? (
                    <button onClick={stopScanning} className="h-10 md:h-12 px-6 bg-[#1a0505] text-[#ff4444] text-xs font-bold border border-[#ff4444]/30 rounded-lg hover:bg-[#ff4444]/10 transition-all uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,0,0,0.1)] shrink-0">
                      <Square size={14} fill="currentColor" /> Stop
                    </button>
                  ) : (
                    <button onClick={startScanning} disabled={rpcs.length === 0} className={`h-10 md:h-12 px-6 ${rpcs.length === 0 ? 'bg-[#111] text-[#444] border-[#222]' : 'bg-[#002211] text-[#00FFA3] border-[#00FFA3]/30 hover:bg-[#00FFA3]/10 shadow-[0_0_15px_rgba(0,255,163,0.1)]'} text-xs font-bold border rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2 shrink-0`}>
                      <Play size={14} fill="currentColor" /> Start
                    </button>
                  )}
                  
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="text-[9px] text-[#777] uppercase tracking-widest mb-1 hidden md:block">Intensity</div>
                    <div className="flex items-center gap-2">
                       <input type="range" min="1" max="200" value={scanIntensity} onChange={(e) => setScanIntensity(Number(e.target.value))} disabled={isScanning} className="w-full max-w-[150px] h-1 bg-[#222] rounded-full appearance-none accent-[#00FFA3] cursor-pointer" />
                       <span className="text-[9px] text-[#00FFA3] font-mono">{scanIntensity}</span>
                    </div>
                  </div>
               </div>
               
               {/* Stats Row */}
               <div className="flex flex-1 gap-2 md:gap-3">
                 <div className="flex-1 p-2 md:p-3 border border-[#222] rounded-xl bg-[#050505] relative overflow-hidden flex flex-col justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                   <div className="text-[9px] md:text-[10px] text-[#666] uppercase tracking-widest mb-0.5">Timer</div>
                   <div className="text-sm md:text-lg font-mono text-white font-bold">{formatTime(timeElapsed)}</div>
                 </div>
                 <div className="flex-1 p-2 md:p-3 border border-[#222] rounded-xl bg-[#050505] relative overflow-hidden flex flex-col justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                   <div className="text-[9px] md:text-[10px] text-[#666] uppercase tracking-widest mb-0.5">Speed</div>
                   <div className="text-sm md:text-lg font-mono text-white font-bold">{scanSpeed.toLocaleString()} /s</div>
                 </div>
                 <div className="flex-1 p-2 md:p-3 border border-[#222] rounded-xl bg-[#050505] relative overflow-hidden flex flex-col justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                   <div className="text-[9px] md:text-[10px] text-[#666] uppercase tracking-widest mb-0.5">Checked</div>
                   <div className="text-sm md:text-lg font-mono text-white font-bold">{checked.toLocaleString()}</div>
                 </div>
               </div>
            </div>

            {/* 3. FOUND */}
            <div className={`flex-1 ${found.length > 0 ? 'shrink-0 min-h-[400px]' : 'shrink-0 max-h-[150px]'} flex flex-col border border-[#222] rounded-xl bg-[#020202] shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500`}>
               <div className="h-10 md:h-12 border-b border-[#111] bg-[#0A0A0A] flex items-center px-4 justify-between shrink-0">
                 <h2 className="text-[10px] md:text-[11px] text-[#DC1FFF] font-bold uppercase tracking-widest flex items-center gap-2">
                   <CheckCircle2 size={12} className="text-[#DC1FFF]" /> Found ({found.length})
                 </h2>
                 <div className="flex items-center gap-3">
                   <span className="text-[#00FFA3] font-mono text-[10px] md:text-xs font-bold">${totalValue.toFixed(2)}</span>
                   {found.length > 0 && (
                     <button onClick={exportFoundWallets} className="text-[#DC1FFF] hover:text-white transition-colors p-1 bg-[#111] rounded border border-[#333]">
                       <Download size={14} />
                     </button>
                   )}
                 </div>
               </div>
               
               <div className="flex-1 overflow-y-auto p-3 md:p-4">
                 {found.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-full text-[#333] gap-3">
                     <CheckCircle2 size={30} className="opacity-20 text-[#DC1FFF]" />
                     <div className="text-[10px] font-bold tracking-widest uppercase">Storage empty</div>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {found.map((item, i) => {
                         const d = new Date(item.timestamp);
                         return (
                           <div key={i} className="border border-[#222] bg-[#050505] p-3 md:p-4 rounded-xl relative group overflow-hidden">
                             <div className="absolute top-0 right-0 bg-[#00FFA3]/10 text-[#00FFA3] px-3 py-1 text-[10px] font-bold border-b border-l border-[#00FFA3]/20 rounded-bl-lg z-10">
                               +${item.totalValue.toFixed(2)}
                             </div>
                             
                             <div className="flex items-center justify-between mb-3">
                               <div className="text-[9px] text-[#555] font-mono">{isNaN(d.getTime()) ? 'UNKNOWN' : d.toLocaleTimeString()}</div>
                               <button onClick={() => removeWallet(i)} className="text-[#555] hover:text-[#ff4444] transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 md:-m-1">
                                 <Trash2 size={12} />
                               </button>
                             </div>
                             
                             <div className="mb-3 relative z-10">
                               <div className="text-[8px] md:text-[9px] text-[#777] font-bold tracking-widest uppercase mb-1 flex items-center gap-1"><Key size={10} className="text-[#00FFA3]"/> Mnemonic</div>
                               <div className="text-[10px] md:text-[11px] text-[#eee] font-mono break-all bg-[#0A0A0A] p-2 rounded-lg border border-[#111] selection:bg-[#DC1FFF]/30">
                                 {item.seed}
                               </div>
                             </div>
                             
                             <div className="relative z-10">
                               <div className="text-[8px] md:text-[9px] text-[#777] font-bold tracking-widest uppercase mb-1 flex items-center gap-1"><CheckCircle2 size={10} className="text-[#DC1FFF]"/> Validated Balance</div>
                               <div className="flex justify-between items-center bg-[#0A0A0A] p-2 rounded-lg border border-[#111]">
                                 <span className="text-[9px] md:text-[10px] text-[#888] font-mono truncate pr-2" title={item.addresses?.solana}>{item.addresses?.solana || 'N/A'}</span>
                                 <span className="text-[10px] md:text-[11px] font-bold text-[#00FFA3] shrink-0">{item.balances?.sol?.amount?.toFixed(4) || "0.0000"}</span>
                               </div>                             
                             </div>
                           </div>
                         )
                      })}
                   </div>
                 )}
               </div>
            </div>

          </div>
        )}


        {/* PAGE 2: NETWORK */}
        {activePage === 'network' && (
          <div className="absolute inset-0 flex flex-col h-full overflow-hidden p-2 md:p-4 gap-3 md:gap-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505]">
            
            {/* Top Node Management */}
            <div className="w-full border border-[#222] rounded-xl bg-[#020202] flex flex-col shrink-0 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <div className="p-3 md:p-4 border-b border-[#111] bg-[#0A0A0A] flex flex-col md:flex-row gap-4 items-center justify-between">
                   <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
                     <h2 className="text-[9px] md:text-[10px] text-[#777] font-bold tracking-widest uppercase flex items-center gap-2 whitespace-nowrap"><Wifi size={14} className="text-[#00FFA3]" /> Add Node</h2>
                     <div className="flex gap-2 w-full md:w-[300px]">
                        <input type="text" value={newRpc} onChange={(e) => setNewRpc(e.target.value)} placeholder="https://..." className="flex-1 min-w-0 bg-[#050505] border border-[#333] text-[10px] h-9 px-3 rounded-lg text-white focus:border-[#00FFA3] transition-colors outline-none font-mono" disabled={isScanning || isAddingRpc} />
                        <button onClick={addRpc} disabled={!newRpc || isScanning || isAddingRpc} className="bg-[#111] border border-[#333] h-9 px-4 rounded-lg text-[10px] font-bold text-white hover:bg-[#222] disabled:opacity-50 transition-colors uppercase tracking-widest shrink-0">
                          {isAddingRpc ? '...' : 'Add'}
                        </button>
                     </div>
                   </div>

                   <div className="flex items-center gap-4 w-full md:w-auto h-9">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] text-[#555] font-bold tracking-widest uppercase">Total Nodes:</span>
                        <span className="text-[10px] text-[#00FFA3] font-mono">{rpcs.length}</span>
                      </div>
                      
                      <button onClick={() => setIsNodeFullView(!isNodeFullView)} className="bg-[#111] border border-[#333] h-9 px-4 rounded-lg text-[10px] font-bold text-white hover:bg-[#222] transition-colors uppercase tracking-widest flex items-center gap-2 ml-auto">
                         {isNodeFullView ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} Full View
                      </button>
                   </div>
               </div>

               {/* Router Table Box */}
               <div className={`bg-[#050505] overflow-y-auto transition-all ${isNodeFullView ? 'max-h-[300px] p-3' : 'max-h-[60px] p-3'}`}>
                 {rpcs.length === 0 ? (
                   <div className="text-[10px] text-[#444] text-center font-mono">No nodes added.</div>
                 ) : isNodeFullView ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                     {rpcs.map((rpc, i) => {
                        const stat = rpcStatus[rpc];
                        return (
                          <div key={i} className="border border-[#222] bg-[#0A0A0A] p-2.5 rounded-xl relative group flex flex-col hover:border-[#333] transition-colors">
                             <div className="flex items-center justify-between mb-1.5">
                               <div className="flex items-center gap-2">
                                 <div className={`w-2 h-2 rounded-full ${stat?.status === 'connected' ? 'bg-[#00FFA3] shadow-[0_0_5px_#00FFA3]' : stat?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                                 <span className="text-[10px] text-[#aaa] font-bold uppercase tracking-widest">Node {i + 1}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  {stat?.latency && <span className="text-[8px] text-[#00FFA3] font-mono bg-[#00FFA3]/10 px-1.5 py-0.5 rounded shadow-[0_0_5px_rgba(0,255,163,0.1)]">{stat.latency}ms</span>}
                                  <button onClick={() => removeRpc(rpc)} disabled={isScanning || rpcs.length <= 1} className="text-[#555] hover:text-[#ff4444] transition-opacity disabled:opacity-30 p-1 bg-[#111] rounded md:bg-transparent -m-1"><Trash2 size={12} /></button>
                               </div>
                             </div>
                             <div className="text-[9px] text-[#666] font-mono break-all leading-tight">{rpc}</div>
                          </div>
                        )
                     })}
                   </div>
                 ) : (
                   /* Single URL View */
                   <div className="border border-[#222] bg-[#0A0A0A] p-2 rounded-lg flex items-center justify-between">
                     <div className="flex items-center gap-3 w-full shrink-0 truncate">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${rpcStatus[rpcs[0]]?.status === 'connected' ? 'bg-[#00FFA3] shadow-[0_0_5px_#00FFA3]' : rpcStatus[rpcs[0]]?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-[10px] text-[#aaa] font-bold uppercase tracking-widest shrink-0">Node 1</span>
                        <div className="text-[9px] text-[#666] font-mono truncate">{rpcs[0]}</div>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                        {rpcStatus[rpcs[0]]?.latency && <span className="text-[8px] text-[#00FFA3] font-mono bg-[#00FFA3]/10 px-1.5 py-0.5 rounded shadow-[0_0_5px_rgba(0,255,163,0.1)]">{rpcStatus[rpcs[0]].latency}ms</span>}
                        <button onClick={() => removeRpc(rpcs[0])} disabled={isScanning || rpcs.length <= 1} className="text-[#555] hover:text-[#ff4444] transition-opacity disabled:opacity-30 p-1"><Trash2 size={12} /></button>
                     </div>
                   </div>
                 )}
               </div>
            </div>
            
            {/* Bottom Network Traffic (Huge size) */}
            <div className="flex-1 flex flex-col md:flex-row gap-3 md:gap-4 overflow-hidden">
               <div className="flex-1 flex flex-col border border-[#222] rounded-xl bg-[#030303] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative h-full">
                  <div className="h-10 bg-[#0A0A0A] border-b border-[#111] flex items-center justify-between px-4 shrink-0">
                    <span className="text-[#00FFA3] text-[9px] tracking-widest font-bold uppercase flex items-center gap-2"><Activity size={12}/> TX Outbound</span>
                    <span className="text-[#555] text-[10px] font-mono">{networkLogs.filter(l => l.msg.includes('[REQ]')).length} Pkts</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col justify-end">
                    <div className="space-y-1">
                      {networkLogs.filter(l => l.msg.includes('[REQ]')).length === 0 ? <div className="text-center text-[#333] text-[10px] uppercase tracking-widest">No tx outbound</div> : 
                        networkLogs.filter(l => l.msg.includes('[REQ]')).map(log => (
                          <div key={log.uid} className="text-[10px] text-[#00FFA3]/50 font-mono break-all pl-2 border-l-2 border-[#00FFA3]/20 py-0.5">
                            {log.msg.replace('[REQ] ', '-> ')}
                          </div>
                        ))
                      }
                    </div>
                  </div>
               </div>
               
               <div className="flex-1 flex flex-col border border-[#222] rounded-xl bg-[#030303] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative h-full">
                  <div className="h-10 bg-[#0A0A0A] border-b border-[#111] flex items-center justify-between px-4 shrink-0">
                    <span className="text-[#DC1FFF] text-[9px] tracking-widest font-bold uppercase flex items-center gap-2"><Database size={12}/> RX Inbound</span>
                    <span className="text-[#555] text-[10px] font-mono">{networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length} Pkts</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col justify-end">
                    <div className="space-y-1">
                      {networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length === 0 ? <div className="text-center text-[#333] text-[10px] uppercase tracking-widest">No rx inbound</div> : 
                        networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).map(log => (
                          <div key={log.uid} className={`text-[10px] font-mono break-all pl-2 border-l-2 py-0.5 ${log.msg.includes('[ERR]') ? 'text-red-500/70 border-red-500/30' : 'text-[#DC1FFF]/60 border-[#DC1FFF]/30'}`}>
                            {log.msg.replace('[RES] ', '<- ').replace('[ERR] ', '! ')}
                          </div>
                        ))
                      }
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}\n\n        </main>
    </div>
  );
}


