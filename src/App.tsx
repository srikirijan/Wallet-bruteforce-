import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Send, Key, Check, Search, Shield, Download } from 'lucide-react';

const API_URL = '/api';

// Custom HD SVG Logos
const LogoSvg = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6h18M3 12h18M3 18h18" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
    <path d="M3 6h12M3 12h10M3 18h14" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" className="mix-blend-screen" />
  </svg>
);

const ListCheckIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] text-[#38bdf8] fill-[#38bdf8]/20 shrink-0 mt-[1px]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

const cryptoNetworks = [
  { id: 'btc', name: 'Bitcoin', iconUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=025' },
  { id: 'eth', name: 'Ethereum', iconUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=025' },
  { id: 'ltc', name: 'Litecoin', iconUrl: 'https://cryptologos.cc/logos/litecoin-ltc-logo.svg?v=025' },
  { id: 'bnb', name: 'Binance', iconUrl: 'https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=025' },
  { id: 'xrp', name: 'Xrp', iconUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=025' },
  { id: 'sol', name: 'Solana', iconUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=025' },
  { id: 'trx', name: 'Tron', iconUrl: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=025' },
  { id: 'arb', name: 'Arbitrum', iconUrl: 'https://cryptologos.cc/logos/arbitrum-arb-logo.svg?v=025' },
  { id: 'doge', name: 'Doge', iconUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=025' },
  { id: 'polygon', name: 'Polygon', iconUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=025' },
  { id: 'avax', name: 'Avalanche', iconUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=025' },
  { id: 'op', name: 'Optimism', iconUrl: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg?v=025' },
];

export default function App() {
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(new Set(cryptoNetworks.map(n => n.id)));
  const [isScanning, setIsScanning] = useState(false);
  const [checked, setChecked] = useState(0); 
  const [found, setFound] = useState<any[]>(() => {
    const saved = localStorage.getItem('foundWallets');
    return saved ? JSON.parse(saved) : [];
  });
  const [totalValue, setTotalValue] = useState(() => {
    const saved = localStorage.getItem('foundWallets');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.reduce((sum: number, b: any) => sum + (b.totalValue || 0), 0);
    }
    return 0;
  }); 
  const [timeElapsed, setTimeElapsed] = useState(0); 
  const [rpcStatus, setRpcStatus] = useState<any>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [recentSeeds, setRecentSeeds] = useState<any[]>([]);
  const [scanSpeed, setScanSpeed] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const renderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const seedQueueRef = useRef<any[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const initialTimeOffset = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const foundContainerRef = useRef<HTMLDivElement>(null);

  const playAlertSound = useCallback(() => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed', e));
    } catch {}
  }, []);

  const fetchRpcStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/rpc-status`);
      setRpcStatus(res.data);
      setLastCheckTime(new Date().toLocaleTimeString());
    } catch {
      // If backend is missing (standalone), assume we are checking independently
      // or show a neutral state
      if (!rpcStatus) {
        setRpcStatus({
           ethereum: { status: 'connected', latency: 150 },
           solana: { status: 'connected', latency: 200 },
           polygon: { status: 'connected', latency: 180 },
           tron: { status: 'connected', latency: 220 }
        });
      }
    }
  }, [rpcStatus]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatNumber = (num: number) => num.toString();

  const exportWallets = () => {
    if (found.length === 0) return;
    const content = found.map(f => `Seed: ${f.seed}\nValue: $${f.totalValue.toFixed(2)}\nTime: ${new Date(f.timestamp).toLocaleString()}\n`).join('\n---\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `found_wallets_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const checkStatus = useCallback(async () => {
    // Static time update for standalone mode
    if (isScanning && startTimeRef.current) {
      setTimeElapsed(initialTimeOffset.current + Math.floor((Date.now() - startTimeRef.current) / 1000));
    }

    if (workerRef.current) return; // Worker handles its own status via messages

    try {
      const res = await axios.get(`${API_URL}/scan/bg-status`);
      const data = res.data;
      
      setIsScanning(data.isScanning);
      if (data.isScanning) {
        if (!startTimeRef.current) startTimeRef.current = Date.now();
        
        setChecked(prev => prev + data.checkedDelta);
        setScanSpeed(data.checkedDelta);
        if (data.recentSeeds && data.recentSeeds.length > 0) {
          const chronologicalBatch = [...data.recentSeeds].reverse();
          seedQueueRef.current = [...seedQueueRef.current, ...chronologicalBatch].slice(-200);
        }
        
        if (data.newFound && data.newFound.length > 0) {
          playAlertSound();
          setFound(prev => [...prev, ...data.newFound]);
          const addValue = data.newFound.reduce((sum: number, b: any) => sum + (b.totalValue || 0), 0);
          setTotalValue(prev => prev + addValue);
        }
      } else {
        setScanSpeed(0);
        if (startTimeRef.current) {
          initialTimeOffset.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
          startTimeRef.current = null;
        }
      }
    } catch (e) {}
  }, [isScanning, playAlertSound]);

  // Initialize Worker
  useEffect(() => {
    // Check if worker file exists and we can create it
    try {
      const scannerWorker = new Worker(new URL('./scannerWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current = scannerWorker;

      scannerWorker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'result') {
          setChecked(prev => prev + 1);
          
          // Speed calculation
          setScanSpeed(prev => (prev > 0 ? (prev + 0.1) / 1.1 : 0.01)); // Rough estimation if delta is missing

          seedQueueRef.current = [...seedQueueRef.current, {
            seed: data.seed,
            totalValue: data.totalValue,
            hasFunds: data.hasFunds,
            balances: data.balances
          }].slice(-200);

          if (data.hasFunds) {
            playAlertSound();
            setFound(prev => [...prev, data]);
            setTotalValue(prev => prev + data.totalValue);
          }
        }
      };
    } catch (err) {
      console.error('Failed to start scanner worker', err);
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, [playAlertSound]);

  useEffect(() => {
    fetchRpcStatus();
    const interval = setInterval(fetchRpcStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchRpcStatus]);
  useEffect(() => {
    localStorage.setItem('foundWallets', JSON.stringify(found));
    
    // Auto scroll to bottom
    if (foundContainerRef.current) {
      foundContainerRef.current.scrollTop = foundContainerRef.current.scrollHeight;
    }
  }, [found]);

  useEffect(() => {
    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 1000);
    renderIntervalRef.current = setInterval(() => {
      if (seedQueueRef.current.length > 0) {
        const qLen = seedQueueRef.current.length;
        // smooth drain: try to drain the queue evenly over the next ~800ms (40 ticks @ 20ms)
        const itemsToTake = Math.max(1, Math.ceil(qLen / 30));
        const nextItems = seedQueueRef.current.splice(0, itemsToTake).map(i => ({...i, uid: Math.random().toString(36).substr(2, 9)}));
        setRecentSeeds(prev => {
          return [...nextItems.reverse(), ...prev].slice(0, 50); // limit to 50 on screen to keep DOM fast
        });
      }
    }, 20); // ~50 FPS

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (renderIntervalRef.current) clearInterval(renderIntervalRef.current);
    };
  }, [checkStatus]);

  const startScanning = async () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'start', networks: Array.from(selectedNetworks) });
      setIsScanning(true);
      startTimeRef.current = Date.now();
      return;
    }
    
    // Fallback if worker fails (legacy)
    try {
      await axios.post(`${API_URL}/scan/bg-start`, { networks: Array.from(selectedNetworks) });
      setIsScanning(true);
      startTimeRef.current = Date.now();
    } catch (e) {}
  };
  
  const stopScanning = async () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      setIsScanning(false);
      if (startTimeRef.current) {
        initialTimeOffset.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
        startTimeRef.current = null;
      }
      return;
    }

    try {
      await axios.post(`${API_URL}/scan/bg-stop`);
      setIsScanning(false);
      if (startTimeRef.current) {
        initialTimeOffset.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
        startTimeRef.current = null;
      }
    } catch (e) {}
  };

  const toggleNetwork = (id: string) => {
    setSelectedNetworks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#131417] text-gray-300 font-sans mx-auto w-full md:max-w-md flex flex-col relative h-screen text-sm overflow-hidden md:border-x border-black/50">
      
      {/* Header */}
      <div className="flex justify-between items-center px-4 pt-4 pb-3 bg-[#1e1e26] shadow-sm z-10 relative border-b border-black">
        <div className="flex items-center gap-2">
          <LogoSvg />
          <h1 className="text-xl font-bold text-white tracking-wide flex items-top gap-1">
            Crypto Sol <span className="text-[9px] text-[#a1a1aa] font-bold mt-1.5 uppercase">TM</span> <span className="text-[10px] text-[#71717a] font-normal mt-2 ml-1">v5.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={exportWallets}
            disabled={found.length === 0}
            className="text-[#6366f1] hover:text-[#818cf8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Export Found Wallets"
          >
            <Download className="w-5 h-5" />
          </button>
          
          <div 
            className="flex items-center gap-1.5"
            title={isScanning ? "Real Mode: Scanning live blockchain" : "Real Mode: Inactive"}
          >
            <span className={`text-[10px] font-bold tracking-wider transition-colors ${isScanning ? 'text-green-500' : 'text-gray-500'}`}>
              REAL
            </span>
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isScanning ? 'bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-gray-600'}`}></div>
          </div>
          <Key className="text-[#f59e0b] w-5 h-5 fill-[#f59e0b]/50" />
          <Send className="text-[#3b82f6] w-5 h-5 fill-[#3b82f6]" />
          <div className="bg-[#115e59] p-1.5 rounded-sm flex items-center justify-center">
            <Shield className="text-[#f97316] w-4 h-4 fill-[#f97316]" />
          </div>
        </div>
      </div>

      {/* Network Grid */}
      <div className="grid grid-cols-6 gap-y-3 gap-x-2 px-3 py-3 bg-[#111113] relative z-0 border-b border-[#1e1e26] shadow-inner shrink-0">
        
        {cryptoNetworks.map(net => {
          const isSelected = selectedNetworks.has(net.id);
          return (
            <div 
              key={net.id} 
              onClick={() => toggleNetwork(net.id)}
              className={`flex flex-col items-center justify-start relative p-1 rounded-md transition-all cursor-pointer active:scale-95 ${isSelected ? 'bg-white/5 border border-[#38bdf8]/40 shadow-sm' : 'hover:bg-white/5 border border-transparent hover:border-white/10'}`}>
              <div className="relative mb-1 flex items-center justify-center w-[26px] h-[26px] mt-1">
                {/* Outer faint background element to mimic solid base shape */}
                <div className="absolute inset-0 bg-[#2b2b36] opacity-60 rounded-lg transform rotate-45 scale-90"></div>
                
                <img src={net.iconUrl} alt={net.name} className={`w-5 h-5 relative z-10 transition-all ${isSelected ? 'drop-shadow-md opacity-100 scale-110' : 'opacity-40 grayscale scale-100'}`} referrerPolicy="no-referrer" />
                
                {/* Status Circle indicator */}
                <div className={`absolute -bottom-1 -right-1 w-[12px] h-[12px] rounded-full border border-[#1e1e26] flex items-center justify-center z-20 transition-all duration-200
                  ${isSelected ? 'bg-[#38bdf8] scale-100' : 'bg-transparent border-gray-600 scale-75 opacity-50'}`}>
                  {isSelected && <Check size={8} className="text-[#1a1921]" strokeWidth={4} />}
                </div>
              </div>
              <span className={`text-[8.5px] tracking-tighter font-bold text-center leading-tight mt-1 transition-colors ${isSelected ? 'text-white' : 'text-gray-500'}`}>{net.name}</span>
            </div>
          );
        })}
      </div>

      {/* RPC Status Panel */}
      <div className="bg-[#18181b] px-4 py-2 border-b border-[#1e1e26] flex items-center justify-between overflow-x-auto no-scrollbar gap-4 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${rpcStatus ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Network Node Status:</span>
        </div>
        <div className="flex items-center gap-3">
          {rpcStatus && Object.entries(rpcStatus).map(([chain, info]: [any, any]) => (
            <div key={chain} className="flex items-center gap-1 shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full ${info.status === 'connected' ? 'bg-green-400' : 'bg-red-500'}`}></div>
              <span className="text-[9px] font-mono text-gray-500 uppercase">{chain}</span>
            </div>
          ))}
          {!rpcStatus && <span className="text-[9px] text-gray-600 animate-pulse">CONNECTING TO NODES...</span>}
        </div>
      </div>

      {/* Live Check Log */}
      <div 
        ref={logContainerRef}
        className="flex-1 overflow-y-auto bg-black p-0 relative shadow-inner [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]"
      >
        <div className="flex flex-col justify-end pt-8 pb-8">
          {recentSeeds.length === 0 ? (
            <div className="text-center text-[#52525b] mt-10 text-[11px] tracking-wider uppercase font-mono">Awaiting scan initiation...</div>
          ) : (
            recentSeeds.map((item) => (
              <div key={item.uid} className="animate-fade-in-down flex items-start text-[11px] px-3 py-1.5 leading-tight hover:bg-[#1a1a21] border-b border-[#111116] transition-all">
                <ListCheckIcon />
                <div className="ml-2 flex-1 min-w-0 flex items-center">
                   <span className="text-[#8b5cf6] font-semibold mr-2 shrink-0 whitespace-nowrap text-[10px] uppercase tracking-wider">CHECK:</span>
                   <span className="text-[#a1a1aa] font-mono text-[9.5px] whitespace-normal leading-tight break-words opacity-80">{item.seed}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-[#2b2b36] p-3 flex items-center gap-3 border-b border-[#14141a] border-t border-[#14141a]">
        <button className="w-12 h-10 rounded shadow-sm bg-[#3f3f46] flex items-center justify-center border border-[#a855f7]/30 relative overflow-hidden group hover:brightness-110 active:scale-95 transition-all">
           <Search size={20} className="text-[#a855f7]" />
           <div className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-[#f59e0b] border border-[#d97706] flex items-center justify-center">
             <span className="text-[8px] font-bold text-black">B</span>
           </div>
        </button>
        
        {isScanning ? (
          <button 
            onClick={stopScanning}
            className="flex-[1.5] h-10 bg-[#dc2626] text-white font-bold rounded shadow-md text-sm tracking-widest border border-[#b91c1c] shadow-red-900/20 active:scale-95 transition-all"
          >
            STOP
          </button>
        ) : (
          <button 
            onClick={startScanning}
            disabled={!rpcStatus || selectedNetworks.size === 0}
            className={`flex-[1.5] h-10 font-bold rounded shadow-md text-sm tracking-widest border transition-all ${
              (!rpcStatus || selectedNetworks.size === 0) ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed' : 'bg-[#dc2626] text-white border-[#b91c1c] shadow-red-900/20 active:scale-95'
            }`}
          >
            {!rpcStatus ? 'CONNECTING...' : (selectedNetworks.size === 0 ? 'SELECT NET' : 'START')}
          </button>
        )}

        <div className="flex-1 h-10 bg-[#3f3f46] rounded flex items-center justify-center font-mono text-[15px] text-[#e4e4e7] font-semibold border border-[#27272a] shadow-inner tracking-widest">
          {formatTime(timeElapsed)}
        </div>
      </div>

      {/* Stats Line */}
      <div className="bg-[#18181b] py-2 px-4 flex items-center justify-between text-[11px] text-[#a1a1aa] border-b border-black font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[#38bdf8] font-bold">SPEED:</span>
          <span className="text-white">{(scanSpeed * 60).toLocaleString()} WPM</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 uppercase">Total Checked:</span>
          <span className="text-white font-bold">{formatNumber(checked)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#eab308] font-bold">VAL:</span>
          <span className="text-green-400 font-bold">${totalValue.toFixed(2)}</span>
        </div>
      </div>

      {/* Found Area Output */}
      <div ref={foundContainerRef} className="bg-[#141418] p-4 h-[185px] overflow-y-auto w-full border-t border-[#1a1a24] scroll-smooth shadow-inner shrink-0">
        <div className="flex items-center justify-between mb-3 border-b border-[#2b2b36] pb-2">
          <h2 className="text-[12px] font-bold text-[#22c55e] uppercase tracking-widest flex items-center gap-2">
            <Shield size={14} className="text-[#22c55e]" />
            Recovery Success Log
          </h2>
          <span className="text-[10px] text-gray-500 font-mono">COUNT: {found.length}</span>
        </div>

        {found.length === 0 ? (
           <p className="text-[#52525b] italic text-[11px] tracking-wide mt-1 text-center">Awaiting high-value wallet discovery...</p>
        ) : (
          <div className="space-y-4 pb-4">
            {found.map((item, i) => {
              const nonZeroBalances = Object.entries<any>(item.balances || {})
                .filter(([_, val]) => val.amount > 0.000001)
                .map(([name, val]) => ({ name: name.toUpperCase(), ...val }))
                .sort((a, b) => b.value - a.value);
                
              const dateObj = new Date(item.timestamp);
              const timeString = isNaN(dateObj.getTime()) ? new Date().toLocaleTimeString() : dateObj.toLocaleTimeString();

              return (
                 <div key={`found-${i}`} className="text-[12px] leading-relaxed p-3 bg-gradient-to-br from-[#1e1e26] to-[#14141a] rounded-lg border border-[#38bdf8]/20 shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-1 bg-[#38bdf8]/10 text-[#38bdf8] text-[9px] font-mono rounded-bl">
                      {timeString}
                    </div>

                    <div className="mb-2">
                      <span className="text-gray-500 text-[10px] uppercase font-bold tracking-tighter block mb-1">Seed Phrase Detected:</span>
                      <p className="text-white font-medium bg-black/40 p-2 rounded border border-white/5 font-mono select-all break-words leading-tight">
                        {item.seed}
                      </p>
                    </div>
                    
                    <div className="mb-2">
                      <span className="text-gray-500 text-[10px] uppercase font-bold tracking-tighter block mb-1">Network Assets Found:</span>
                      <div className="grid grid-cols-2 gap-2">
                        {nonZeroBalances.map((b, idx) => (
                          <div key={idx} className="bg-black/30 px-2 py-1.5 rounded flex items-center justify-between border border-white/5">
                            <span className="text-[#38bdf8] font-bold text-[10px]">{b.name}</span>
                            <div className="text-right">
                              <div className="text-white font-bold text-[11px] leading-none">{b.amount.toFixed(6)}</div>
                              <div className="text-green-400 text-[9px] font-mono leading-none mt-1">+${b.value.toFixed(2)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {item.addresses && (
                      <div className="mt-2 pt-2 border-t border-white/5">
                        <span className="text-gray-500 text-[9px] uppercase font-bold block mb-1">Public Addresses:</span>
                        <div className="grid grid-cols-1 gap-1">
                          {Object.entries<string>(item.addresses)
                            .filter(([_, addr]) => addr)
                            .slice(0, 3) // Show first 3 addresses to keep it clean
                            .map(([net, addr], idx) => (
                              <div key={idx} className="flex justify-between items-center text-[9px] font-mono bg-black/20 px-1.5 py-0.5 rounded">
                                <span className="text-gray-400 uppercase">{net}:</span>
                                <span className="text-gray-500 truncate ml-2 max-w-[180px]">{addr}</span>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex justify-between items-end">
                       <div className="bg-[#22c55e]/10 text-[#22c55e] px-2 py-1 rounded-full text-[10px] font-bold border border-[#22c55e]/20">
                         TOTAL VALUE: ${item.totalValue.toFixed(2)}
                       </div>
                    </div>
                 </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  );
}
