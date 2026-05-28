const sodium = require('libsodium-wrappers');

const getSodium = async () => {
  await sodium.ready;
  return sodium;
};

const generateKeyPair = async () => {
  const s = await getSodium();
  const keypair = s.crypto_box_keypair();
  return {
    publicKey:  Buffer.from(keypair.publicKey).toString('base64'),
    privateKey: Buffer.from(keypair.privateKey).toString('base64'),
  };
};

const fromBase64Safe = (s, b64str) => {
  const str = b64str.trim();
  try {
    return s.from_base64(str, s.base64_variants.ORIGINAL);
  } catch {
    try {
      return s.from_base64(str, s.base64_variants.URLSAFE);
    } catch {
      try {
        return s.from_base64(str, s.base64_variants.ORIGINAL_NO_PADDING);
      } catch {
        return s.from_base64(str, s.base64_variants.URLSAFE_NO_PADDING);
      }
    }
  }
};

const encryptMessage = async (message, recipientPublicKeyB64) => {
  const s = await getSodium();
  const messageBytes    = s.from_string(message);
  const recipientPubKey = fromBase64Safe(s, recipientPublicKeyB64);
  const encrypted       = s.crypto_box_seal(messageBytes, recipientPubKey);
  return Buffer.from(encrypted).toString('base64');
};

const decryptMessage = async (encryptedB64, recipientPublicKeyB64, recipientPrivateKeyB64) => {
  const s = await getSodium();

  const encrypted  = fromBase64Safe(s, encryptedB64);
  const publicKey  = fromBase64Safe(s, recipientPublicKeyB64);
  const privateKey = fromBase64Safe(s, recipientPrivateKeyB64);

  let decrypted;
  try {
    decrypted = s.crypto_box_seal_open(encrypted, publicKey, privateKey);
  } catch (e) {
    throw new Error('Decryption failed — wrong key or corrupted message');
  }

  if (!decrypted) throw new Error('Decryption failed — wrong private key');
  return s.to_string(decrypted);
};

const encryptSymmetric = async (message, keyB64) => {
  const s     = await getSodium();
  const key   = fromBase64Safe(s, keyB64);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const msg   = s.from_string(message);
  const encrypted = s.crypto_secretbox_easy(msg, nonce, key);
  return {
    ciphertext: Buffer.from(encrypted).toString('base64'),
    nonce:      Buffer.from(nonce).toString('base64'),
  };
};

const decryptSymmetric = async (ciphertextB64, nonceB64, keyB64) => {
  const s          = await getSodium();
  const ciphertext = fromBase64Safe(s, ciphertextB64);
  const nonce      = fromBase64Safe(s, nonceB64);
  const key        = fromBase64Safe(s, keyB64);
  const decrypted  = s.crypto_secretbox_open_easy(ciphertext, nonce, key);
  if (!decrypted) throw new Error('Symmetric decryption failed');
  return s.to_string(decrypted);
};

const generateSymmetricKey = async () => {
  const s   = await getSodium();
  const key = s.randombytes_buf(s.crypto_secretbox_KEYBYTES);
  return Buffer.from(key).toString('base64');
};

module.exports = {
  getSodium,
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  encryptSymmetric,
  decryptSymmetric,
  generateSymmetricKey,
};