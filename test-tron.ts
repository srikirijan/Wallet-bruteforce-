import * as bip32Lib from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import { Wallet } from 'ethers';
import { getBytes } from 'ethers';
import crypto from 'crypto';
import bs58 from 'bs58';

const bip32 = bip32Lib.default(ecc);

const seed = bip39.mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');

function deriveTronAddress(seedBuffer: Buffer) {
  const root = bip32.fromSeed(seedBuffer);
  const child = root.derivePath("m/44'/195'/0'/0/0");
  const privateKey = child.privateKey;
  if (!privateKey) return null;
  const wallet = new Wallet('0x' + Buffer.from(privateKey).toString('hex'));
  
  const addressBytes = getBytes(wallet.address);
  const tronBytes = new Uint8Array(21);
  tronBytes[0] = 0x41;
  tronBytes.set(addressBytes, 1);
  
  const hash0 = crypto.createHash('sha256').update(tronBytes).digest();
  const hash1 = crypto.createHash('sha256').update(hash0).digest();
  const checksum = hash1.subarray(0, 4);
  
  const buffer = Buffer.concat([tronBytes, checksum]);
  return bs58.encode(buffer);
}

console.log('TRON:', deriveTronAddress(seed));
