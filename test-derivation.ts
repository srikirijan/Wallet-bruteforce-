import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

async function test() {
  const mnemonic = bip39.generateMnemonic();
  console.log("mnemonic:", mnemonic);
  const seedBuffer = await bip39.mnemonicToSeed(mnemonic);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex')).key;
  const keypair = Keypair.fromSeed(derivedSeed);
  const realAddress = keypair.publicKey.toBase58();
  console.log("address:", realAddress);
}
test();
