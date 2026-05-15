import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, Activity, Database, Trash2, Plus, Download, Key, Search, CheckCircle2, Wifi } from 'lucide-react';
import { Storage } from './lib/storage';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import DerivationWorker from './derivation.worker?worker';

const DEFAULT_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com'
];

const AnalogGauge = ({ value, color }: { value: number, color: string }) => {
  return (
    <div className="flex items-end gap-[1.5px] h-2.5 w-3.5 ml-1">
       <div className={`w-[2px] h-[30%] ${value > 15 ? color : 'bg-[#333]'}`}></div>
       <div className={`w-[2px] h-[55%] ${value > 40 ? color : 'bg-[#333]'}`}></div>
       <div className={`w-[2px] h-[80%] ${value > 65 ? color : 'bg-[#333]'}`}></div>
       <div className={`w-[2px] h-[100%] ${value > 85 ? color : 'bg-[#333]'}`}></div>
    </div>
  )
}

export default function App() {
  const [rpcs, setRpcs] = useState<string[]>(DEFAULT_RPCS);
  const [newRpc, setNewRpc] = useState('https://rpc.ankr.com/solana_devnet/f3e259180317da53a5c632c93bc65741fe20493047543da9dccb2add3abd7095');
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  const [checked, setChecked] = useState(0); 
  const [resCount, setResCount] = useState(0);
  const [resSpeed, setResSpeed] = useState(0);
  const [found, setFound] = useState<any[]>([]);
  const [totalValue, setTotalValue] = useState(0); 
  const [timeElapsed, setTimeElapsed] = useState(0); 
  const [rpcStatus, setRpcStatus] = useState<Record<string, { status: 'checking' | 'connected' | 'error', latency?: number }>>({});
  const [isAddingRpc, setIsAddingRpc] = useState(false);
  const [scanIntensity, setScanIntensity] = useState(10);
  const [activePage, setActivePage] = useState<'scanner' | 'network'>('scanner');
  const [networkLogs, setNetworkLogs] = useState<{uid: string, msg: string, time: number}[]>([]);
  
  const pendingUpdatesRef = useRef({ checked: 0, resCount: 0, logs: [] as {uid:string, msg:string, time:number}[] });

  const flushUpdates = useCallback(() => {
    const changes = pendingUpdatesRef.current;
    if (changes.checked > 0 || changes.resCount > 0 || changes.logs.length > 0) {
      if (changes.checked > 0) setChecked(c => c + changes.checked);
      if (changes.resCount > 0) setResCount(c => c + changes.resCount);
      if (changes.logs.length > 0) {
         setNetworkLogs(prev => {
            const newLogs = [...prev, ...changes.logs];
            return newLogs.length > 60 ? newLogs.slice(-60) : newLogs;
         });
      }
      pendingUpdatesRef.current = { checked: 0, resCount: 0, logs: [] };
    }
  }, []);

  useEffect(() => {
    const int = setInterval(flushUpdates, 60); // flush at ~16fps
    return () => clearInterval(int);
  }, [flushUpdates]);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const reqLogContainerRef = useRef<HTMLDivElement>(null);
  const resLogContainerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<any>(null);
  const workersRef = useRef<Worker[]>([]);

  useEffect(() => {
    const numWorkers = typeof navigator !== 'undefined' ? Math.max(1, (navigator.hardwareConcurrency || 4) - 1) : 3;
    workersRef.current = Array.from({ length: Math.min(8, numWorkers) }, () => new DerivationWorker());
    return () => {
       workersRef.current.forEach(w => w.terminate());
    };
  }, []);

  const [hwStats, setHwStats] = useState({ cpu: 0, gpu: 0, net: 0 });

  useEffect(() => {
    const int = setInterval(() => {
      setHwStats(prev => {
        if (!isScanningRef.current) {
           return {
             cpu: Math.max(0, prev.cpu - (3 + Math.random() * 5)),
             gpu: Math.max(0, prev.gpu - (2 + Math.random() * 3)),
             net: Math.max(0, prev.net - (8 + Math.random() * 5)),
           };
        }
        
        const speedFactor = Math.min(1, scanIntensity / 100);
        return {
           cpu: Math.min(100, Math.max(20, 30 + speedFactor * 50 + Math.random() * 15 - 5)),
           gpu: Math.min(100, Math.max(5, 12 + speedFactor * 20 + Math.random() * 10 - 5)),
           net: Math.min(100, Math.max(10, 50 + speedFactor * 40 + Math.random() * 10 - 5)), 
        };
      });
    }, 1000);
    return () => clearInterval(int);
  }, [scanIntensity]);

  const isInitialLoadRef = useRef(true);

  // Load configuration
  useEffect(() => {
    const loadSavedData = async () => {
      const savedWallets = await Storage.getFoundWallets();
      if (savedWallets.length > 0) {
        setFound(savedWallets);
        const value = savedWallets.reduce((sum: number, b: any) => sum + (b.totalValue || 0), 0);
        setTotalValue(value);
      }
      
      const savedRpcs = await Storage.getConfig('rpcs');
      if (savedRpcs) setRpcs(savedRpcs);
      
      const savedIntensity = await Storage.getConfig('scanIntensity');
      if (savedIntensity) setScanIntensity(savedIntensity);
      
      isInitialLoadRef.current = false;
    };
    loadSavedData();
  }, []);

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
    const interval = setInterval(checkNodes, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [rpcs]);

  useEffect(() => {
    if (isScanning && 'wakeLock' in navigator) {
      const requestWakeLock = async () => {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          // ignore wake lock permission errors
        }
      };
      requestWakeLock();
    } else if (!isScanning && wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, [isScanning]);

  useEffect(() => {
    if (activePage === 'scanner' && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    } else if (activePage === 'network') {
      if (reqLogContainerRef.current) reqLogContainerRef.current.scrollTop = reqLogContainerRef.current.scrollHeight;
      if (resLogContainerRef.current) resLogContainerRef.current.scrollTop = resLogContainerRef.current.scrollHeight;
    }
  }, [networkLogs, activePage]);

  const [scanSpeed, setScanSpeed] = useState(0);
  const [recentSeeds, setRecentSeeds] = useState<{uid: string, seed: string}[]>([]);
  const scanSpeedRef = useRef({ lastCount: 0, lastResCount: 0, lastTime: Date.now() });
  const checkedRef = useRef(0);
  const resCountRef = useRef(0);

  useEffect(() => {
    checkedRef.current = checked;
  }, [checked]);

  useEffect(() => {
    resCountRef.current = resCount;
  }, [resCount]);

  useEffect(() => {
    const int = setInterval(() => {
      if (isScanningRef.current) {
        setTimeElapsed(prev => prev + 1);
        
        const now = Date.now();
        const diffCount = checkedRef.current - scanSpeedRef.current.lastCount;
        const diffResCount = resCountRef.current - scanSpeedRef.current.lastResCount;
        const diffTime = (now - scanSpeedRef.current.lastTime) / 1000;
        
        if (diffTime > 0) {
          setScanSpeed(Math.round(diffCount / diffTime));
          setResSpeed(Math.round(diffResCount / diffTime));
        }
        
        scanSpeedRef.current = { lastCount: checkedRef.current, lastResCount: resCountRef.current, lastTime: now };
      }
    }, 1000);
    return () => clearInterval(int);
  }, []);

  const addNetworkLog = useCallback((msg: string) => {
    pendingUpdatesRef.current.logs.push({ uid: Math.random().toString(36).substring(7), msg, time: Date.now() });
  }, []);

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

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Scanning loop logic
  const checkBalance = async (address: string, urls: string[], signal?: AbortSignal) => {
    // Pick random working url
    const workingUrls = urls.filter(u => rpcStatus[u]?.status === 'connected');
    const url = workingUrls.length > 0 ? workingUrls[Math.floor(Math.random() * workingUrls.length)] : urls[0];
    if (!url) return 0;

    const shortUrl = new URL(url).hostname;
    const shortAddr = address.substring(0, 8) + '...';
    
    if (signal?.aborted) return 0;
    addNetworkLog(`[REQ] ${shortAddr} > ${shortUrl}`);
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address]
        }),
        signal
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const balanceLamports = data?.result?.value || 0;
      const balanceSol = balanceLamports / 1_000_000_000;
      
      if (signal?.aborted) return 0;
      addNetworkLog(`[RES] ${shortUrl} > base58:${shortAddr} = ${balanceSol.toFixed(4)} SOL`);
      return balanceSol; 
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) return 0;
      addNetworkLog(`[ERR] ${shortAddr} > ${shortUrl} (${err.message})`);
      return 0;
    }
  };

  const startScanning = () => {
    setIsScanning(true);
    isScanningRef.current = true;
    abortControllerRef.current = new AbortController();
    setChecked(prev => {
        scanSpeedRef.current = { lastCount: prev, lastTime: Date.now() };
        return prev;
    });
    // Add realistic dummy scan data
    generateLoop();
  };

  const activeRequestsRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const generateLoop = useCallback(() => {
    if (!isScanningRef.current) return;
    
    const workingUrls = rpcs.filter(u => rpcStatus[u]?.status === 'connected');
    const nodesCount = Math.max(1, workingUrls.length);
    
    // Total requests per tick (generateLoop runs every 200ms, so 5 times a second)
    const count = Math.ceil((scanIntensity / 5) * nodesCount);
    
    const batch: { uid: string, seed: string }[] = [];
    
    for (let i = 0; i < count; i++) {
        batch.push({
            uid: Math.random().toString(36).substring(7),
            seed: bip39.generateMnemonic()
        });
    }

    setRecentSeeds(prev => {
        const newest = [...batch, ...prev];
        return newest.slice(0, 50); // keep last 50
    });

    // Ensure we don't completely spam the browser when too high
    // Most browsers allow ~6 concurrent requests per domain. So 6 * nodesCount is the physical limit,
    // plus a little buffer for queuing. Limiting to physical bounds ensures UI remains fast above 90fps.
    const maxActiveRequests = Math.max(10, Math.min(600, nodesCount * 15));
    
    if (rpcs.length > 0) {
        batch.forEach(item => {
            if (activeRequestsRef.current >= maxActiveRequests) return;
            const checkInBackground = async () => {
                activeRequestsRef.current++;
                try {
                    let realAddress = "";
                    
                    const worker = workersRef.current.length > 0 ? workersRef.current[Math.floor(Math.random() * workersRef.current.length)] : null;
                    if (worker) {
                        realAddress = await new Promise<string>((resolve, reject) => {
                            const id = Math.random().toString();
                            const handler = (e: MessageEvent) => {
                                if (e.data.id === id) {
                                   worker.removeEventListener('message', handler);
                                   if (e.data.error) reject(new Error(e.data.error));
                                   else resolve(e.data.address);
                                }
                            };
                            worker.addEventListener('message', handler);
                            worker.postMessage({ mnemonic: item.seed, id });
                        });
                    } else {
                        const seedBuffer = bip39.mnemonicToSeedSync(item.seed);
                        const derivedSeed = derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex')).key;
                        const keypair = Keypair.fromSeed(derivedSeed);
                        realAddress = keypair.publicKey.toBase58();
                    }
                    
                    // Don't continue if stopped
                    if (!isScanningRef.current) return;
                    
                    pendingUpdatesRef.current.checked++;

                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000); 
                    
                    const onParentAbort = () => controller.abort();
                    if (abortControllerRef.current?.signal) {
                        abortControllerRef.current.signal.addEventListener('abort', onParentAbort);
                    }
                    
                    const balance = await checkBalance(realAddress, workingUrls.length > 0 ? workingUrls : rpcs, controller.signal);
                    
                    clearTimeout(timeoutId);
                    if (abortControllerRef.current?.signal) {
                        abortControllerRef.current.signal.removeEventListener('abort', onParentAbort);
                    }
            
                    if (!isScanningRef.current) return;
                    
                    if (balance > 0) {
                        const newHit = {
                          uid: item.uid,
                          seed: item.seed,
                          addresses: { solana: realAddress },
                          balances: { SOL: balance.toFixed(4) },
                          totalValue: balance * 150,
                          timestamp: Date.now()
                        };
                        setFound(prev => [newHit, ...prev]);
                        setTotalValue(prev => prev + newHit.totalValue);
                    }
                } catch (err) {
                    // ignore format/derivation errors
                } finally {
                    activeRequestsRef.current--;
                    pendingUpdatesRef.current.resCount++;
                }
            };
            checkInBackground();
        });
    }

    if (isScanningRef.current) {
        setTimeout(generateLoop, 200); 
    }
  }, [scanIntensity, rpcs, rpcStatus]);

  const stopScanning = () => {
    setIsScanning(false);
    isScanningRef.current = false;
    abortControllerRef.current?.abort();
  };

  return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-mono flex flex-col overflow-hidden">
      
      {/* Top Header */}
      <header className="h-[45px] shrink-0 bg-[#020202] border-b border-[#222] flex items-center justify-between px-3 relative z-10 shadow-md">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-r from-[#14F195] via-[#9945FF] to-[#14F195] w-5 h-5 flex items-center justify-center relative shadow-[0_0_10px_rgba(20,241,149,0.3)] border border-[#111]">
             <div className="bg-[#050505] w-4 h-4"></div>
             <div className="bg-[#14F195] w-2 h-2 absolute shadow-[0_0_8px_#14F195]"></div>
          </div>
          <h1 className="text-[16px] font-bold text-white tracking-wide mix-blend-screen drop-shadow-md">
            Solana Scanner
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-[#555] text-[9px] font-bold tracking-widest flex items-center">CPU <AnalogGauge value={hwStats.cpu} color="bg-[#14F195]" /></span>
            <span className="text-[#555] text-[9px] font-bold tracking-widest flex items-center">GPU <AnalogGauge value={hwStats.gpu} color="bg-[#14F195]" /></span>
            <span className="text-[#555] text-[9px] font-bold tracking-widest flex items-center">NET <AnalogGauge value={hwStats.net} color="bg-[#DC1FFF]" /></span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#000] px-2 py-1 rounded border border-[#111]">
             <span className={`text-[10px] font-bold uppercase tracking-widest ${isScanning ? 'text-[#14F195]' : 'text-[#666]'}`}>
               {isScanning ? 'Active' : 'Inactive'}
             </span>
             <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-[#14F195] shadow-[0_0_8px_#14F195]' : 'bg-[#444]'} `}></div>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto w-full flex flex-col">
        {/* RPC Nodes Section */}
        <div className="p-2 border-b border-[#222] bg-[#020202] shrink-0">
          <div className="flex items-center gap-1.5 mb-2 text-[#aaa]">
            <Database size={12} className="text-[#DC1FFF]" />
            <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#999]">RPC Nodes ({rpcs.length})</h2>
          </div>
          
          <div className="flex gap-2 mb-2">
            <input type="text" value={newRpc} onChange={(e) => setNewRpc(e.target.value)} placeholder="https://..." className="flex-1 bg-[#0A0A0A] border border-[#333] text-[12px] h-10 px-3 rounded text-white focus:border-[#14F195] transition-colors outline-none" disabled={isScanning || isAddingRpc} />
            <button onClick={addRpc} disabled={!newRpc || isScanning || isAddingRpc} className="bg-[#111] border border-[#333] h-10 px-4 rounded text-[10px] font-bold text-[#888] hover:text-white hover:border-[#555] disabled:opacity-50 transition-colors uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Plus size={14} /> Connect
            </button>
          </div>
          
          <div className="flex justify-between items-center mb-1 mt-3">
             <span className="text-[11px] text-[#555] font-bold uppercase tracking-widest">Scan Intensity (Load)</span>
             <span className="text-[11px] text-[#DC1FFF] font-bold tracking-wider">{scanIntensity} req/sec per node</span>
          </div>
          <div className="mb-2 px-1">
             <input type="range" min="1" max="100" value={scanIntensity} onChange={(e) => setScanIntensity(Number(e.target.value))} disabled={isScanning} className="w-full h-1 bg-[#222] rounded-full appearance-none accent-[#DC1FFF] cursor-pointer" />
          </div>
          
          <div className="max-h-[60px] overflow-y-auto pr-1 space-y-0 text-[11px]">
             {rpcs.map((rpc, i) => {
                const stat = rpcStatus[rpc];
                return (
                  <div key={i} className="flex flex-col group py-[2px]">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-1.5 truncate">
                         <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${stat?.status === 'connected' ? 'bg-[#14F195]' : stat?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                         <div className="text-[11px] text-[#ccc] truncate font-mono">{rpc}</div>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                          {stat?.latency && <span className="text-[10px] text-[#666] font-mono">{stat.latency}ms</span>}
                          <button onClick={() => removeRpc(rpc)} disabled={isScanning || rpcs.length <= 1} className="text-[#333] hover:text-[#ff4444] transition-colors disabled:opacity-30"><Trash2 size={11} /></button>
                       </div>
                     </div>
                  </div>
                )
             })}
          </div>
        </div>

        {/* Console / Tabs Section */}
        <div className="flex-[2] min-h-[300px] flex flex-col bg-[#050505]">
          {/* Tab bar */}
          <div className="flex border-b border-[#222] bg-[#020202]">
            <button onClick={() => setActivePage('scanner')} className={`flex-1 py-1 text-[11px] font-bold uppercase tracking-widest border-b-[2px] transition-colors ${activePage === 'scanner' ? 'text-[#14F195] border-[#14F195]' : 'text-[#444] border-transparent hover:text-[#aaa]'}`}>
              Generations
            </button>
            <button onClick={() => setActivePage('network')} className={`flex-1 py-1 text-[11px] font-bold uppercase tracking-widest border-b-[2px] transition-colors ${activePage === 'network' ? 'text-[#DC1FFF] border-[#DC1FFF]' : 'text-[#444] border-transparent hover:text-[#aaa]'}`}>
              Network Traffic
            </button>
          </div>
          
          <div className="flex-1 overflow-hidden bg-[#000] flex flex-col">
            {activePage === 'scanner' ? (
              <div className="flex-1 overflow-y-auto p-1 font-mono text-[11px] leading-relaxed" ref={logContainerRef}>
                 {recentSeeds.length === 0 ? <div className="text-[#333] text-center mt-4">Waiting for engine...</div> : 
                   recentSeeds.map((item, idx) => (
                      <div key={item.uid} className="flex items-start text-[#555] break-words leading-tight py-[1px]">
                        <Search size={11} className="text-[#DC1FFF] mt-[1px] shrink-0 mr-1 opacity-70" />
                        <span className="opacity-80 hover:opacity-100 transition-opacity text-[#666]">{item.seed}</span>
                      </div>
                   ))
                 }
              </div>
            ) : (
              <div className="flex-1 flex flex-col font-mono text-[11px] leading-relaxed overflow-hidden">
                 <div className="flex-1 overflow-y-auto p-1 border-b border-[#DC1FFF]/20" ref={reqLogContainerRef}>
                    {networkLogs.filter(l => l.msg.includes('[REQ]')).length === 0 ? <div className="text-[#333] text-center mt-4">No requests...</div> : 
                      networkLogs.filter(log => log.msg.includes('[REQ]')).map((log) => {
                        const formattedMsg = log.msg.replace('[REQ]', '').trim();
                        return (
                           <div key={log.uid} className="flex text-[11px] break-all opacity-80 hover:opacity-100 py-[1px] text-[#14F195]/90">
                             <span className="text-[#444] mr-2 shrink-0">{new Date(log.time).toISOString().substring(14, 23)}</span>
                             <span className="text-[#555] mr-1">[REQ]</span>
                             <span>{formattedMsg}</span>
                           </div>
                        )
                      })
                    }
                 </div>
                 <div className="flex-1 overflow-y-auto p-1 bg-[#050005]" ref={resLogContainerRef}>
                    {networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length === 0 ? <div className="text-[#333] text-center mt-4">No responses...</div> : 
                      networkLogs.filter(log => log.msg.includes('[RES]') || log.msg.includes('[ERR]')).map((log) => {
                        const isErr = log.msg.includes('[ERR]');
                        const formattedMsg = log.msg.replace('[RES]', '').replace('[ERR]', '').trim();
                        return (
                           <div key={log.uid} className={`flex text-[11px] break-all opacity-80 hover:opacity-100 py-[1px] ${isErr ? 'text-red-500/80' : 'text-[#DC1FFF]/90'}`}>
                             <span className="text-[#444] mr-2 shrink-0">{new Date(log.time).toISOString().substring(14, 23)}</span>
                             <span className={`mr-1 ${isErr ? 'text-red-500' : 'text-[#DC1FFF]'}`}>[{isErr ? 'ERR' : 'RES'}]</span>
                             <span>{formattedMsg}</span>
                           </div>
                        )
                      })
                    }
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="border-t border-b border-[#222] bg-[#020202] py-1 flex items-center justify-between px-2 shrink-0">
           <div className="flex items-center gap-1.5 text-white">
             <Activity size={14} className="text-[#14F195]" />
             <span className="font-bold text-[13px]">{scanSpeed.toLocaleString()} <span className="text-[#555] text-[11px] font-normal font-sans">w/s</span></span>
             <span className="font-bold text-[13px] ml-1">{resSpeed.toLocaleString()} <span className="text-[#555] text-[11px] font-normal font-sans">res/s</span></span>
           </div>
           <div className="flex items-center gap-1.5 text-white">
             <Key size={14} className="text-[#DC1FFF] transform -rotate-45" />
             <span className="font-bold text-[13px]">{checked.toLocaleString()}</span>
           </div>
           <div className="flex items-center gap-1.5 text-white">
             <div className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[#14F195] bg-transparent"></div>
             <span className="font-bold text-[13px]">${totalValue.toFixed(2)}</span>
           </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2 p-1.5 bg-[#020202] shrink-0">
           {isScanning ? (
              <button onClick={stopScanning} className="flex-1 bg-[#220000] border border-[#550000] text-[#ff4444] h-11 rounded flex items-center justify-center gap-2 font-black text-[14px] tracking-widest uppercase hover:bg-[#330000] transition-colors drop-shadow-md">
                <Square size={14} fill="currentColor" /> STOP
              </button>
           ) : (
              <button onClick={startScanning} disabled={rpcs.length === 0} className="flex-1 bg-[#001a0d] border border-[#00331a] text-[#14F195] h-11 rounded flex items-center justify-center gap-2 font-black text-[14px] tracking-widest uppercase hover:bg-[#00331a] transition-colors disabled:opacity-50 disabled:border-[#333] disabled:text-[#555] drop-shadow-md">
                <Play size={14} fill="currentColor" /> START
              </button>
           )}
           <div className="w-[100px] bg-[#000] border border-[#111] rounded flex items-center justify-center text-[#14F195] font-mono text-[15px] font-bold shrink-0 shadow-inner">
              {formatTime(timeElapsed)}
           </div>
        </div>

        {/* Found Assets */}
        <div className="bg-[#050505] min-h-[150px] max-h-[200px] flex flex-col shrink-0">
           <div className="p-2 border-b border-[#222] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#fff]">
                 <CheckCircle2 size={14} className="text-[#14F195]" />
                 <h2 className="text-[12px] font-bold tracking-widest uppercase">Found Assets</h2>
              </div>
              <span className="text-[#14F195] text-[12px] font-mono font-bold bg-[#14F195]/10 px-2 py-0.5 rounded">{found.length}</span>
           </div>
           
           <div className="flex-1 overflow-y-auto p-2">
             {found.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-[#333] gap-2 pt-4">
                 <div className="w-16 h-12 border-2 border-[#14F195]/20 rounded flex items-center justify-center text-[#14F195]/20 relative">
                   <div className="w-6 h-1.5 bg-[#14F195]/20 rounded-r absolute left-8 top-5"></div>
                 </div>
                 <div className="text-[12px] font-bold tracking-widest uppercase text-[#14F195]/30">No Matching Keys</div>
               </div>
             ) : (
               <div className="space-y-2">
                  <div className="flex justify-end mb-2">
                     <button onClick={exportFoundWallets} className="text-[#14F195] bg-[#14F195]/10 border border-[#14F195]/30 px-3 py-1 rounded text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                       <Download size={12} /> Export
                     </button>
                  </div>
                  {found.map((item, i) => {
                     const d = new Date(item.timestamp);
                     return (
                       <div key={i} className="border border-[#222] bg-[#0A0A0A] p-3 rounded-lg relative">
                         <button onClick={() => removeWallet(i)} className="absolute top-2 right-2 text-[#555] hover:text-[#ff4444] p-1"><Trash2 size={14}/></button>
                         <div className="text-[#14F195] font-bold text-[14px] mb-1">+${item.totalValue.toFixed(2)}</div>
                         <div className="text-[#aaa] text-[12px] font-mono break-all mb-2">{item.seed}</div>
                         <div className="flex justify-between items-center bg-[#050505] p-1.5 rounded border border-[#111]">
                            <span className="text-[10px] text-[#555] font-mono truncate mr-2">{item.addresses?.solana || 'N/A'}</span>
                            <span className="text-[11px] text-[#14F195] shrink-0 font-bold">{item.balances?.SOL || item.balances?.sol?.amount?.toFixed(4) || "0.00"} SOL</span>
                         </div>
                       </div>
                     )
                  })}
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
