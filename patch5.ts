import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const returnRegex = /return \(\s*<div className="h-\[100dvh\][\s\S]*?\);\n}/;

const newReturn = `return (
    <div className="h-[100dvh] w-full bg-[#050505] text-gray-300 font-sans flex flex-col overflow-hidden">
      
      {/* Top Header */}
      <header className="h-[60px] md:h-[70px] shrink-0 bg-[#020202] border-b border-[#222] flex items-center justify-between px-3 md:px-6 relative z-10 shadow-md">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00FFA3] to-transparent opacity-20"></div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="relative flex items-center justify-center p-1.5 md:p-2 bg-[#111] rounded-lg border border-[#333]">
             <Activity className="text-[#00FFA3] w-4 h-4 md:w-5 md:h-5" />
             {isScanning && <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#00FFA3] rounded-full animate-ping"></div>}
          </div>
          <h1 className="text-[14px] md:text-[20px] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#00FFA3] to-[#DC1FFF] tracking-widest uppercase truncate hidden sm:block">
            SolScanner
          </h1>
        </div>
        
        {/* Navigation Tabs - Only 2 tabs now */}
        <div className="flex items-center gap-1 md:gap-2 bg-[#0A0A0A] p-1 rounded-lg border border-[#222]">
          <button onClick={() => setActivePage('scanner')} className={\`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-[10px] md:text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-1 md:gap-2 \${activePage === 'scanner' ? 'bg-[#111] text-[#00FFA3] shadow-sm border border-[#333]' : 'text-[#666] hover:text-[#aaa] border border-transparent'}\`}>
            <Activity size={14} className="hidden sm:block" /> Scanner
          </button>
          <button onClick={() => setActivePage('network')} className={\`px-3 py-1.5 md:px-4 md:py-2 rounded-md text-[10px] md:text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-1 md:gap-2 \${activePage === 'network' ? 'bg-[#111] text-white shadow-sm border border-[#333]' : 'text-[#666] hover:text-[#aaa] border border-transparent'}\`}>
            <Wifi size={14} className="hidden sm:block" /> Network
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative w-full">
      
        {/* PAGE 1: SCANNER */}
        {activePage === 'scanner' && (
          <div className="absolute inset-0 flex flex-col h-full overflow-y-auto p-2 md:p-4 gap-3 md:gap-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505]">
            
            {/* 1. SEEDPHRASE SCREEN (Live Buffer) */}
            <div className="h-[200px] md:h-[280px] shrink-0 border border-[#222] rounded-xl bg-[#030303] flex flex-col relative overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
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
                    <button onClick={startScanning} disabled={rpcs.length === 0} className={\`h-10 md:h-12 px-6 \${rpcs.length === 0 ? 'bg-[#111] text-[#444] border-[#222]' : 'bg-[#002211] text-[#00FFA3] border-[#00FFA3]/30 hover:bg-[#00FFA3]/10 shadow-[0_0_15px_rgba(0,255,163,0.1)]'} text-xs font-bold border rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2 shrink-0\`}>
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
            <div className="flex-1 flex flex-col border border-[#222] rounded-xl bg-[#020202] shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden min-h-[300px]">
               <div className="h-10 md:h-12 border-b border-[#111] bg-[#0A0A0A] flex items-center px-4 justify-between shrink-0">
                 <h2 className="text-[10px] md:text-[11px] text-[#DC1FFF] font-bold uppercase tracking-widest flex items-center gap-2">
                   <CheckCircle2 size={12} className="text-[#DC1FFF]" /> Found ({found.length})
                 </h2>
                 <div className="flex items-center gap-3">
                   <span className="text-[#00FFA3] font-mono text-[10px] md:text-xs font-bold">\${totalValue.toFixed(2)}</span>
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
                               +\${item.totalValue.toFixed(2)}
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
          <div className="absolute inset-0 flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden p-2 md:p-4 gap-3 md:gap-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505]">
            <div className="w-full md:w-[280px] border border-[#222] rounded-xl bg-[#020202] flex flex-col shrink-0 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <div className="p-3 md:p-4 border-b border-[#111] bg-[#0A0A0A]">
                   <h2 className="text-[9px] md:text-[10px] text-[#777] font-bold tracking-widest uppercase mb-3 flex items-center gap-2"><Wifi size={14} className="text-[#00FFA3]" /> Add Node</h2>
                   <div className="flex gap-2">
                      <input type="text" value={newRpc} onChange={(e) => setNewRpc(e.target.value)} placeholder="https://..." className="flex-1 min-w-0 bg-[#050505] border border-[#333] text-[10px] h-10 px-3 rounded-lg text-white focus:border-[#00FFA3] transition-colors outline-none font-mono" disabled={isScanning || isAddingRpc} />
                      <button onClick={addRpc} disabled={!newRpc || isScanning || isAddingRpc} className="bg-[#111] border border-[#333] h-10 px-4 rounded-lg text-[10px] font-bold text-white hover:bg-[#222] disabled:opacity-50 transition-colors uppercase tracking-widest shrink-0">
                        {isAddingRpc ? '...' : 'Add'}
                      </button>
                   </div>
               </div>

               <div className="flex-1 p-3 overflow-y-auto bg-[#050505]">
                 <div className="flex justify-between items-center mb-3">
                   <h2 className="text-[9px] text-[#555] font-bold tracking-widest uppercase">Routing Table</h2>
                   <span className="text-[9px] text-[#444] font-mono">{rpcs.length} Nodes</span>
                 </div>
                 <div className="space-y-2">
                   {rpcs.map((rpc, i) => {
                      const stat = rpcStatus[rpc];
                      return (
                        <div key={i} className="border border-[#222] bg-[#0A0A0A] p-2.5 rounded-xl relative group flex flex-col hover:border-[#333] transition-colors">
                           <div className="flex items-center justify-between mb-1.5">
                             <div className="flex items-center gap-2">
                               <div className={\`w-2 h-2 rounded-full \${stat?.status === 'connected' ? 'bg-[#00FFA3] shadow-[0_0_5px_#00FFA3]' : stat?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}\`}></div>
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
               </div>
            </div>
            
            <div className="flex-1 flex flex-col gap-3 md:gap-4 min-h-[400px] md:min-h-0">
               <div className="flex-1 flex flex-col border border-[#222] rounded-xl bg-[#030303] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative">
                  <div className="h-10 bg-[#0A0A0A] border-b border-[#111] flex items-center justify-between px-4">
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
               
               <div className="flex-1 flex flex-col border border-[#222] rounded-xl bg-[#030303] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative">
                  <div className="h-10 bg-[#0A0A0A] border-b border-[#111] flex items-center justify-between px-4">
                    <span className="text-[#DC1FFF] text-[9px] tracking-widest font-bold uppercase flex items-center gap-2"><Database size={12}/> RX Inbound</span>
                    <span className="text-[#555] text-[10px] font-mono">{networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length} Pkts</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col justify-end">
                    <div className="space-y-1">
                      {networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length === 0 ? <div className="text-center text-[#333] text-[10px] uppercase tracking-widest">No rx inbound</div> : 
                        networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).map(log => (
                          <div key={log.uid} className={\`text-[10px] font-mono break-all pl-2 border-l-2 py-0.5 \${log.msg.includes('[ERR]') ? 'text-red-500/70 border-red-500/30' : 'text-[#DC1FFF]/60 border-[#DC1FFF]/30'}\`}>
                            {log.msg.replace('[RES] ', '<- ').replace('[ERR] ', '! ')}
                          </div>
                        ))
                      }
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
`;

content = content.replace(returnRegex, newReturn);
fs.writeFileSync('src/App.tsx', content);
