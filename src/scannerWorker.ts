import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import axios from 'axios';

const PATH_SOLANA = "m/44'/501'/0'/0'";

let PRICES = { solana: 150 };

async function updatePrices() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { timeout: 3000 });
    const data = response.data;
    if (data && data.solana) {
      PRICES.solana = data.solana.usd;
    }
  } catch (error) {}
}

function deriveSolanaAddress(seed: Buffer) {
  try {
    const { key } = derivePath(PATH_SOLANA, seed.toString('hex'));
    return Keypair.fromSeed(key).publicKey.toBase58();
  } catch { return null; }
}

let rpcIndex = 0;
function getActiveRpc(rpcs: string[]) {
  if (!rpcs || rpcs.length === 0) return 'https://api.mainnet-beta.solana.com';
  const url = rpcs[rpcIndex % rpcs.length];
  rpcIndex++;
  return url;
}

async function checkSolanaBalance(address: string, rpcs: string[]) {
  let lastError = null;
  for (let i = 0; i < 3; i++) { // Try up to 3 times
    try {
      const url = getActiveRpc(rpcs);
      const host = new URL(url).hostname;
      self.postMessage({ type: 'log', data: `[REQ] ${address.substring(0, 8)}... > ${host}` });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0', 
          id: 1, 
          method: 'getBalance', 
          params: [address]
        }),
        signal: controller.signal
      }).catch(err => {
        clearTimeout(timeoutId);
        throw err;
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        if (data && data.result !== undefined) {
           const val = (data.result.value || 0) / 1e9;
           self.postMessage({ type: 'log', data: `[RES] ${host} > base58:${address.substring(0, 4)}... = ${val} SOL` });
           return val;
        }
      } else if (res.status === 429) {
        self.postMessage({ type: 'log', data: `[ERR] ${host} > 429 Rate Limited` });
        // Rate limited, delay significantly before next attempt
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        lastError = new Error('Rate limited');
      } else if (res.status === 401 || res.status === 403) {
        // Auth or quota issues
        self.postMessage({ type: 'log', data: `[ERR] ${host} > 403 Forbidden` });
        await new Promise(r => setTimeout(r, 5000));
        lastError = new Error('Auth/Quota issue');
      } else if (res.status >= 500) {
        self.postMessage({ type: 'log', data: `[ERR] ${host} > ${res.status} Server Error` });
        await new Promise(r => setTimeout(r, 1000));
        lastError = new Error('Server error');
      }
    } catch (e: any) {
       // Ignore network errors or timeouts and try next RPC
       let errorMsg = e.message || 'Network Error';
       if (e.name === 'AbortError' || errorMsg.includes('aborted')) {
         errorMsg = 'Timeout (Queued too long)';
       }
       self.postMessage({ type: 'log', data: `[ERR] Fetch > ${errorMsg}` });
       await new Promise(r => setTimeout(r, 200)); // small delay on hard network error
       lastError = e;
    }
  }
  throw lastError || new Error("Failed to check balance");
}

async function scanWallet(seedPhrase: string, rpcs: string[]) {
  const seedBuffer = bip39.mnemonicToSeedSync(seedPhrase);
  
  const solAddress = deriveSolanaAddress(seedBuffer);
  if (!solAddress) throw new Error("Derivation failed");

  let solAmount = 0;
  let isVerified = false;
  
  try {
    solAmount = await checkSolanaBalance(solAddress, rpcs);
    isVerified = true;
  } catch (error) {
    // We throw to avoid indicating this was successfully scanned
    throw error;
  }
  
  const value = solAmount * PRICES.solana;

  return {
    seed: seedPhrase,
    addresses: { solana: solAddress },
    balances: {
      sol: { amount: solAmount, value: value }
    },
    totalValue: value,
    hasFunds: solAmount > 0,
    timestamp: Date.now(),
    isVerified
  };
}

async function checkSolanaBalancesBatch(addresses: string[], rpcs: string[]) {
  let lastError = null;
  for (let i = 0; i < 3; i++) {
    try {
      const url = getActiveRpc(rpcs);
      const host = new URL(url).hostname;
      self.postMessage({ type: 'log', data: `[REQ] Batch ${addresses.length} > ${host}` });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', 
          id: 1, 
          method: 'getMultipleAccounts', 
          params: [addresses, { encoding: 'jsonParsed' }]
        }),
        signal: controller.signal
      }).catch(err => {
        clearTimeout(timeoutId);
        throw err;
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        if (data && data.result !== undefined) {
          const accounts = data.result.value || [];
          self.postMessage({ type: 'log', data: `[RES] ${host} > batch of ${addresses.length} scanned` });
          return accounts.map((acc: any) => {
             if (acc && acc.lamports) {
                return acc.lamports / 1e9;
             }
             return 0;
          });
        }
      } else if (res.status === 429) {
        self.postMessage({ type: 'log', data: `[ERR] ${host} > 429 Rate Limited` });
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        lastError = new Error('Rate limited');
      } else if (res.status === 401 || res.status === 403) {
        self.postMessage({ type: 'log', data: `[ERR] ${host} > 403 Forbidden` });
        await new Promise(r => setTimeout(r, 5000));
        lastError = new Error('Auth/Quota issue');
      } else if (res.status >= 500) {
        self.postMessage({ type: 'log', data: `[ERR] ${host} > ${res.status} Server Error` });
        await new Promise(r => setTimeout(r, 1000));
        lastError = new Error('Server error');
      }
    } catch (e: any) {
       let errorMsg = e.message || 'Network Error';
       if (e.name === 'AbortError' || errorMsg.includes('aborted')) {
         errorMsg = 'Timeout (Queued too long)';
       }
       self.postMessage({ type: 'log', data: `[ERR] Fetch > ${errorMsg}` });
       await new Promise(r => setTimeout(r, 200));
       lastError = e;
    }
  }
  throw lastError || new Error("Failed to check balances");
}

let isScanning = false;
let currentRpcs: string[] = [];

self.onmessage = async (e) => {
  const { type, rpcs, concurrency } = e.data;

  if (type === 'start') {
    isScanning = true;
    currentRpcs = rpcs;
    updatePrices();
    
    const requestedLoad = concurrency || 5;
    
    // Start multiple parallel loops
    for (let i = 0; i < requestedLoad; i++) {
        runScan();
        // Stagger slightly
        await new Promise(r => setTimeout(r, 50));
    }
  } else if (type === 'stop') {
    isScanning = false;
  }
};

async function runScan() {
  while (isScanning) {
    const seed = bip39.generateMnemonic(128);
    
    try {
      const result = await scanWallet(seed, currentRpcs);
      self.postMessage({ type: 'result', data: result });
      
      await new Promise(r => setTimeout(r, 5));
    } catch (e) {
      await new Promise(r => setTimeout(r, 500)); // slightly longer delay on error
    }
  }
}

