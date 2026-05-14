import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const returnRegex = /return \(\s*<div className="h-\[100dvh\][\s\S]*?\);\n}/;

const newReturn = `return (
    <div className="h-[100dvh] w-full bg-[#050505] text-[#888] font-mono flex flex-col overflow-hidden selection:bg-[#DC1FFF]/30">
      
      {/* Top Bar - Bloomberg/Terminal Style */}
      <header className="h-[40px] shrink-0 bg-[#000] border-b border-[#222] flex items-center justify-between px-3 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#00FFA3] font-bold text-[12px] tracking-widest uppercase">SYS.SOL.SCAN//</span>
            <div className={\`w-1.5 h-1.5 rounded-full \${isScanning ? 'bg-[#00FFA3] animate-pulse shadow-[0_0_8px_rgba(0,255,163,0.8)]' : 'bg-[#444]'}\`}></div>
            <span className="text-[10px] uppercase ml-1 hidden sm:inline">{isScanning ? 'ACTIVE' : 'STANDBY'}</span>
          </div>
          <div className="h-4 w-px bg-[#222] hidden md:block"></div>
          <div className="hidden md:flex items-center gap-4 text-[10px]">
            <span className="flex items-[base] gap-1"><span className="text-[#555]">RATE:</span><span className="text-white">{scanSpeed.toLocaleString()} w/s</span></span>
            <span className="flex items-[base] gap-1"><span className="text-[#555]">CHK:</span><span className="text-white">{checked.toLocaleString()}</span></span>
            <span className="flex items-[base] gap-1"><span className="text-[#555]">VAL:</span><span className="text-[#00FFA3]">\${totalValue.toFixed(2)}</span></span>
            <span className="flex items-[base] gap-1"><span className="text-[#555]">UPTIME:</span><span className="text-white">{formatTime(timeElapsed)}</span></span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <nav className="flex items-center h-[40px]">
            <button onClick={() => setActivePage('scanner')} className={\`h-full px-2 sm:px-4 text-[10px] uppercase font-bold transition-all border-b-2 \${activePage === 'scanner' ? 'text-[#00FFA3] border-[#00FFA3] bg-[#111]' : 'text-[#666] border-transparent hover:text-white hover:bg-[#0A0A0A]'}\`}>[01] ENGINE</button>
            <button onClick={() => setActivePage('network')} className={\`h-full px-2 sm:px-4 text-[10px] uppercase font-bold transition-all border-b-2 \${activePage === 'network' ? 'text-[#DC1FFF] border-[#DC1FFF] bg-[#111]' : 'text-[#666] border-transparent hover:text-white hover:bg-[#0A0A0A]'}\`}>[02] NET</button>
            <button onClick={() => setActivePage('recoveries')} className={\`h-full px-2 sm:px-4 text-[10px] uppercase font-bold transition-all border-b-2 \${activePage === 'recoveries' ? 'text-white border-white bg-[#111]' : 'text-[#666] border-transparent hover:text-white hover:bg-[#0A0A0A]'}\`}>[03] REC</button>
          </nav>
        </div>
      </header>

      {/* Main Content Areas */}
      <main className="flex-1 overflow-hidden relative w-full bg-[#030303]">
      
        {/* PAGE 1: ENGINE */}
        {activePage === 'scanner' && (
          <div className="absolute inset-0 flex flex-col md:flex-row h-full">
            {/* Control Column */}
            <div className="w-full md:w-[300px] border-b md:border-b-0 md:border-r border-[#222] bg-[#050505] flex flex-col shrink-0">
               <div className="p-4 border-b border-[#222]">
                  <div className="text-[10px] text-[#555] mb-2 uppercase tracking-widest hidden md:block">Process Control</div>
                  <div className="flex md:hidden items-center gap-4 text-[10px] mb-4 overflow-x-auto no-scrollbar pb-2">
                    <span className="flex items-[base] gap-1 shrink-0"><span className="text-[#555]">RATE:</span><span className="text-white">{scanSpeed.toLocaleString()} w/s</span></span>
                    <span className="flex items-[base] gap-1 shrink-0"><span className="text-[#555]">CHK:</span><span className="text-white">{checked.toLocaleString()}</span></span>
                    <span className="flex items-[base] gap-1 shrink-0"><span className="text-[#555]">VAL:</span><span className="text-[#00FFA3]">\${totalValue.toFixed(2)}</span></span>
                  </div>
                  <div className="flex gap-2">
                    {isScanning ? (
                      <button onClick={stopScanning} className="flex-1 h-10 bg-red-900/30 text-red-500 text-[11px] font-bold border border-red-900/50 hover:bg-red-900/50 transition-colors uppercase tracking-widest flex items-center justify-center gap-2">
                        <Square size={12} fill="currentColor" /> TERMINATE
                      </button>
                    ) : (
                      <button onClick={startScanning} disabled={rpcs.length === 0} className={\`flex-1 h-10 \${rpcs.length === 0 ? 'bg-[#111] text-[#444] border-[#222]' : 'bg-[#00FFA3]/10 text-[#00FFA3] border-[#00FFA3]/30 hover:bg-[#00FFA3]/20 hover:border-[#00FFA3]/50'} text-[11px] font-bold border transition-colors uppercase tracking-widest flex items-center justify-center gap-2\`}>
                        <Play size={12} fill="currentColor" /> INITIATE
                      </button>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-[#777] mb-2 uppercase">
                      <span>Thread Count (Intensity)</span>
                      <span className="text-white">{scanIntensity}</span>
                    </div>
                    <input type="range" min="1" max="200" value={scanIntensity} onChange={(e) => setScanIntensity(Number(e.target.value))} disabled={isScanning} className="w-full h-[2px] bg-[#333] appearance-none accent-[#00FFA3]" />
                  </div>
               </div>
               
               <div className="flex-1 p-4 overflow-y-auto min-h-[150px]">
                 <div className="text-[10px] text-[#555] mb-3 uppercase tracking-widest">Active Endpoints ({rpcs.length})</div>
                 <div className="space-y-2">
                    {rpcs.length === 0 && <div className="text-[10px] text-red-500 border border-red-900/50 bg-red-900/10 p-2 uppercase">ERR: No route to host. Add RPC nodes in NET tab.</div>}
                    {rpcs.map((rpc, i) => {
                      const stat = rpcStatus[rpc];
                      return (
                        <div key={i} className="text-[10px] flex items-center justify-between border border-[#222] bg-[#000] p-2">
                           <div className="flex items-center gap-2 overflow-hidden">
                             <div className={\`w-1.5 h-1.5 rounded-full shrink-0 \${stat?.status === 'connected' ? 'bg-[#00FFA3]' : stat?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}\`}></div>
                             <span className="truncate text-[#aaa]">{rpc.replace(/^https?:\\/\\//, '')}</span>
                           </div>
                           {stat?.latency && <span className="text-[#00FFA3] shrink-0 ml-2">{stat.latency}ms</span>}
                        </div>
                      )
                    })}
                 </div>
               </div>
            </div>

            {/* Terminal output */}
            <div className="flex-1 flex flex-col bg-[#010101] relative min-h-[300px]">
              <div className="absolute top-0 left-0 w-full p-2 bg-[#000] border-b border-[#111] z-10 flex text-[9px] uppercase tracking-widest text-[#555]">
                <div className="w-[40px]">ID</div>
                <div className="flex-1">Mnemonic Vector</div>
                <div className="w-[60px] text-right">State</div>
              </div>
              <div className="absolute inset-0 pt-8 p-4 overflow-y-auto" ref={logContainerRef}>
                <div className="space-y-1 font-mono text-[11px]">
                  {recentSeeds.length === 0 ? (
                    <div className="text-center text-[#333] uppercase mt-4">Awaiting input...</div>
                  ) : (
                    recentSeeds.map((item, idx) => (
                      <div key={item.uid} className="flex border-b border-[#111]/50 hover:bg-[#050505] py-0.5 group">
                        <div className="w-[40px] text-[#444]">{(checked - recentSeeds.length + idx + 1).toString().padStart(6, '0')}</div>
                        <div className="flex-1 text-[#888] truncate break-all group-hover:text-white transition-colors">{item.seed}</div>
                        <div className="w-[60px] text-right text-[#444]">NUL</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2: NETWORK */}
        {activePage === 'network' && (
          <div className="absolute inset-0 flex flex-col md:flex-row h-full">
            <div className="w-full md:w-[350px] border-b md:border-b-0 md:border-r border-[#222] bg-[#050505] flex flex-col shrink-0 p-4">
               <div className="text-[10px] text-[#555] mb-2 uppercase tracking-widest">Add Endpoint</div>
               <div className="flex gap-2 mb-4">
                  <input type="text" value={newRpc} onChange={(e) => setNewRpc(e.target.value)} placeholder="https://" className="flex-1 min-w-0 bg-[#000] border border-[#333] text-[11px] h-8 px-2 text-white focus:border-[#DC1FFF] focus:outline-none" disabled={isScanning || isAddingRpc} />
                  <button onClick={addRpc} disabled={!newRpc || isScanning || isAddingRpc} className="bg-[#111] border border-[#333] h-8 px-3 text-[10px] text-white hover:bg-[#222] disabled:opacity-50 uppercase shrink-0">
                    {isAddingRpc ? 'WAIT' : 'ADD'}
                  </button>
               </div>

               <div className="text-[10px] text-[#555] mb-2 uppercase tracking-widest mt-2">Routing Table</div>
               <div className="flex-1 overflow-y-auto space-y-2 min-h-[150px]">
                 {rpcs.map((rpc, i) => {
                    const stat = rpcStatus[rpc];
                    return (
                      <div key={i} className="text-[10px] border border-[#222] bg-[#000] p-2 relative group flex flex-col">
                         <div className="flex items-center gap-2 mb-1">
                           <div className={\`w-1.5 h-1.5 rounded-full shrink-0 \${stat?.status === 'connected' ? 'bg-[#00FFA3]' : stat?.status === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}\`}></div>
                           <span className="text-[#ccc] truncate">Node {i}</span>
                           <button onClick={() => removeRpc(rpc)} disabled={isScanning || rpcs.length <= 1} className="ml-auto text-[#444] hover:text-red-500 hidden group-hover:block uppercase text-[9px]"><Trash2 size={10} /></button>
                         </div>
                         <div className="text-[#666] truncate break-all">{rpc}</div>
                      </div>
                    )
                 })}
               </div>
            </div>
            
            <div className="flex-1 flex flex-col lg:flex-row bg-[#010101] overflow-hidden">
               <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-[#222] relative min-h-[200px]">
                  <div className="absolute top-0 left-0 right-0 py-1 px-2 bg-[#111] border-b border-[#222] text-[#00FFA3] text-[9px] uppercase z-10 opacity-70 flex justify-between">
                    <span>TX LOG</span>
                    <span>{networkLogs.filter(l => l.msg.includes('[REQ]')).length} pkts</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 pt-8 flex flex-col justify-end">
                    <div className="space-y-1">
                      {networkLogs.filter(l => l.msg.includes('[REQ]')).length === 0 ? <div className="text-center text-[#333] text-[10px] uppercase py-4">No outbound packets</div> : 
                        networkLogs.filter(l => l.msg.includes('[REQ]')).map(log => (
                          <div key={log.uid} className="text-[10px] text-[#00FFA3]/60 break-all border-l-2 border-[#00FFA3]/30 pl-2 py-0.5">
                            {log.msg.replace('[REQ] ', '> ')}
                          </div>
                        ))
                      }
                    </div>
                  </div>
               </div>
               <div className="flex-1 flex flex-col relative min-h-[200px]">
                  <div className="absolute top-0 left-0 right-0 py-1 px-2 bg-[#111] border-b border-[#222] text-[#DC1FFF] text-[9px] uppercase z-10 opacity-70 flex justify-between">
                    <span>RX LOG</span>
                    <span>{networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length} pkts</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 pt-8 flex flex-col justify-end">
                    <div className="space-y-1">
                      {networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).length === 0 ? <div className="text-center text-[#333] text-[10px] uppercase py-4">No inbound packets</div> : 
                        networkLogs.filter(l => l.msg.includes('[RES]') || l.msg.includes('[ERR]')).map(log => (
                          <div key={log.uid} className={\`text-[10px] break-all border-l-2 pl-2 py-0.5 \${log.msg.includes('[ERR]') ? 'text-red-500/80 border-red-500/50' : 'text-[#DC1FFF]/60 border-[#DC1FFF]/30'}\`}>
                            {log.msg.replace('[RES] ', '< ').replace('[ERR] ', '! ')}
                          </div>
                        ))
                      }
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* PAGE 3: RECOVERIES */}
        {activePage === 'recoveries' && (
          <div className="absolute inset-0 flex flex-col h-full bg-[#030303] overflow-y-auto p-2 md:p-6">
             <div className="flex items-center justify-between mb-4 md:mb-6 border-b border-[#222] pb-2 md:pb-4 sticky top-0 bg-[#030303] z-10">
               <div>
                 <h2 className="text-[12px] md:text-[14px] text-white uppercase tracking-widest flex items-center gap-2">
                   <div className="w-2 h-2 bg-[#00FFA3] shadow-[0_0_8px_rgba(0,255,163,0.8)]"></div>
                   Identified Assets
                 </h2>
                 <p className="text-[9px] md:text-[10px] text-[#666] uppercase mt-1">Total {found.length} records in local memory</p>
               </div>
               {found.length > 0 && (
                 <button onClick={exportFoundWallets} className="bg-[#111] hover:bg-[#222] border border-[#333] py-1 md:py-1.5 px-2 md:px-3 text-[9px] md:text-[10px] text-[#00FFA3] uppercase flex items-center gap-2">
                   <Download size={12} /> DUMP
                 </button>
               )}
             </div>

             {found.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-[#333] text-[12px] uppercase">
                 <Search size={32} className="mb-4 text-[#222]" />
                 Storage array empty
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {found.map((item, i) => {
                     const d = new Date(item.timestamp);
                     return (
                       <div key={i} className="border border-[#222] bg-[#050505] p-4 group relative overflow-hidden text-[10px]">
                         <div className="absolute top-0 right-0 bg-[#00FFA3]/10 text-[#00FFA3] px-2 py-1 text-[9px] font-bold border-b border-l border-[#00FFA3]/20 z-10">
                           +\${item.totalValue.toFixed(2)}
                         </div>
                         <div className="flex gap-4 mb-3 items-center">
                           <div className="text-[#555]">{isNaN(d.getTime()) ? 'UNKNOWN' : d.toLocaleTimeString()}</div>
                           <button onClick={() => removeWallet(i)} className="text-[#444] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto z-10">
                             <Trash2 size={12} />
                           </button>
                         </div>
                         <div className="mb-3">
                           <div className="text-[#555] uppercase tracking-widest mb-1 text-[8px]">Mnemonic Vector</div>
                           <div className="text-[#aaa] font-mono break-all bg-[#000] p-2 border border-[#111] selection:bg-[#DC1FFF]/30">{item.seed}</div>
                         </div>
                         <div>
                           <div className="text-[#555] uppercase tracking-widest mb-1 text-[8px]">Address (SOL)</div>
                           <div className="flex justify-between items-center text-[#888] font-mono bg-[#000] p-2 border border-[#111]">
                             <span className="truncate pr-4" title={item.addresses?.solana}>{item.addresses?.solana || 'N/A'}</span>
                             <span className="text-white shrink-0">{item.balances?.sol?.amount?.toFixed(4) || "0.0000"}</span>
                           </div>
                         </div>
                       </div>
                     )
                  })}
               </div>
             )}
          </div>
        )}

      </main>
    </div>
  );
`;

content = content.replace(returnRegex, newReturn);
fs.writeFileSync('src/App.tsx', content);
