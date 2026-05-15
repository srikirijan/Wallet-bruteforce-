import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Ensure global Buffer is available in worker
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

self.onmessage = async (e) => {
  const { batchSize, id, mnemonic } = e.data;
  
  if (mnemonic) {
    try {
       const seedBuffer = bip39.mnemonicToSeedSync(mnemonic);
       const derivedSeed = derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex')).key;
       const keypair = Keypair.fromSeed(derivedSeed);
       const address = keypair.publicKey.toBase58();
       self.postMessage({ id, address });
    } catch (err) {
       self.postMessage({ id, error: err instanceof Error ? err.message : 'Unknown error' });
    }
    return;
  }
  
  const results = [];
  
  try {
    for (let i = 0; i < batchSize; i++) {
       const m = bip39.generateMnemonic();
       const seedBuffer = bip39.mnemonicToSeedSync(m);
       const derivedSeed = derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex')).key;
       const keypair = Keypair.fromSeed(derivedSeed);
       const address = keypair.publicKey.toBase58();
       results.push({ mnemonic: m, address });
    }
    
    self.postMessage({ id, results });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
